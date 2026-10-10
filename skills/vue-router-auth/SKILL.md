---
name: vue-router-auth
description: Use when adding routes, navigation guards, login/logout flows, permission-driven menus or button-level permissions to a Vue 3 + Vue Router 4 app. Enforces a single dynamic-route registration after login, correct 401/403 handling, keep-alive tab caching that actually works, and guards that never loop.
---
# Vue Router, auth and permissions

This skill covers the routing layer of an admin app: static vs permission
routes, the login guard, redirect-back, menu generation, button permissions
and `<keep-alive>` tabs. "Good" means a user with a stale token lands on login
exactly once, a user with no permission sees 403 instead of a blank page, and
closing a tab frees its memory. Skip it for marketing sites with no login.

## Non-negotiables

- **Two route tables, never one.** `constantRoutes` (login, 403, 404,
  redirect, dashboard) are registered at router creation. `asyncRoutes` are
  filtered by the user's permissions and added with `router.addRoute()`
  after login. Mixing them means the login page itself gets permission-checked.
- **Register dynamic routes exactly once per session**, tracked by a store
  flag (`routesAdded`). The guard checks the flag, not the token, to decide
  whether to add routes. Re-adding on every navigation duplicates routes and
  the warnings hide real bugs.
- **After `addRoute`, re-navigate by returning `{ ...to, replace: true }` from the guard.**
  The current navigation was resolved before the routes existed, so it would
  resolve to 404. `replace: true` keeps the back button sane.
- **The 404 catch-all (`/:pathMatch(.*)*`) is added last, after dynamic
  routes.** Register it in `asyncRoutes` tail or add it manually after the
  loop. A catch-all in `constantRoutes` swallows every dynamic path.
- **Whitelist by path, not by name**, and keep the list under 5 entries
  (`/login`, `/403`, `/404`, `/redirect/*`). A long whitelist is a sign that
  the auth check belongs in the API layer instead.
- **Distinguish three failures and handle each in one place.** No token:
  guard redirects to login. Token expired (401): the axios interceptor
  clears the store and redirects once. Forbidden (403): the guard or
  interceptor sends to `/403`, never to login, because re-logging in does
  not help.
- **Redirect back after login via `?redirect=`** carrying `to.fullPath`.
  Validate it is a relative path starting with `/` before using it to avoid
  open redirects.
- **Guards do no async work on every navigation.** Fetching user info happens
  once (when `routesAdded` is false). A guard that awaits an API call on each
  route change adds 100–300 ms to every click.
- **Menus come from the route table's `meta`**, not from a second
  hand-written list. Two sources of truth drift within a month.
- **`<keep-alive include>` matches the component's `name`, so the `.vue`
  file must declare `defineOptions({ name: 'UserList' })` equal to the route
  name.** Without it the include list silently does nothing.
- **Logout resets the store, removes dynamic routes and hard-redirects.**
  `router.removeRoute()` per added name, or simply
  `location.href = '/login'` to drop all in-memory state. The second is
  acceptable; a half-reset is not.

## Workflow

1. **Inspect the existing guard** (`router/permission.ts` or
   `router/guard.ts`): find the token source, the whitelist, where
   `addRoute` is called and what flag prevents re-adding. Do not add a second
   guard; extend the one that exists.
2. **Classify the new page**: public (constant), authenticated-only
   (asyncRoutes without `meta.perms`), or permission-gated
   (`meta.perms: ['user:list']`). Pick the matching route array.
3. **Define the route** with `name`, lazy `component: () => import(...)`,
   `meta: { title, icon, perms, keepAlive, hidden }`. The name is the tab key
   and the keep-alive key, so it is unique and matches `defineOptions`.
4. **Add button permissions** with `v-permission="'user:delete'"` on the
   element or `hasPerm('user:delete')` inside logic. Both read the same
   permission set from the store.
5. **Verify three journeys by hand or Playwright**: fresh visit to a deep
   link while logged out → login → lands on the deep link; expired token on
   an API call → login once, no loop; user without the permission →
   `/403`, and the menu item is absent.

## Patterns

### The guard skeleton

