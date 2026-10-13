---
name: nuxt3-app
description: Use when creating, structuring or debugging a Nuxt 3 or Nuxt 4 application — directory layout, server routes vs an external API, useFetch/useAsyncData, SSR-safe state with useState or Pinia, auth middleware, runtime config, hydration mismatches and choosing a deployment target. Enforces data fetching that runs once per request with stable keys and small payloads, state that never leaks between requests, and config that is read at runtime instead of baked at build.
---
# Nuxt 3 / Nuxt 4 applications

This skill applies to full Nuxt apps (SSR, hybrid or prerendered) built with
Vue 3, usually with Pinia and sometimes Element Plus or Nuxt UI. It covers
the decisions that differ from a plain Vite SPA: where code lives, what runs
on the server, how data reaches the client and how state survives
hydration. "Good" means the page renders once on the server, hydrates
without warnings, and the same build runs in dev, staging and production
with only environment variables changed. Skip it for `ssr: false` SPAs that
only use Nuxt as a file router; `vue3-composition` and `vue-router-auth` are
enough there. Component-level rules still come from `vue3-composition`.

## Non-negotiables

- **Know which major you are on before touching the tree.** Nuxt 4 puts
  app code in `app/` (`app/pages`, `app/components`, `app/app.vue`) and
  keeps `server/`, `shared/`, `public/` at the root; Nuxt 3 has everything
  at the root. `~`/`@` point at `app/` in v4 and at the root in v3, so an
  import that works in one layout silently resolves elsewhere in the other.
- **Fetch in setup with `useFetch`/`useAsyncData`; fetch in handlers with `$fetch`.**
  The composables exist to run once on the server and hand the result to
  the client. Calling them inside a click handler or after `await` of
  something else yields a double request or a "nuxt instance unavailable"
  error.
- **Every `useAsyncData` key is unique per data shape.** Two calls sharing
  a key share cache, state and the first handler that ran. Build keys from
  the resource and its params (`` `user-${id}` ``), never a bare `'data'`.
- **Only what the template needs goes into the payload.** Everything the
  fetch returns is serialised into the HTML (`__NUXT__`). Use `pick` or
  `transform` to drop fields; a 2 MB product list in the payload doubles
  the page weight and the hydration time.
- **No module-level reactive state.** A `ref` created at the top of a
  composable file or store module lives for the whole server process and
  is shared between users. Shared state goes through `useState`, a Pinia
  store (via `@pinia/nuxt`) or `nuxtApp.payload`.
- **Secrets live in `runtimeConfig`, public values in `runtimeConfig.public`,
  and both get a default in `nuxt.config.ts`.** Only keys declared there
  can be overridden by `NUXT_*` environment variables at runtime. A key
  read from `process.env` in a component is frozen at build time or
  `undefined` on the client.
- **Auth state comes from a cookie, not `localStorage`.** The server render
  cannot read `localStorage`, so a token kept there produces a logged-out
  HTML followed by a logged-in flash and a hydration mismatch. Use
  `useCookie` or an httpOnly session cookie read in a server route.
- **Route middleware decides access; server routes verify it again.**
  `defineNuxtRouteMiddleware` runs on both server and client and can be
  bypassed by calling the API directly, so every `server/api` handler that
  returns private data checks the session itself.
- **`import.meta.server` / `import.meta.client` guard browser APIs**, with
  `onMounted` or `<ClientOnly>` for anything that renders differently in
  the browser. `process.server` is deprecated and `window` at setup time
  crashes the server render.
- **Set `compatibilityDate` and the Nitro preset explicitly** once the
  deployment target is known. An auto-detected preset that changes between
  CI and local builds is the usual cause of "works locally, 500 in prod".

## Workflow

1. **Read `nuxt.config.ts`, `package.json` and the directory tree**: Nuxt
   major and whether `future.compatibilityVersion: 4` is set, SSR mode,
   modules (`@pinia/nuxt`, `@nuxtjs/i18n`, `@nuxt/ui`), existing
   `runtimeConfig` keys, `routeRules`, and where auth currently lives.
2. **Decide server routes vs external API.** If the app owns the data or
   must hide an upstream secret, add `server/api/<resource>.<method>.ts`
   and call it with a relative URL. If a backend already exists, call it
   through `$fetch.create({ baseURL: config.public.apiBase })` in a plugin
   and use `server/api` only as a proxy for calls that need a secret.
3. **Place the page** under `pages/` with `definePageMeta` for layout,
   middleware and `keepalive`. Pick the fetch composable: `useFetch` for a
   URL, `useAsyncData` for anything else (SDK call, two requests merged).
   Give it a key, `default`, and `pick`/`transform`.
