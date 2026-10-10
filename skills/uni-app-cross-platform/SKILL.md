---
name: uni-app-cross-platform
description: Use when building or reviewing a uni-app project (Vue 3 + Vite) that targets WeChat Mini Program, H5 and/or App. Enforces pages.json as the routing source of truth, 条件编译 confined to a platform layer, a single request wrapper, 分包 configuration, and per-target verification before claiming done.
---
# uni-app cross-platform conventions

This skill applies to uni-app projects on Vue 3 + Vite (`uni-app` CLI or
HBuilderX) that ship to at least two of: 微信小程序 (MP-WEIXIN), H5, App
(APP-PLUS). It builds on `vue3-composition`; read that first for component
rules. "Good" here means platform differences live in one folder, every
target builds and runs, and nobody discovers a broken platform after
release. Do not apply to native 微信小程序 code; use `wechat-miniprogram`.

## Non-negotiables

- **`pages.json` is the only routing truth.** Routes, tab bar, navigation
  bar style and 分包 are declared there; never hand-roll a router on top
  unless the project already has `uni-simple-router` and a reason.
- **条件编译 lives at the edges.** `#ifdef MP-WEIXIN` / `H5` / `APP-PLUS`
  blocks are allowed in `src/utils/platform/`, in `pages.json` and in
  `App.vue`. A page or business component containing more than one
  `#ifdef` is a sign the abstraction is missing.
- **One `request` wrapper around `uni.request`** with token injection, a
  unified error shape, timeout, and a per-platform `baseURL`. Pages never
  call `uni.request` directly.
- **Components follow `easycom` naming** (`components/xx-yy/xx-yy.vue`)
  so they are auto-registered on every platform; no manual `components:`
  registration mixed with easycom.
- **`rpx` for layout, `px` for hairlines.** Mixed units for the same
  measurement produce different results per platform.
- **No `*` or tag selectors in page styles** and no `:deep()` reaching into
  third-party components without a comment; MP-WEIXIN ignores or rejects
  these and the result silently diverges from H5.
- **`nvue` only for App pages that need native long lists or video
  performance.** It has a different CSS subset; do not convert pages to
  `nvue` "for speed" without a measured problem.
- **Images are either CDN URLs or small local assets under ~40 KB.**
  Local images bloat the MP main package; dynamic local paths break under
  the MP build.
- **Every `uni.$on` has a matching `uni.$off`** in `onUnload` /
  `onUnmounted`. The global event bus outlives pages and leaks handlers.
- **A change is done only when it is verified on each configured target**
  (at least `dev:mp-weixin` in 开发者工具 and `dev:h5` in a browser).

## Workflow

1. **Read `pages.json`, `manifest.json`, `vite.config`, and
   `src/utils/platform/`** before adding anything. Note the target list,
   `easycom` rules, `subPackages`, H5 `router.mode` and `base`, and the
   request wrapper.
2. **Register the page in `pages.json`** in the right 分包, with its
   `navigationBarTitleText` and, if custom, `navigationStyle: "custom"`.
3. **Write platform-neutral code first.** When a capability differs
   (payment, share, file download, map), add a function to
   `utils/platform/` with the `#ifdef` branches inside it and a single
   exported signature.
4. **Handle layout chrome once:** status bar height from
   `uni.getSystemInfoSync().statusBarHeight`, safe-area insets via
   `env(safe-area-inset-bottom)`, custom nav bar as a shared component.
5. **Wire data through the request wrapper** and composables as in
   `vue3-composition`; `onLoad(options)` receives query params as strings,
   parse and validate them.
6. **Run every target.** `npm run dev:mp-weixin` and open `dist/dev/mp-weixin`
   in 微信开发者工具; `npm run dev:h5`; App via HBuilderX 真机运行 if App is a
   target. Then build once (`build:mp-weixin`) to catch size limits.

## Patterns

### Platform layer, not scattered ifdefs

```ts
// src/utils/platform/share.ts
export function shareToFriend(opts: ShareOptions) {
  // #ifdef MP-WEIXIN
  return Promise.resolve(opts)             // MP uses onShareAppMessage; return config
  // #endif
  // #ifdef H5
  return navigator.share?.(opts) ?? copyLink(opts.path)
  // #endif
  // #ifdef APP-PLUS
  return new Promise((resolve, reject) => uni.share({ ...toAppShare(opts), success: resolve, fail: reject }))
  // #endif
}
```

Pages call `shareToFriend(...)` and contain no `#ifdef`.

### Request wrapper

