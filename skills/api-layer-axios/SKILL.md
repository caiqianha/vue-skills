---
name: api-layer-axios
description: Use when creating or touching HTTP request code in a Vue app — axios instances, interceptors, typed API modules, cancellation, 401 refresh, file downloads and error display. Enforces a thin normalising request layer so components never see raw axios and business errors are handled in one place.
---
# API layer with axios

This skill covers `src/api/**`, `src/utils/request.ts` (or wherever the axios
instance lives) and every place a component talks to a backend. "Good" means
a component imports a typed function, awaits it, and gets either data or a
thrown error that someone else already displayed. It assumes the common
Chinese backend envelope `{ code, data, msg }` with `code === 0` or `200` for
success; adapt the constant, not the pattern. It does not cover GraphQL or
WebSocket.

## Non-negotiables

- **One axios instance per backend**, created in one file with `baseURL`,
  `timeout` (10 s default, longer only per request for uploads/exports) and
  interceptors. Components never import `axios` directly.
- **Interceptors only normalise.** Request: attach auth header, trace id.
  Response: unwrap the envelope, turn business failure codes into a thrown
  `ApiError`. No navigation, no store writes, no `ElMessage` here, with one
  exception: the global 401 handler.
- **Typed API modules per domain** (`api/user.ts`, `api/order.ts`) export
  functions like `listUsers(params): Promise<Page<User>>`. URLs, method names
  and param shapes live only there. A component containing a URL string is a
  bug.
- **Errors are shown once, by the layer nearest the user that knows the
  context.** Default policy: the request layer shows `ElMessage.error(msg)`
  for business errors unless the call passes `{ silent: true }`; the component
  then handles the thrown error for UI state only. Pick the policy once and
  write it in the request file header.
- **Stale and duplicate requests are cancelled with `AbortController`**, not
  with a hand-rolled pending map keyed by URL that cancels legitimate parallel
  calls. Cancellation errors are swallowed, never displayed.
- **401 refresh is single-flight.** One refresh in progress, all other 401s
  wait on the same promise and replay. A second 401 during replay logs out.
- **Retry only idempotent GETs**, at most twice, with backoff, and only on
  network errors or 5xx. Retrying a POST duplicates orders.
- **Never log the Authorization header or the token** in interceptors, error
  reporters or console output.
- **Downloads go through one helper** that handles the blob, reads the filename
  from `Content-Disposition`, and detects a JSON error body that came back
  with a 200 (common when the export fails server-side).

## Workflow

1. **Find the existing instance and envelope convention.** Read the request
   file and one API module; match the success code, the `data` unwrap and the
   error type already in use. Do not create a second instance for the same
   backend.
2. **Add or extend the domain module.** One function per endpoint, named
   `verbNoun` (`listUsers`, `getUser`, `createUser`, `updateUser`,
   `removeUser`, `exportUsers`). Types for params and responses next to it or
   in `types/`.
3. **Call it from a composable or store, not directly in template handlers**,
   unless the page is trivial. Pass `signal` from the composable so the list
   can cancel.
4. **Handle the thrown error only for UI state** (`error.value = e`), never
   re-display it unless the call was `silent`.
5. **Verify with devtools**: offline mode shows one message, not three;
   a 401 triggers one refresh; the download helper saves with the right name.

## Patterns

### Instance and interceptors

```ts
export class ApiError extends Error { constructor(public code: number, msg: string, public raw?: unknown) { super(msg) } }

const http = axios.create({ baseURL: import.meta.env.VITE_API_BASE, timeout: 10_000 })

http.interceptors.request.use((cfg) => {
  const token = useAuthStore().token
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

http.interceptors.response.use(
  (res) => {
    if (res.config.responseType === 'blob') return res            // downloads handled elsewhere
    const { code, data, msg } = res.data
    if (code === 0) return data
    throw new ApiError(code, msg || '请求失败', res.data)
  },
  async (err) => {
    if (axios.isCancel(err)) throw err                            // silent
    if (err.response?.status === 401) return handle401(err)       // the one allowed side effect
    const msg = err.response?.data?.msg ?? (err.code === 'ECONNABORTED' ? '请求超时' : '网络异常')
    throw new ApiError(err.response?.status ?? -1, msg, err)
  },
)
```

