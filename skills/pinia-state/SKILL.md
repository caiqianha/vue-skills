---
name: pinia-state
description: Use when adding or refactoring Pinia stores, or deciding whether state belongs in a store, a composable or the server. Enforces setup-style stores, clear ownership of async and errors, whitelisted persistence and small domain stores instead of one global bag.
---
# Pinia state management

This skill applies to `src/stores/**` in Vue 3 apps using Pinia 2.1+. "Good"
means every store answers "who else reads this?" with at least two pages, and
a page-local piece of state never lands in a store just because a store felt
official. SSR and Nuxt are out of scope.

## Non-negotiables

- **Setup stores (`defineStore('x', () => {...})`)**, not options stores.
  They compose with composables, infer types without generics and match the
  `<script setup>` mental model. Mixing both styles in one project is worse
  than either.
- **A store holds state shared across pages or sessions**: user/session,
  permissions and menus, dictionaries (字典), app settings, cross-page drafts.
  Page-local state (a table's query, a dialog's visibility) lives in the
  component or a composable. Server lists are not stored; they are fetched by
  the page that shows them.
- **Actions own async and error handling.** A component calls
  `await store.loadDicts()` and reads `store.error`; it never wraps a store
  action in its own try/catch to set store state.
- **Components read via `storeToRefs(store)` for state and getters, and call
  actions directly.** Destructuring the store itself loses reactivity, the
  #1 Pinia bug report.
- **Persist a whitelist, never the whole store.** Token and user profile:
  yes. Loading flags, errors, in-flight promises: never. Persisted state
  needs a `version` and a migration path or it breaks on the next deploy.
- **One store per domain, under ~200 lines.** `useAppStore` with 40 refs is
  a global variable with extra steps. Split by who changes it.
- **Setup stores need an explicit `$reset`**: Pinia cannot infer initial state
  for them. Write a `reset()` action and call it on logout.
- **Store-to-store calls happen inside actions**, by calling `useOtherStore()`
  inside the action body, not at module top level, so import order and tests
  stay sane.
- **Never store non-serialisable objects** (class instances, DOM nodes, axios
  instances) in state. Keep them in module scope or `markRaw`.

## Workflow

1. **Classify the state** before writing any code: local / shared / server.
   Only "shared" gets a store. Write the decision in the PR description if it
   is not obvious.
2. **Name it by domain**: `useAuthStore`, `useDictStore`, `usePermissionStore`.
   File `stores/auth.ts`. One `defineStore` per file.
3. **Write state, getters (`computed`), actions (functions) in that order**,
   return all of them. Private helpers stay unreturned.
4. **Add persistence last**, with an explicit `paths` whitelist and a
   `version`.
5. **Test the action, not the component**: `setActivePinia(createPinia())`,
   mock the API module, assert state after `await action()`. For component
   tests use `createTestingPinia({ stubActions: true })`.

## Patterns

### Setup store with reset

```ts
export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(null)
  const user = ref<UserProfile | null>(null)
  const loading = ref(false)
  const isLoggedIn = computed(() => !!token.value)

  async function login(payload: LoginForm) {
    loading.value = true
    try {
      const res = await apiLogin(payload)          // ApiError already displayed by the api layer
      token.value = res.token
      user.value = res.user
    } finally { loading.value = false }
  }
  function reset() { token.value = null; user.value = null; loading.value = false }

  return { token, user, loading, isLoggedIn, login, reset }
}, { persist: { paths: ['token', 'user'] } })    // whitelist, not `persist: true`
```

### Reading in a component

```ts
// wrong: loses reactivity
const { user, isLoggedIn } = useAuthStore()

// right
const auth = useAuthStore()
const { user, isLoggedIn } = storeToRefs(auth)
auth.login(form)
```

### Dictionary store with request de-duplication

```ts
export const useDictStore = defineStore('dict', () => {
  const dicts = shallowRef<Record<string, DictItem[]>>({})
  const inflight = new Map<string, Promise<DictItem[]>>()  // module-scope, not state

  function load(type: string) {
    if (dicts.value[type]) return Promise.resolve(dicts.value[type])
    if (!inflight.has(type)) {
      inflight.set(type, fetchDict(type).then((items) => {
        dicts.value = { ...dicts.value, [type]: items }
        return items
      }).finally(() => inflight.delete(type)))
    }
    return inflight.get(type)!
  }
  const label = (type: string, value: unknown) => dicts.value[type]?.find((d) => d.value === value)?.label ?? String(value ?? '')
  return { dicts, load, label }
})
```

Ten columns on one page asking for the same dictionary must produce one
request.

### Store-to-store

```ts
// wrong: top-level, runs before pinia is active in tests
const auth = useAuthStore()
export const usePermissionStore = defineStore('permission', () => { ... })

// right
export const usePermissionStore = defineStore('permission', () => {
  async function build() {
    const auth = useAuthStore()                     // inside the action
    routes.value = buildRoutes(auth.user!.roles)
  }
})
```

### Logout clears everything

```ts
export function logout() {
  for (const reset of [useAuthStore().reset, usePermissionStore().reset, useDictStore().reset]) reset()
  router.replace('/login')
}
```

A forgotten reset shows the previous user's menus to the next one on a shared
machine.

## Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| Template never updates after login | Store destructured without `storeToRefs` | `storeToRefs` for state and getters |
| Previous user's menu after re-login | No reset on logout | `reset()` actions called in `logout()` |
| App crashes after deploy on old localStorage | Persisted shape changed | `version` + migrate, or namespaced key per release |
| `loading: true` forever after refresh | Loading flag persisted | Whitelist `paths` |
| "getActivePinia was called with no active Pinia" | Store used at module top level | Call `useXStore()` inside functions/setup |
| Same dictionary requested 10× per page | No in-flight de-dup | Cache promise per key |
| Store action swallowed error, page shows stale data | `try/catch` returning silently | Rethrow after setting `error`, or let the api layer show it |
| Giant store, every change touches it | Everything in `useAppStore` | Split by domain |
| Tests fail with proxied class instance | Class in state | `markRaw` or keep in module scope |
| `$reset` is not a function | Setup store | Write `reset()` manually |
| Component tests trigger real API | Actions not stubbed | `createTestingPinia({ stubActions: true })` |

## Before you finish

- [ ] New state was classified; page-local state is not in a store.
- [ ] Store is setup-style, one per file, under ~200 lines.
- [ ] Components use `storeToRefs`; no destructuring of the store.
- [ ] Persistence is a whitelist with a version.
- [ ] `reset()` exists and `logout()` calls every store's reset.
- [ ] Cross-store calls are inside actions.
- [ ] Repeated loads of the same resource are de-duplicated.
- [ ] Action has a unit test with the API module mocked.
