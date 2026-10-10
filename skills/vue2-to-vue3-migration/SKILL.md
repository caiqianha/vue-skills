---
name: vue2-to-vue3-migration
description: Use when planning or executing a Vue 2 to Vue 3 migration, including Element UI to Element Plus and Vuex to Pinia. Enforces an audit-first, incremental path through @vue/compat with a migration log, and forbids feature rewrites while migrating.
---
# Vue 2 → Vue 3 migration

This skill applies when a Vue 2.x codebase (usually Vue 2.6/2.7 + Element UI
+ Vuex + vue-router 3, built by vue-cli) needs to run on Vue 3. "Good" means
the app ships on Vue 3 with the same behaviour, in slices small enough that
each one can be reviewed and rolled back. Do not apply to a project that is
being rewritten from scratch, and do not apply to a Vue 2.7 project whose
owners only want Composition API: that is a one-day upgrade, not a migration.

## Non-negotiables

- **Audit before editing.** Count every compat-affected pattern (see Workflow
  step 1) and write the numbers down. Teams routinely estimate "a week" for
  codebases that have 400 filters and 60 mixins; the audit turns the guess
  into a number.
- **Migrate, don't improve.** No feature changes, no "while I'm here"
  refactors, no renames. A migration PR that also changes behaviour cannot
  be bisected when something breaks in production.
- **One axis per PR.** Build tool, Vue core, UI library, state, router are
  separate PRs with separate QA. Mixing Element Plus and Pinia into one PR
  doubles the surface for regressions and halves the chance of finding the
  cause.
- **`@vue/compat` is the default path for anything over ~150 components.**
  Big-bang only when the app is small enough to fully re-test in one day.
  Compat lets the app run while warnings are burned down file by file.
- **Keep a migration log** (`MIGRATION.md`) listing each compat warning
  category, its count, the owner and the PR that cleared it. Without it,
  three people fix the same warning and nobody knows what is left.
- **Vue 2.7 first.** It ships `<script setup>`, `defineComponent` and
  Composition API with the Vue 2 renderer, so components can be converted
  before the runtime swap and the swap itself becomes a smaller diff.
- **Pin versions explicitly.** `vue`, `@vue/compat`, `@vue/compiler-sfc`,
  `element-plus`, `vue-router`, `pinia` are pinned to exact versions during
  the migration. Caret ranges pull in breaking minors mid-migration.
- **Every converted module gets a smoke test before merge**: open the page,
  run its primary action, confirm no console warnings from `@vue/compat`.
  "It compiles" is not a test on a migration.
- **Freeze new Vue 2-only patterns on day one.** Add an ESLint rule or review
  rule that rejects new filters, mixins, `$listeners`, `$children` and event
  bus usage. Otherwise the target moves while you chase it.

## Workflow

1. **Audit.** Run greps over `src/` and record counts in `MIGRATION.md`:
   `.vue` files, `filters:` and `| ` in templates, `mixins:`, `$listeners`,
   `$children`, `$set(` / `$delete(`, `$on(` / `$off(` / `$once(` (event bus),
   `Vue.prototype.`, `Vue.use(`, `Vue.component(`, `.sync`, `v-model` on
   custom components, `slot=` / `slot-scope=` (old slot syntax),
   `this.$store`, `mapState` / `mapGetters`, `el-` tags, `v-deep` / `/deep/`,
   `beforeDestroy` / `destroyed`, `inheritAttrs`, `functional:`,
   `render(h)`, `$scopedSlots`, `new Vue(`. Group by directory and note the
   top 10 files by hit count.
2. **Decide the path.** Under ~50 components with ≥80% of logic in a few
   files: big-bang. Over that: compat. Vue 2.7 only (no Vue 3): if the UI
   library cannot move (a custom fork of Element UI with no Element Plus
   port) and the team has no capacity, say so explicitly and stop.