4. **Choose state scope**: page-local `ref`; cross-component but small →
   `useState('cart')`; domain with actions and several consumers → Pinia
   setup store. Initialise from the payload, never from `localStorage`.
5. **Add middleware** (`middleware/auth.ts` + `definePageMeta({ middleware: 'auth' })`
   or `auth.global.ts`) that returns `navigateTo('/login', { redirectCode: 302 })`
   with a validated `redirect` query. Add the matching session check in
   `server/utils/requireUser.ts` and call it from private handlers.
6. **Run `nuxi build` and start `.output/server/index.mjs` locally** with
   the production env vars, open the page with JavaScript disabled once
   (does the server HTML look right?), then with it enabled and the console
   open (zero hydration warnings). Only then report done.

## Patterns

### useFetch with a stable key and a small payload

```ts
// wrong: key collides with every other 'list', whole response in payload, refetches on each query change twice
const { data } = await useAsyncData('list', () => $fetch('/api/orders', { query: query.value }))

// right
const { data: orders, status, refresh } = await useFetch('/api/orders', {
  key: () => `orders-${JSON.stringify(query.value)}`,
  query,                                     // reactive: refetches when query changes
  default: () => [] as OrderRow[],           // Nuxt 4 data is undefined, not null, before first load
  transform: (res: OrderListDto) => res.items.map(toRow),   // only rows reach the payload
  dedupe: 'cancel',
})
```

Use `status` (`'idle' | 'pending' | 'success' | 'error'`), not the deprecated
`pending`. `lazy: true` (or `useLazyFetch`) when the page should render
before the data; then the template must handle `status === 'pending'`.

### Forwarding cookies to your own API during SSR

```ts
// wrong: $fetch on the server sends no cookies, so /api/me sees an anonymous user
const me = await $fetch('/api/me')

// right: useFetch and useRequestFetch forward the incoming request headers
const { data: me } = await useFetch('/api/me')
const fetchWithCookies = useRequestFetch()           // for calls outside useFetch
```

### Server route with validation and a session check

```ts
// server/api/orders/[id].get.ts
import { z } from 'zod'
const params = z.object({ id: z.string().regex(/^\d+$/) })
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)                            // server/utils, throws 401
  const { id } = await getValidatedRouterParams(event, params.parse)
  const order = await db.order.findFirst({ where: { id: Number(id), ownerId: user.id } })
  if (!order) throw createError({ statusCode: 404, statusMessage: 'Order not found' })
  return order
})
```

`server/middleware/*.ts` runs on every request including assets; use it to
populate `event.context` (parse the session once), never to redirect pages
or return bodies.

### useState vs Pinia vs module scope

```ts
// wrong: shared by every request on the server
const user = ref<User | null>(null)
export function useUser() { return user }

// right for a small shared value
export const useUser = () => useState<User | null>('user', () => null)

// right for a domain with actions: setup store, hydrated by @pinia/nuxt
export const useCartStore = defineStore('cart', () => {
  const items = ref<CartItem[]>([])
  async function load() { items.value = await useRequestFetch()('/api/cart') }
  return { items, load }
})
```

Call `callOnce('cart', () => cart.load())` in `app.vue` or a layout for
data that must load once per request and not again on the client.

### Auth middleware and runtime config

```ts
// middleware/auth.ts
export default defineNuxtRouteMiddleware((to) => {
  const session = useUserSession()                  // nuxt-auth-utils or your own cookie composable; works on server and client
  if (session.loggedIn.value) return
  const redirect = to.fullPath.startsWith('/') && !to.fullPath.startsWith('//') ? to.fullPath : '/'
  return navigateTo({ path: '/login', query: { redirect } })
})
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  runtimeConfig: {
    sessionSecret: '',                                // NUXT_SESSION_SECRET at runtime
    public: { apiBase: '/api' },                      // NUXT_PUBLIC_API_BASE
  },
  routeRules: { '/admin/**': { ssr: false }, '/docs/**': { prerender: true } },
})
```

Private keys are `undefined` on the client by design; read them with
`useRuntimeConfig(event)` inside server routes.

### Hydration mismatch checklist

Work through this list when the console shows "Hydration text/attribute
mismatch" or `data-v-inspector` points at nothing obvious:

1. Time or randomness in render: `Date.now()`, `new Date().toLocale...`,
   `Math.random()`, `crypto.randomUUID()`. Compute in `onMounted` or use
   `useId()` for ids.
2. Locale or timezone formatting: server Node ICU and the browser disagree.
   Format with an explicit `locale` and `timeZone`, or format on the client.
