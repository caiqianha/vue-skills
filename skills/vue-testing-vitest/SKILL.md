---
name: vue-testing-vitest
description: Use when adding or fixing tests in a Vue 3 project with Vitest, @vue/test-utils or Playwright. Enforces testing composables and utils first, component tests by behaviour not markup, mocking at the api-module boundary, Pinia/router test setup that does not leak, and a small set of E2E flows kept fast.
---
# Testing Vue 3 with Vitest and Playwright

This skill covers unit tests for composables, utils and stores, component
tests with `@vue/test-utils`, and a thin Playwright layer. "Good" means the
unit suite runs under ~10 s, a failing test names the broken behaviour, and
no test breaks when a class name changes. Do not apply it to generate tests
for every component; untested glue code is better than brittle snapshot
tests that get deleted in the next refactor.

## Non-negotiables

- **Test order of value: utils → composables → stores → components → E2E.**
  Pure functions give the highest confidence per line of test. Components
  are tested only for behaviour a user can observe.
- **No snapshot tests of rendered HTML.** They fail on every markup change
  and nobody reads the diff. Assert on text, emitted events, called mocks
  and `aria`/`data-test` targets instead.
- **Select by `data-test` or role, never by CSS class or Element Plus
  internal structure.** `.el-table__row` changes between minor versions;
  `[data-test="row"]` does not.
- **Mock the API module, not axios.** `vi.mock('@/api/user')` keeps tests
  independent of the request layer and the interceptors. Mocking axios
  means re-testing the interceptor in every component test.
- **Use `createTestingPinia({ stubActions: false })` only when the action
  logic is under test**; default stubbed actions keep component tests about
  the component.
- **Every async test awaits `flushPromises()` (or `nextTick`) before
  asserting.** A green test that asserts before the promise resolves is
  testing nothing.
- **Element Plus is registered once in a global setup file**, not per test.
  Stub heavy components (`ElDialog`, `ElSelect` with `teleport`) with
  `global.stubs` when their internals are irrelevant.
- **Unit suite stays under ~10 s locally.** Use `happy-dom` unless a test
  needs `jsdom` features; put slow integration tests in a separate
  `test:integration` script.
- **Coverage targets by layer, not a global number.** Utils and composables
  ≥ 90% lines; stores ≥ 80%; components judged by behaviour cases, not
  percent. A global 80% gate pushes people to write worthless tests.
- **E2E covers 3–5 critical journeys** (login, the main CRUD page, a
  permission-denied path, logout). Everything else belongs in unit tests
  because a Playwright run costs minutes.
- **Test names read as a sentence**: `it('drops the response when a newer
  request finished first')`. "works" and "test1" are not names.

## Workflow

1. **Look at the existing setup**: `vitest.config.ts` (environment, setup
   files, aliases), `test/setup.ts` (global plugins), where tests live
   (`__tests__/` vs `*.spec.ts` beside the file). Match it.
2. **Pick the lowest layer that proves the behaviour.** If the bug is in a
   formatter, test the formatter, not the page that calls it.
3. **Write the failing test first** with the real inputs from the bug
   report, run it, watch it fail for the right reason.
4. **Mock only the boundary**: the api module, `useRouter` when navigation
   is asserted, time with `vi.useFakeTimers()` for debounce/polling.
5. **Run the whole unit suite**, not just the new file, and check the time.
   If it grew by more than a second, find out why.
6. **Add an E2E test only if the change touches a critical journey**, and
   run it against the dev server with seeded data, never against a shared
   environment.

## Patterns

### Composable with async loader

```ts
vi.mock('@/api/user', () => ({ listUsers: vi.fn() }))
import { listUsers } from '@/api/user'

it('drops the response when a newer request finished first', async () => {
  const slow = deferred<Page>(), fast = deferred<Page>()
  vi.mocked(listUsers).mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise)
  const { rows, load } = useList(listUsers)
  load({ q: 'a' }); load({ q: 'ab' })
  fast.resolve({ items: [{ id: 2 }], total: 1 })
  slow.resolve({ items: [{ id: 1 }], total: 1 })
  await flushPromises()
  expect(rows.value.map((r) => r.id)).toEqual([2])
})
```

