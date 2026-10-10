---
name: vue-performance
description: Use when a Vue 3 page feels slow, a bundle is too large, a table with many rows lags, or when building a view that will hold large data. Enforces measure-before-optimise, route/component code splitting, shallow reactivity for big data, virtualisation above 1k rows and leak-free keep-alive tabs.
---
# Vue 3 performance

This skill applies to Vite + Vue 3 apps, typically admin dashboards with
large tables, charts and editors. "Good" means the first admin route ships
under ~300 KB of gzipped JS, a 5k-row table scrolls at 60 fps, and memory
stays flat after opening and closing 20 tabs. Do not apply micro-optimisations
(`v-memo`, `v-once`) to pages that are not measured as slow; they cost
readability for nothing.

## Non-negotiables

- **Measure before changing anything.** Vue Devtools "Performance" tab for
  component render time, the browser Performance panel for long tasks,
  `npx vite-bundle-visualizer` for bundle weight. A fix without a before/after
  number is a guess.
- **Every route view is lazy** (`component: () => import('@/views/...')`).
  A single eager import of a chart library in one view adds 500 KB to every
  user's first paint.
- **Heavy widgets are async components**: rich-text editors, code editors,
  map SDKs, PDF viewers, anything over ~100 KB. Wrap with
  `defineAsyncComponent` and load when the dialog opens, not when the page
  mounts.
- **Big data is not deeply reactive.** API lists over ~1k rows go in
  `shallowRef`; chart/editor/map instances are `markRaw` or `shallowRef`.
  Deep proxying 5k objects with 20 fields costs ~100 ms and makes every
  `.push` trigger reactivity.
- **Virtualise above ~1k rows.** Element Plus `el-table-v2` or a virtual
  list. Pagination at 50–100 rows per page is the simpler fix when the
  product allows it.
- **No `deep: true` watchers on objects larger than a form.** Watch the
  specific field. A deep watcher on a 1k-row list traverses every field on
  every change.
- **Debounce user-driven fetches at 300 ms** (search boxes, filters) and
  drop out-of-order responses. Firing a request per keystroke is the most
  common self-inflicted "the backend is slow".
- **Element Plus and icons are imported on demand** via
  `unplugin-vue-components` + `ElementPlusResolver`, and icons individually
  from `@element-plus/icons-vue`. `import * as Icons` pulls ~300 icons into
  the main chunk.
- **Dictionaries and constants over ~100 entries are plain frozen objects**
  (`Object.freeze`) or `markRaw`, never put into a reactive store state.
- **Keep-alive tabs must not leak.** Timers, sockets, `ResizeObserver`,
  window listeners created in a tab are paused in `onDeactivated` and
  cleared in `onUnmounted`.
- **Every `v-for` has a stable `key` from data**, never the index, when the
  list can reorder or filter. Index keys cause DOM reuse bugs and extra
  patches.

## Workflow

1. **Reproduce with a number.** Record the page in the Performance panel,
   note the longest task and the total scripting time; or run
   `vite build` and note the chunk sizes. Write the number down.
2. **Find the dominant cost.** Bundle weight → visualizer. Render time →
   Devtools Performance, sort by component. Interaction lag → Performance
   panel flame chart during the interaction.
3. **Apply the single highest-value fix** from the list below, in this order:
   lazy route → async heavy widget → shallow data → virtualise →
   debounce → targeted watcher → memoisation.
4. **Re-measure.** Keep the change only if the number moved by more than
   noise (~10%). Revert micro-optimisations that did not.
5. **Set a budget in CI** when the project has none: fail the build if the
   entry chunk grows past the agreed gz size (`rollup-plugin-visualizer`
   JSON or `size-limit`).

## Patterns

### Async heavy widget

```ts
// wrong: editor bundle loads with the page even if the dialog never opens
import RichEditor from '@/components/RichEditor.vue'

// right
const RichEditor = defineAsyncComponent({
  loader: () => import('@/components/RichEditor.vue'),
  delay: 200,                       // avoid spinner flash on fast loads
})
```

### Shallow list and replacement

```ts
const rows = shallowRef<Row[]>([])
// wrong: rows.value.push(...) does not trigger on a shallowRef
// right
rows.value = [...rows.value, ...page.items]
```

### Chart instance

```ts
const chart = shallowRef<echarts.ECharts>()
onMounted(() => { chart.value = markRaw(echarts.init(el.value!)) })
onUnmounted(() => chart.value?.dispose())
```

A proxied ECharts instance breaks its internal `===` checks and renders
nothing or throws.

### Debounced search with stale-response guard

```ts
const search = useDebounceFn(load, 300)    // @vueuse/core, or write 5 lines
watch(keyword, () => search())
```

Pair with a sequence counter in `load` (see `vue3-composition`).

### Targeted watcher

```ts
// wrong: traverses every row on any change
watch(form, save, { deep: true })

// right
watch(() => form.status, save)
```

### Keep-alive tab hygiene

```ts
let timer: number | undefined
onActivated(() => { timer = window.setInterval(poll, 10_000) })
onDeactivated(() => clearInterval(timer))
onUnmounted(() => clearInterval(timer))
```

### Manual chunking for vendors

```ts
// vite.config.ts
build: { rollupOptions: { output: { manualChunks: {
  vue: ['vue', 'vue-router', 'pinia'],
  element: ['element-plus'],
  echarts: ['echarts'],
} } } }
```

Split only libraries over ~50 KB; over-splitting creates 60 requests and
slows HTTP/1 proxies.

## Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| First load pulls 2 MB JS | Eager view imports or `import * as Icons` | Lazy routes, individual icon imports |
| Table input lags per keystroke | Deep reactive 5k rows | `shallowRef`, replace array |
| Chart renders blank or throws | Instance wrapped by `ref` | `shallowRef` + `markRaw` |
| Memory grows per opened tab | Timers/observers not cleared under keep-alive | `onDeactivated` + `onUnmounted` cleanup |
| Backend "slow" during search | Request per keystroke, responses out of order | Debounce 300 ms + sequence guard |
| Scrolling a long list janks | 5k DOM rows | Virtual list or pagination |
| Save handler runs 50 times | `deep: true` watcher | Watch the specific field |
| `v-memo` added, nothing faster | Component was not the bottleneck | Measure first, revert |
| Dialog open takes 1 s first time | Async component with no `delay`/loading state | Add `loadingComponent`, prefetch on hover |
| Build produces 80 tiny chunks | Over-eager `manualChunks` or dynamic import per icon | Group by vendor, split only >50 KB |
| Dictionary store triggers re-renders | 2k-entry reactive object in Pinia | `Object.freeze` / `markRaw` the map |
| Images shift layout | No width/height | Set dimensions, `loading="lazy"` for below-fold |

## Before you finish

- [ ] A before/after number (chunk size, render ms or long-task ms) is in the PR description.
- [ ] All route views and widgets over ~100 KB are lazy or async.
- [ ] Lists over ~1k rows use `shallowRef` and are virtualised or paginated.
- [ ] No new `deep: true` watcher on anything bigger than a form model.
- [ ] Search/filter fetches are debounced and drop stale responses.
- [ ] Anything created in `onMounted`/`onActivated` is cleaned up in `onDeactivated`/`onUnmounted`.
- [ ] `v-for` keys come from data ids; `v-memo`/`v-once` are only where measured.