3. **Build tool.** Move vue-cli/webpack to Vite with `@vitejs/plugin-vue2`
   (or stay on webpack 5 with the Vue 2.7 loader if the project has custom
   webpack plugins that have no Vite equivalent). Ship this alone; it already
   finds broken imports, case-sensitive paths and `require()` in modules.
4. **Vue 2.7.** Upgrade, replace `@vue/composition-api` imports with `vue`,
   convert the busiest mixins to composables. Ship.
5. **Vue 3 + `@vue/compat`.** Swap the runtime with the compat alias and
   `MODE: 2`, get the app to boot, then raise `compatConfig` per feature as
   warnings are cleared. Ship behind a feature flag or to a staging host
   for at least one full regression cycle.
6. **Element UI → Element Plus.** Install side by side is not possible
   (both register `el-*`), so this is a single PR per app or per
   lazy-loaded route group. Use the audit's `el-` counts to size it.
7. **Vuex → Pinia.** Module by module. Keep the Vuex store mounted until the
   last module moves; Pinia and Vuex coexist fine.
8. **vue-router 4.** `createRouter` + `createWebHistory`, `router.addRoute`
   instead of `addRoutes`, navigation guards return values instead of
   calling `next()`.
9. **Remove compat.** Set `MODE: 3`, fix the remaining warnings, drop the
   alias, delete `compatConfig`. Ship. Close `MIGRATION.md` with the
   final counts.

## Patterns

### Filters → functions

```vue
<!-- Vue 2 -->
<span>{{ price | currency }}</span>

<!-- Vue 3: import once, call in template -->
<span>{{ currency(price) }}</span>
```

Put former global filters in `src/utils/format.ts` and register nothing
globally. Over ~20 call sites, do a scripted codemod and review the diff;
hand-editing filters across 300 files produces inconsistent results.

### Mixins → composables

```ts
// Vue 2 mixin: hidden state, name collisions
export default { data: () => ({ loading: false }), methods: { withLoading(fn) {/*...*/} } }

// Composable: explicit inputs and outputs
export function useLoading() {
  const loading = ref(false)
  async function withLoading<T>(fn: () => Promise<T>) {
    loading.value = true
    try { return await fn() } finally { loading.value = false }
  }
  return { loading, withLoading }
}
```

Convert the mixins used by the most components first; each conversion
removes a whole class of implicit-`this` bugs.

### `$listeners` and `$attrs`

```vue
<!-- Vue 2 -->
<child v-bind="$attrs" v-on="$listeners" />

<!-- Vue 3: listeners are part of $attrs -->
<child v-bind="$attrs" />
```

Set `inheritAttrs: false` (or `defineOptions({ inheritAttrs: false })`) on
wrapper components that forward `$attrs` manually, or events fire twice.

### Event bus

```ts
// Vue 2: new Vue() as a bus
bus.$on('refresh', handler)

// Vue 3: mitt (or a Pinia action + watch). Always unsubscribe.
const bus = mitt<{ refresh: void }>()
bus.on('refresh', handler)
onUnmounted(() => bus.off('refresh', handler))
```

Where the bus only carried "refresh the list", replace it with a Pinia
store version counter and `watch` it; the bus hides the data flow.

### `.sync` and component `v-model`

```vue
<!-- Vue 2 -->
<dialog :visible.sync="show" />
<picker v-model="val" />   <!-- prop: value, event: input -->

<!-- Vue 3 -->
<dialog v-model:visible="show" />
<picker v-model="val" />   <!-- prop: modelValue, event: update:modelValue -->
```

Custom components that implemented `value`/`input` must be updated at the
same time as their callers; compat mode keeps both working until then.

### Element UI → Element Plus

Changes that hit almost every admin app, stated to the level the author is
confident about; verify the rest against the installed version's types:

- Icons are components: `<el-icon><Search /></el-icon>` from
  `@element-plus/icons-vue`, not `class="el-icon-search"`.
- `size` values are `large` / `default` / `small`; `medium` and `mini` are
  gone. Grep and map `mini → small`, `medium → default`.
