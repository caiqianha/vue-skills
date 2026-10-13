# Data fetching decisions in Nuxt 3 / 4

Companion to `nuxt3-app/SKILL.md`. Read when a fetch behaves unexpectedly
(double request, stale data, huge payload) rather than as a tutorial.

## Which primitive

| Situation | Use | Why |
| --- | --- | --- |
| Page/component needs data to render, URL known | `useFetch(url, opts)` | Runs once per request, auto key, forwards cookies to internal routes |
| Data comes from an SDK, two merged requests or a computed source | `useAsyncData(key, handler, opts)` | Same lifecycle, you own the key and the handler |
| User action (submit, click, poll) | `$fetch` or `useRequestFetch()` | No SSR involvement; composables would error or double-fire |
| Data must load once per app, not per page | `callOnce(key, fn)` in `app.vue`/layout | Skips re-running on client after SSR and on later navigations |
| Page should paint before data | `lazy: true` / `useLazyFetch` | Non-blocking navigation; template must handle `status === 'pending'` |
| Only in the browser (depends on `window`, user-specific widget) | `server: false` | Skips SSR; `data` is `default()` on the server render |

## Keys

- `useFetch` derives a key from the file and line plus the URL and options.
  Two `useFetch` calls to the same URL with the same options in two files
  get different keys, so they do not share cache unless you pass `key`.
- `useAsyncData` keys are global. Collisions share `data`, `status`, `error`
  and the cached result; the dev server warns when two handlers differ.
- Include everything that changes the response in the key:
  `` `product-${id}-${locale}` ``. A key that omits `locale` serves the
  previous language after a switch.
- Reactive keys (`key: () => ...`) refetch when the computed value changes.

## Payload size

- The resolved value of every `useFetch`/`useAsyncData` is serialised with
  devalue into the HTML. Check `view-source` size; above ~200 KB of payload
  the time-to-interactive is dominated by parsing it.
- `pick: ['id', 'name']` for flat objects; `transform` for arrays and nested
  shapes. `transform` runs on the server, so heavy mapping happens once.
- Non-serialisable values (class instances, functions, `Map` without a
  reducer) break hydration or arrive as plain objects. Return DTOs.
- Paginate server-side. Returning 5k rows "so the table can filter
  client-side" is the most common payload bug.

## Reactivity and refetching

- Pass refs or getters in `query`, `params`, `body` and `headers` to refetch
  automatically. Passing `query.value` snapshots it.
- `watch: [dep]` adds extra triggers; `watch: false` disables automatic
  refetching entirely, leaving only `refresh()`.
- `immediate: false` with `execute()` for fetches that depend on a user
  choice (a dependent select).
- `dedupe: 'cancel'` (default) aborts the in-flight request when a new one
  starts; `'defer'` returns the in-flight promise instead. Use `'defer'` for
  reference data that many components request at once.

## Caching

- `getCachedData: (key, nuxtApp) => nuxtApp.payload.data[key] ?? nuxtApp.static.data[key]`
  reuses data already in the payload across client navigations; without it,
  returning to a page refetches.
- `clearNuxtData(key)` and `refreshNuxtData(key)` from anywhere (after a
  mutation, call `refreshNuxtData('orders')`).
- For HTTP caching use `routeRules` (`swr`, `isr`, `cache`) on the server
  route, not in-component timers.

## Errors

- `error.value` is a `NuxtError`; `status` becomes `'error'`. Decide per
  page: show inline (`<p v-if="error">`), or throw to the error page with
  `throw createError({ statusCode: 404, fatal: true })` for "resource not
  found" so crawlers get a real 404.
- In server routes throw `createError` with a `statusCode`; a plain `throw`
  becomes a 500 and leaks the message in dev.
- Set `onResponseError` on a shared `$fetch.create` instance for the
  external API to map upstream errors once (the equivalent of the axios
  interceptor in `api-layer-axios`).

## Cookies and headers during SSR

- `useFetch` to a relative URL during SSR calls the Nitro handler directly
  and forwards the incoming request headers, including cookies.
- `$fetch` during SSR does not forward them. Use `useRequestFetch()` for
  the same behaviour, or `useRequestHeaders(['cookie'])` when calling an
  external host.
- Set-Cookie from an internal route during SSR is passed back to the
  browser automatically; from an external host it is not, so proxy login
  through `server/api`.

## Nuxt 4 changes that break Nuxt 3 habits

- `data` starts as `undefined`, not `null`; `v-if="data"` still works,
  `data === null` checks do not.
- `pending` is kept for compatibility but `status` is the source of truth.
- Shallow reactivity by default (`deep: false`): mutating `data.value.items.push()`
  does not update the view. Replace the value or set `deep: true` for that call.
- `dedupe` defaults to `'cancel'`.
- Returning `undefined` from the handler is treated as an error; return
  `null` or a default.