```ts
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (WHITE_LIST.includes(to.path)) return true
  if (!auth.token) return { path: '/login', query: { redirect: to.fullPath } }
  if (auth.routesAdded) return true
  try {
    await auth.fetchUserInfo()                      // once per session
    buildRoutes(auth.perms).forEach((r) => router.addRoute(r))
    router.addRoute(NOT_FOUND)                      // catch-all last
    auth.routesAdded = true
    return { ...to, replace: true }                 // re-run against new table
  } catch {
    auth.reset()
    return { path: '/login', query: { redirect: to.fullPath } }
  }
})
```

### Filtering routes by permission

```ts
function buildRoutes(perms: Set<string>, routes = asyncRoutes): RouteRecordRaw[] {
  return routes.flatMap((r) => {
    const need = r.meta?.perms as string[] | undefined
    if (need && !need.some((p) => perms.has(p))) return []
    const children = r.children ? buildRoutes(perms, r.children) : undefined
    if (r.children && children!.length === 0) return []   // drop empty parents
    return [{ ...r, children }]
  })
}
```

Dropping parents with no visible children keeps the menu from showing empty
groups.

### Safe redirect-back

```ts
// wrong: open redirect
router.push(route.query.redirect as string)

// right
const target = String(route.query.redirect ?? '/')
router.push(target.startsWith('/') && !target.startsWith('//') ? target : '/')
```

### 401 handling in the API layer, not the guard

```ts
let redirecting = false
api.interceptors.response.use(undefined, (err) => {
  if (err.response?.status === 401 && !redirecting) {
    redirecting = true
    useAuthStore().reset()
    router.replace({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } })
      .finally(() => (redirecting = false))
  }
  return Promise.reject(err)
})
```

Five parallel requests failing with 401 must produce one redirect, hence the
flag.

### Button permission directive

```ts
app.directive('permission', {
  mounted(el, { value }) {
    const perms = useAuthStore().perms
    const need = Array.isArray(value) ? value : [value]
    if (!need.some((p) => perms.has(p))) el.parentNode?.removeChild(el)
  },
})
```

Remove the element rather than hiding it: a hidden button still submits with
Enter and still shows in the DOM for a curious user. The server still checks.

### Keep-alive tabs

```vue
<router-view v-slot="{ Component }">
  <keep-alive :include="tabsStore.cachedNames">
    <component :is="Component" :key="route.fullPath" />
  </keep-alive>
</router-view>
```

`cachedNames` holds component names, which equal route names by convention.
Closing a tab removes its name from the list; `keep-alive` then unmounts it
on the next navigation.

## Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| Infinite redirect between `/login` and `/` | Guard redirects to login, login page is not whitelisted, or `routesAdded` never set | Whitelist `/login`; set the flag before returning |
| Deep link shows 404 after login | Navigation resolved before `addRoute` | Return `{ ...to, replace: true }` after adding |
| Every page is 404 for everyone | Catch-all registered in `constantRoutes` | Add catch-all after dynamic routes |
| Duplicate route name warnings | `addRoute` runs on each navigation | Gate on `routesAdded` |
| Menu shows a group with no pages | Parent kept after children filtered out | Drop parents whose children are empty |
| Tab closed but component still polling | Component `name` differs from route name | `defineOptions({ name })` equal to route name |
| Page keeps old data when reopened | Cached by keep-alive, no refresh | Reload in `onActivated`, not `onMounted` |
| Login page bounces back to itself | `?redirect=/login` carried over | Never store `/login` as redirect target |
| User logs out, next user sees old menu | Store reset without removing routes | `removeRoute` each added name, or hard redirect |
| 401 triggers five login redirects | No single-flight flag in interceptor | Add `redirecting` flag |
| Guard adds 200 ms to every click | `await fetchUserInfo()` on each navigation | Fetch once, gated by flag |
| Scroll position wrong on back | No `scrollBehavior` | `scrollBehavior: (to, from, saved) => saved ?? { top: 0 }` |

## Before you finish

- [ ] New route is in the correct table (constant vs async) with a unique `name`.
- [ ] `component` is lazy (`() => import()`), `meta` has title and, if gated, `perms`.
- [ ] If `meta.keepAlive`, the component declares `defineOptions({ name })` equal to the route name.
- [ ] Catch-all is still the last route after your change.
- [ ] Gated buttons use `v-permission` / `hasPerm`, and the server also enforces the permission.
- [ ] Walked the three journeys: logged-out deep link, expired token, missing permission.
- [ ] No new async work in `beforeEach` that runs on every navigation.