```ts
export function request<T>(opts: UniApp.RequestOptions & { url: string }): Promise<T> {
  return new Promise((resolve, reject) => {
    uni.request({
      timeout: 15000,
      ...opts,
      url: BASE_URL + opts.url,                       // BASE_URL from platform/env.ts
      header: { Authorization: `Bearer ${getToken()}`, ...opts.header },
      success: ({ statusCode, data }) => {
        const res = data as ApiResponse<T>
        if (statusCode === 401) return reject(new AuthError())
        if (statusCode >= 400 || res.code !== 0) return reject(new ApiError(res.message, res.code))
        resolve(res.data)
      },
      fail: (e) => reject(new NetworkError(e.errMsg)),
    })
  })
}
```

### Navigation

```ts
// wrong: string concatenation, no encoding, unbounded stack
uni.navigateTo({ url: '/pages/detail/detail?title=' + title })

// right
uni.navigateTo({ url: `/pages/detail/detail?id=${encodeURIComponent(id)}` })
// detail page
onLoad((q) => { id.value = String(q?.id ?? '') })      // params are strings
```

`navigateTo` is capped at 10 pages on MP; use `redirectTo` for loops and
`reLaunch` after login, exactly as in native mini programs.

### Safe area and custom nav bar

```vue
<view class="page" :style="{ paddingTop: statusBarHeight + 'px' }">
  <nav-bar title="订单" />            <!-- easycom: components/nav-bar/nav-bar.vue -->
  <scroll-view scroll-y class="body" />
  <view class="footer" />            <!-- css: padding-bottom: env(safe-area-inset-bottom) -->
</view>
```

### Event bus with cleanup

```ts
onMounted(() => uni.$on('order:updated', refresh))
onUnmounted(() => uni.$off('order:updated', refresh))   // same function reference
```

Prefer a Pinia store or `onShow` refresh over the event bus; keep the bus
for cross-page notifications only.

## Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| Page works on H5, blank on MP-WEIXIN | Browser-only API (`window`, `document`, `localStorage`) | Use `uni.*` equivalents or wrap in platform layer |
| Styles differ between MP and H5 | `*` / tag selectors, `:deep()`, `vh` units | Class selectors only, `rpx`, test both targets |
| Image shows locally, 404 in build | Dynamic `require` of local path | Static import or CDN URL; local assets only with literal paths |
| `onLoad` params are `undefined` or numbers mismatch | Query is always string, nested objects dropped | Pass ids only, `JSON` only after `encodeURIComponent`, parse on arrival |
| Handler fires N times | `uni.$on` registered on every `onShow` without `$off` | Register once in `onMounted`, remove in `onUnmounted` |
| MP upload rejected for size | Fonts, images, or a library in main package | Move to 分包 / CDN, use `optimization.subPackages: true` in manifest |
| H5 refresh gives 404 | `router.mode: "history"` without server rewrite | Use `hash` mode or configure nginx `try_files` and `base` |
| Custom nav bar overlaps status bar | Fixed height instead of `statusBarHeight` | Read system info once in `App.vue`, provide to components |
| Bottom button hidden behind home indicator | No safe-area padding | `padding-bottom: env(safe-area-inset-bottom)` |
| Component not found on one platform | Folder name does not match `easycom` pattern | `components/<name>/<name>.vue`, restart dev server |
| `nvue` page ignores styles | nvue supports a flexbox subset only | Keep `.vue` unless native rendering is required; test on 真机 |
| TS complains about `uni` | Missing typings | `@dcloudio/types` in devDependencies and `tsconfig` `types` |
| HBuilderX build differs from CLI build | Different compiler versions | Pin `@dcloudio/*` versions; build in CI with the CLI only |
| Payment / login works on one platform only | Logic written for a single platform in a page | Move into `utils/platform/`, one function per capability |

## Before you finish

- [ ] New pages are in `pages.json` (right 分包, nav settings) and reachable.
- [ ] No `#ifdef` in pages or business components; platform differences
      live in `utils/platform/`.
- [ ] All HTTP goes through the request wrapper; `baseURL` comes from env.
- [ ] No browser-only globals outside the H5 branch of the platform layer.
- [ ] Styles use classes and `rpx`; no `*` / tag selectors; `:deep()` has a
      comment.
- [ ] `uni.$on` calls are paired with `uni.$off`; timers cleared.
- [ ] Query params are encoded on send and parsed as strings on receive.
- [ ] Ran `dev:mp-weixin` in 微信开发者工具 and `dev:h5` in a browser (and
      App 真机 if targeted); a `build:mp-weixin` passed the size check.