- `el-dialog`, `el-drawer`: `:visible.sync` → `v-model`.
- `el-table` column slot props are still `{ row, column, $index }`;
  `el-table-column` `type="index"` and `selection` unchanged.
- Date pickers return `Date` objects unless `value-format` is set; code that
  assumed strings will break on submit. Set `value-format` explicitly.
- `el-dropdown` uses `@command`; `el-dropdown-item` `command` unchanged.
- `ElMessage`, `ElMessageBox`, `ElNotification` are imported from
  `element-plus`, not read from `this.$message`; with auto-import they still
  need their CSS imported once.
- `el-form` validation: `validate()` returns a Promise and also accepts a
  callback; `resetFields()` requires `prop` on every `el-form-item` to work.
- Locale: `ElConfigProvider` with `zh-cn` from `element-plus/es/locale`,
  not `Vue.use(ElementUI, { locale })`.

### Lifecycle and global API

```ts
// Vue 2
beforeDestroy() {}, destroyed() {}
Vue.prototype.$http = http
new Vue({ router, store, render: h => h(App) }).$mount('#app')

// Vue 3
beforeUnmount() {}, unmounted() {}
app.config.globalProperties.$http = http   // prefer provide/inject or imports
createApp(App).use(router).use(pinia).mount('#app')
```

## Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| App boots on compat but every page logs 50 warnings | `MODE: 2` with no per-feature config | Burn down by category from `MIGRATION.md`, biggest count first |
| Styles disappear after Element Plus | `/deep/` and `>>>` no longer compile | `:deep(.el-input__inner)` |
| Table checkbox selection lost after refresh | `row-key` missing now that `reserve-selection` needs it | Add `row-key="id"` |
| Dialog content keeps old form after reopen | `destroy-on-close` default differs; `resetFields` without `prop` | Set `destroy-on-close` or add `prop` to every item |
| Date range submits `Date` objects, backend 400 | Element Plus pickers return `Date` by default | `value-format="YYYY-MM-DD"` |
| Events fire twice on wrapper component | `$attrs` now includes listeners and the wrapper also binds `$listeners` | Remove the `v-on="$listeners"` |
| `this.$refs.form.validate(valid => ...)` never called | Validation now rejects instead of calling with `false` in some paths | `await formRef.value.validate()` in `try/catch` |
| `router.addRoutes is not a function` | vue-router 4 removed it | Loop `router.addRoute(route)` |
| Guard hangs, page never navigates | `next()` called and a value returned | Return the target or `true`; never call `next` in router 4 |
| `Vue.set is not a function` | Global API removed | Direct assignment; reactivity now covers new keys |
| Global component missing on one page | `Vue.component` registration replaced by auto-import plugin that missed a dynamic `<component :is>` | Register that one component explicitly |
| `$children` undefined | Removed in Vue 3 | Template refs or `provide`/`inject` |
| Third-party Vue 2 plugin crashes on `install` | Plugin reads `Vue.prototype` | Find the Vue 3 build; if none, wrap or replace before the runtime swap |
| Tests fail on `mount` | `@vue/test-utils` v1 vs v2 API | Upgrade to v2 with the runtime swap, not before |

## Before you finish

- [ ] `MIGRATION.md` has audit counts, the chosen path and a dated entry for
  this PR.
- [ ] This PR changes exactly one axis (build / core / UI / state / router /
  compat removal) and no feature behaviour.
- [ ] Every page touched was opened; its primary action works; console shows
  no `@vue/compat` warnings for categories marked cleared.
- [ ] No new filters, mixins, `$listeners`, `$children`, event-bus calls were
  introduced.
- [ ] Element Plus date pickers that submit to an API have `value-format`.
- [ ] `vue-tsc --noEmit` (or the project's type-check) and the existing unit
  tests pass.
- [ ] Versions of `vue`, `@vue/compat`, `element-plus`, `vue-router`,
  `pinia` are pinned.
