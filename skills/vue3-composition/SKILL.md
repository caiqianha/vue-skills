---
name: vue3-composition
description: Use when writing or refactoring Vue 3 components and composables with <script setup>. Enforces reactivity choices (ref vs reactive vs shallowRef), watcher discipline, typed props/emits, and composable boundaries that keep components small and testable.
---
# Vue 3 Composition API conventions

This skill applies to any `.vue` file or `use*.ts` composable in a Vue 3.3+
project. It assumes `<script setup lang="ts">`. It is not a Vue tutorial: it
encodes the choices that separate a component that survives two years of
feature requests from one that gets rewritten. Skip it for Options API code
that is not being migrated.

## Non-negotiables

- **`<script setup lang="ts">` for every new component.** Options API only
  when touching an existing Options API file and the change is under 20 lines.
- **`ref()` by default, `reactive()` only for a group of fields that always
  travel together** (a form model). `reactive` loses reactivity on
  destructuring and on reassignment, which is the #1 "my state stopped
  updating" bug.
- **`shallowRef()` for large or external data**: API lists over ~1k rows,
  chart instances, editor instances, map objects. Deep proxies on those cost
  tens of milliseconds per assignment and break third-party libraries that
  compare identity.
- **Never mutate props.** Emit an event or use `defineModel()`. If you need a
  local editable copy, create it explicitly with `ref(structuredClone(toRaw(props.x)))`
  and say why in a comment.
- **Type props with `defineProps<{...}>()` and emits with
  `defineEmits<{...}>()`.** Runtime-object declarations are allowed only when a
  prop needs a non-trivial `validator`.
- **`computed` is pure.** No side effects, no `await`, no writes to other
  state inside a computed getter. If you need a writable derived value, use
  `computed({ get, set })` and keep the setter one line.
- **Every `watch` has an explicit reason** written next to it. If the reason
  is "sync A into B", replace it with a `computed`. If the reason is "fetch
  when the id changes", prefer `watch(() => props.id, load, { immediate: true })`
  over `onMounted` plus `watch`.
- **Composables return refs, not reactive objects**, so callers can
  destructure. Return `{ data, loading, error, refresh }`, not a `reactive`
  bag.
- **Clean up what you create.** Timers, event listeners, observers and
  subscriptions created in `setup` are removed in `onUnmounted` or via
  `onScopeDispose` inside composables. Memory leaks in admin apps with
  `<keep-alive>` tabs come from here.
- **One component does one thing.** When a `.vue` file passes ~300 lines or
  holds three unrelated `ref`s groups, extract a composable or a child
  component. Do not extract for its own sake under 150 lines.

## Workflow

1. **Read the existing conventions first.** Check two neighbouring components
   for import style, auto-import usage (`unplugin-auto-import` means no
   `import { ref } from 'vue'`), naming (`useXxx`, `XxxView.vue`,
   `XxxDialog.vue`) and whether the project uses `defineOptions({ name })`.
2. **Decide the state shape before writing template.** List the pieces of
   state, mark each as local / prop / store / server, and pick `ref`,
   `reactive`, `shallowRef` deliberately.
3. **Write the composable when logic is reused or exceeds ~40 lines**, even if
   it is used once today. Keep it in the same folder as the component unless a
   second consumer appears.
4. **Write the template last**, binding only to refs/computeds. No business
   logic in template expressions beyond `&&`, `??` and a formatter call.
5. **Run `vue-tsc --noEmit` (or the project's type-check script)** before
   claiming the change compiles. A template type error does not show up in
   `vite dev`.

## Patterns

### Props with defaults

```ts
// wrong: loses types, defaults buried in runtime object
const props = defineProps({ size: { type: String, default: 'md' } })

// right
const props = withDefaults(defineProps<{ size?: 'sm' | 'md' | 'lg'; items: Item[] }>(), {
  size: 'md',
})
```

### Two-way binding

```ts
// wrong: manual prop + emit pair for a simple value
const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [v: string] }>()

// right (Vue 3.4+)
const value = defineModel<string>({ required: true })
```

### Async data in a composable

```ts
export function useList<T>(fetcher: (q: Query) => Promise<Page<T>>) {
  const rows = shallowRef<T[]>([])          // large list, shallow on purpose
  const total = ref(0)
  const loading = ref(false)
  const error = ref<unknown>(null)
  let seq = 0                               // drop out-of-order responses
  async function load(q: Query) {
    const my = ++seq
    loading.value = true
    error.value = null
    try {
      const page = await fetcher(q)
      if (my !== seq) return                // a newer request already landed
      rows.value = page.items
      total.value = page.total
    } catch (e) {
      if (my === seq) error.value = e
    } finally {
      if (my === seq) loading.value = false
    }
  }
  return { rows, total, loading, error, load }
}
```

The sequence counter is mandatory in any list composable: fast typing in a
search box otherwise shows stale results.

### Watch vs computed

```ts
// wrong: watcher used to derive state
watch(items, (v) => { count.value = v.length })

// right
const count = computed(() => items.value.length)
```

### Template refs on child components

```ts
const formRef = ref<InstanceType<typeof ElForm>>()   // Element Plus exposes FormInstance too
// wrong: formRef.value.validate() right after toggling v-if
// right: await nextTick() first, or keep the form mounted and use v-show
```

### Provide / inject

Use only for component trees that are truly coupled (a `Table` and its
`Column`s). For app-wide values use a Pinia store. Always type the key:

```ts
export const TableKey: InjectionKey<TableContext> = Symbol('table')
```

## Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| Destructured state is frozen | `const { a } = reactive(...)` | Use `toRefs(state)` or switch to `ref`s |
| List re-renders every keystroke, UI lags | Deep reactive on 5k rows | `shallowRef`, replace the array instead of pushing |
| Chart/editor library throws on proxied object | Instance wrapped in `ref` | `shallowRef` or `markRaw(instance)` |
| Watcher fires on mount but data undefined | `immediate: true` with async source | Guard `if (!id) return` at top of callback |
| `watch` on `props.x` never fires | Watching a plain value, not a getter | `watch(() => props.x, ...)` |
| Deep watcher costs 50ms per change | `{ deep: true }` on a large object | Watch the specific field, or use `watchEffect` with precise reads |
| Component keeps running after tab closed | Timer or listener not cleared | `onUnmounted` / `onScopeDispose` |
| `await` before `defineProps` breaks the component | Top-level await in `<script setup>` without `<Suspense>` | Move the await into `onMounted` or a composable's `load()` |
| Parent calls child method that is undefined | `<script setup>` is closed by default | `defineExpose({ validate, reset })` |
| Type error only in CI | Template errors invisible to `vite dev` | Run `vue-tsc --noEmit` locally |

## Before you finish

- [ ] No `reactive` is destructured and no prop is mutated.
- [ ] Every `watch` has a comment saying why it is not a `computed`.
- [ ] Lists above ~1k rows and third-party instances use `shallowRef` / `markRaw`.
- [ ] Timers, listeners, observers created in setup are cleaned up.
- [ ] Async loaders drop out-of-order responses.
- [ ] Props and emits are typed; `defineExpose` covers what the parent calls.
- [ ] `vue-tsc --noEmit` passes, and the file is under ~300 lines or has a reason.