3. Browser-only branching: `isMobile` from `navigator`, `window.innerWidth`,
   `matchMedia`. Use `useRequestHeaders(['user-agent'])` on both sides or
   `<ClientOnly>`.
4. Storage-derived state: anything read from `localStorage`/`sessionStorage`
   during setup. Move to a cookie or `onMounted`.
5. Invalid HTML nesting the browser repairs: `<div>` inside `<p>`, `<a>`
   inside `<a>`, `<tr>` outside `<tbody>`. The server emits it as written,
   the browser restructures it.
6. Third-party scripts or extensions mutating the DOM before hydration.
   Test in a private window before blaming your code.
7. Component rendered under a different `v-if` on each side because the
   store was initialised on the client only. Hydrate it from the payload.
8. Mark the rare legitimate case (live clock) with `data-allow-mismatch`
   (Vue 3.5+) instead of suppressing all warnings.

### Deployment targets in one line each

- **Node server** (`node-server`): `node .output/server/index.mjs`, honours
  `PORT`/`HOST` or `NITRO_PORT`. Default when nothing is detected.
- **Static** (`nuxi generate`): every route prerendered; dynamic routes need
  `nitro.prerender.routes` or crawling from links. No server routes at
  runtime, so `server/api` only works during generation.
- **Vercel / Netlify**: presets auto-detected in their CI; ISR via
  `routeRules: { '/blog/**': { isr: 3600 } }`.
- **Cloudflare Workers/Pages**: no Node built-ins (`fs`, native `crypto`
  streams, long timers), small bundle limits; test the preset locally with
  `nuxi preview`.
- **Docker**: multi-stage, copy only `.output/`, set `NUXT_*` env at run
  time, never bake a `.env` into the image.

More detail on options and edge cases: [references/data-fetching.md](references/data-fetching.md),
[references/deployment-targets.md](references/deployment-targets.md).

## Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| Request fires on server and again on client | `$fetch` in setup, or `useFetch` wrapped in a function called twice | Use `useFetch`/`useAsyncData` directly in setup |
| Two pages show each other's data | Same `useAsyncData` key | Key includes resource and params |
| HTML is 3 MB for a 50-row table | Full API response in the payload | `pick`/`transform` to rows only, paginate server-side |
| `/api/me` returns anonymous during SSR, logged-in on client | `$fetch` without forwarded cookies | `useFetch` or `useRequestFetch()` |
| User A sees user B's name after deploy | Module-level `ref` or store singleton | `useState` or Pinia store created per request |
| `useRuntimeConfig().apiKey` is `undefined` in a component | Private key read on the client | Move the call into a server route |
| Env var set in production is ignored | Key not declared in `runtimeConfig` or name not `NUXT_*` | Declare with a default; `NUXT_PUBLIC_X` for public |
| `.env` works in dev, missing in prod | `.env` is loaded only by `nuxi dev/build` | Set real env vars in the process/container |
| "nuxt instance unavailable" | Composable called after an `await` or in a callback | Call composables synchronously at the top of setup |
| Hydration mismatch on dates | Server and browser locale differ | Explicit locale/timeZone, or format in `onMounted` |
| Logged-out flash before content | Token in `localStorage` | Cookie-based session |
| Middleware passes but API leaks data | Only the route middleware checks | `requireUser(event)` in every private handler |
| `~/components/X` not found after v4 upgrade | Alias now points at `app/` | Move files into `app/` or use `~~/` for root |
| `data.value` is `undefined` in a `v-for` | Nuxt 4 default changed from `null` | Provide `default: () => []` |
| Works with `nuxi dev`, 500 in Cloudflare | Node API used in a server route | Replace with Web APIs or switch preset |
| Prerendered page shows stale data forever | Static output with no revalidation | `isr`/`swr` route rule or a client refetch |

## Before you finish

- [ ] Code sits in the right tree for the Nuxt major (`app/` in v4) and
      aliases resolve as intended.
- [ ] Every `useFetch`/`useAsyncData` has a unique key, a `default`, and
      `pick`/`transform` where the response is larger than the template needs.
- [ ] No `$fetch` or composable call in setup after an `await`; handlers use
      `$fetch`; SSR calls that need cookies go through `useFetch`/`useRequestFetch`.
- [ ] No reactive state at module scope; shared state uses `useState` or Pinia.
- [ ] `runtimeConfig` keys declared with defaults; secrets are not in `public`
      and are never read in client code.
- [ ] Private `server/api` handlers validate input and check the session.
- [ ] Auth middleware validates its `redirect` target; session comes from a cookie.
- [ ] Production build started locally with real env vars; page renders with JS
      disabled and hydrates with zero warnings.
- [ ] `compatibilityDate` and the Nitro preset match the actual target.