`deferred()` is a 5-line helper that exposes `resolve`; write it once in
`test/helpers.ts`.

### Component test by behaviour

```ts
const wrapper = mount(UserList, {
  global: { plugins: [createTestingPinia(), ElementPlus], stubs: { ElDialog: true } },
})
await flushPromises()
await wrapper.get('[data-test="delete-1"]').trigger('click')
expect(wrapper.emitted('delete')).toEqual([[1]])
```

Assert the emitted event, not that a confirm box appeared with a specific
class.

### Router in component tests

```ts
const push = vi.fn()
vi.mock('vue-router', async (orig) => ({ ...(await orig()), useRouter: () => ({ push }) }))
// ...
expect(push).toHaveBeenCalledWith({ name: 'UserDetail', params: { id: 1 } })
```

Use a real `createRouter` with `createMemoryHistory()` only when guards
themselves are under test.

### Fake timers for debounce

```ts
vi.useFakeTimers()
keyword.value = 'a'; keyword.value = 'ab'
await vi.advanceTimersByTimeAsync(300)
expect(listUsers).toHaveBeenCalledTimes(1)
vi.useRealTimers()
```

### Global setup file

```ts
// test/setup.ts
import { config } from '@vue/test-utils'
import ElementPlus from 'element-plus'
config.global.plugins = [ElementPlus]
config.global.stubs = { Teleport: true, Transition: true }
```

Stubbing `Teleport` keeps dialog content inside the wrapper so `find` works.

### Playwright critical path

```ts
test('user without permission sees 403, not a blank page', async ({ page }) => {
  await loginAs(page, 'viewer')
  await page.goto('/system/users')
  await expect(page.getByRole('heading', { name: '403' })).toBeVisible()
})
```

`loginAs` sets the token via the API, not the UI, so each test costs one
request instead of a form fill.

## Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| Test passes but behaviour broken | Assertion ran before promise resolved | `await flushPromises()` |
| `find` returns nothing for dialog content | Rendered via Teleport outside wrapper | Stub `Teleport` globally or `attachTo: document.body` |
| Tests pass alone, fail together | Pinia or mocks shared across files | `setActivePinia(createPinia())` in `beforeEach`, `vi.restoreAllMocks()` |
| Every markup tweak breaks 40 tests | Snapshot tests | Delete them, assert behaviour |
| Test breaks on Element Plus upgrade | Selectors on `.el-*` internals | `data-test` / `getByRole` |
| Suite takes 90 s | `jsdom` everywhere, E2E in unit script | `happy-dom`, separate scripts |
| `useRouter()` is undefined | Component uses router, no mock | Mock `vue-router` or install a memory router |
| Debounce test waits 300 ms real time | Real timers | `vi.useFakeTimers()` + `advanceTimersByTimeAsync` |
| Coverage gate forces junk tests | Global 80% rule | Per-layer thresholds in `vitest.config.ts` |
| E2E flaky on CI | Shared backend, unseeded data | Local server + seeded fixtures, API-based login |
| `ResizeObserver is not defined` | happy-dom lacks it, Element Plus table needs it | Polyfill stub in `setup.ts` |

## Before you finish

- [ ] New test fails without the fix and passes with it (ran both).
- [ ] No snapshot of HTML; selectors are `data-test` or roles.
- [ ] Mocks sit at the api-module boundary; `vi.restoreAllMocks()` runs between tests.
- [ ] Every async assertion is preceded by `flushPromises()`/`nextTick`.
- [ ] Unit suite still runs under ~10 s; slow tests moved to `test:integration`.
- [ ] Test names describe the behaviour in a sentence.
- [ ] E2E added only for a critical journey, logs in via API, uses seeded data.