Display is added once, in a thin wrapper, so `silent` is respected:

```ts
export async function request<T>(cfg: AxiosRequestConfig & { silent?: boolean }): Promise<T> {
  try { return await http.request<T, T>(cfg) }
  catch (e) {
    if (!axios.isCancel(e) && !cfg.silent) ElMessage.error((e as Error).message)
    throw e
  }
}
```

### Domain module

```ts
// api/user.ts
export const listUsers = (params: UserQuery, signal?: AbortSignal) =>
  request<Page<User>>({ url: '/users', params, signal })
export const createUser = (body: UserForm) => request<void>({ url: '/users', method: 'post', data: body })
export const exportUsers = (params: UserQuery) =>
  http.request<Blob>({ url: '/users/export', params, responseType: 'blob', timeout: 60_000 })
```

### Cancelling stale list requests

```ts
let ctrl: AbortController | undefined
async function load(q: UserQuery) {
  ctrl?.abort()
  ctrl = new AbortController()
  rows.value = (await listUsers(q, ctrl.signal)).list
}
```

Pair this with the sequence counter from `vue3-composition`; abort covers the
network, the counter covers responses that already arrived.

### Single-flight 401 refresh

```ts
let refreshing: Promise<string> | null = null
async function handle401(err: AxiosError) {
  const cfg = err.config as AxiosRequestConfig & { _retried?: boolean }
  if (cfg._retried) return logoutAndReject(err)
  refreshing ??= refreshToken().finally(() => { refreshing = null })
  const token = await refreshing.catch(() => logoutAndReject(err))
  cfg._retried = true
  cfg.headers!.Authorization = `Bearer ${token}`
  return http.request(cfg)
}
```

### Download helper

```ts
export async function downloadFile(req: Promise<AxiosResponse<Blob>>, fallbackName: string) {
  const res = await req
  if (res.data.type.includes('json')) {                      // server returned an error envelope as 200
    const { msg } = JSON.parse(await res.data.text())
    throw new ApiError(-1, msg || '导出失败')
  }
  const cd = res.headers['content-disposition'] ?? ''
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(cd)
  const name = m ? decodeURIComponent(m[1]) : fallbackName
  const url = URL.createObjectURL(res.data)
  Object.assign(document.createElement('a'), { href: url, download: name }).click()
  URL.revokeObjectURL(url)
}
```

## Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| Three error toasts for one outage | Component, composable and interceptor all display | One display point; `silent` flag for the rest |
| Export saves `download` with no extension | Filename not read from headers, or header not exposed | Parse `Content-Disposition`; backend adds `Access-Control-Expose-Headers` |
| Export "succeeds" with a 1 KB file | JSON error body returned as blob | Check `blob.type` before saving |
| Burst of logouts after token expiry | Every 401 refreshes independently | Single-flight promise and `_retried` flag |
| Cancelled search shows "网络异常" | Cancel error not filtered | `axios.isCancel` check first |
| Parallel detail calls get cancelled | Pending map keyed by URL | Per-call `AbortController` owned by the composable |
| Duplicate orders on flaky network | Retry on POST | Retry GET only, or backend idempotency key |
| Token in error-reporting payload | Logging full config | Strip `headers.Authorization` before logging |
| Upload fails at 10 s | Global timeout | Per-request `timeout` for uploads/exports |
| Component tests hit real network | Component imports `axios` directly | Import from the API module and mock it |
| Prod calls dev backend | `baseURL` hard-coded | `import.meta.env.VITE_API_BASE` per mode |

## Before you finish

- [ ] No `axios` import and no URL string outside `src/api/**` and the request file.
- [ ] New endpoints have typed params and return types.
- [ ] Interceptors contain no navigation, store writes or toasts except 401 handling.
- [ ] Business errors display exactly once; `silent` works.
- [ ] List calls accept `signal`; cancellation is swallowed.
- [ ] 401 path is single-flight and tested with an expired token.
- [ ] Downloads use the shared helper and survive a JSON error body.
- [ ] Nothing logs the token.
