---
name: wechat-miniprogram
description: Use when building or reviewing a native WeChat Mini Program (微信小程序) with WXML/WXSS/JS or TS. Enforces setData discipline, page-stack and 分包 rules, a server-side login flow that never ships AppSecret, 隐私协议 handling, and the checks that avoid 审核 rejections.
---
# WeChat Mini Program conventions

This skill applies to native 微信小程序 projects (the `app.json` / `pages/` /
`components/` layout opened in 微信开发者工具), in JavaScript or TypeScript.
It is not for uni-app or Taro; use `uni-app-cross-platform` for those. "Good"
here means: pages stay under the platform's hard limits, `setData` calls are
small and rare, nothing secret is in the client bundle, and the first 审核
pass succeeds.

## Non-negotiables

- **`setData` carries the smallest possible diff.** Pass changed paths
  (`'list[3].status'`, `'form.name'`), never the whole `list` or `data`
  object. Each call serialises to the render layer; a 200 KB payload on a
  mid-range phone is a visible stutter.
- **No `setData` inside loops or on every scroll/touch event.** Batch
  into one call per user action; throttle scroll handlers to ≥100 ms.
- **The page stack holds at most 10 pages.** `navigateTo` beyond that fails
  silently. Flows that loop (list → detail → list) use `redirectTo`;
  tab roots use `switchTab`; post-login resets use `reLaunch`.
- **The main package stays small; everything not on the first screen goes in
  a 分包.** The main package limit is 2 MB and the overall limit with
  subpackages is in the tens of MB; check the current 限制 in 微信公众平台
  before relying on the exact number. Put the tab pages and `app.js`
  dependencies in main, every other feature in its own subpackage.
- **AppSecret never appears in client code.** Login is `wx.login()` →
  send `code` to your server → the server calls `code2session` → the server
  returns its own session token. Decrypting phone numbers and `unionid`
  lookups also happen server-side.
- **Every network call goes through one `request` wrapper** that attaches
  the session token, maps HTTP and business errors to one shape, and
  handles 401 by re-running login once.
- **Sensitive APIs are gated by 隐私协议.** Camera, location, album,
  clipboard read, contacts and phone number require a declared 隐私协议 in
  the 公众平台 and a user-visible prompt; call `wx.getPrivacySetting` and
  present `wx.requirePrivacyAuthorize` before the first use.
- **Users can browse before logging in.** Forcing login on launch is a
  common 审核 rejection unless the product cannot function anonymously.
- **Every `wx:for` has a stable `wx:key`** that is an id, never the index
  for lists that reorder or delete.
- **Request domains are HTTPS and registered** in 服务器域名 before 真机
  testing. "Works in the simulator, fails on phone" is almost always this.

## Workflow

1. **Read `app.json`, `project.config.json` and one existing page** before
   writing code. Note the component library, whether it is TS, the
   `subPackages` layout, and the `request` wrapper location.
2. **Place the page.** New feature → new or existing 分包 unless it is a tab
   page. Add it to `pages` of the right package, then to the navigation
   source (tab bar or the parent page's link).
3. **Design the data shape for `setData`.** Flat keys for things that change
   often; nest only what changes together. Keep anything not rendered
   (timers, raw responses, maps) on `this` as plain properties, not in
   `data`.
4. **Write the page logic:** `onLoad` for one-time parameter parsing and the
   first fetch, `onShow` for refresh when returning from a child page,
   `onPullDownRefresh` / `onReachBottom` for lists, `onUnload` to clear
   timers and listeners.
5. **Write WXML/WXSS last**, with `rpx` for layout and `px` for borders and
   hairlines, images given explicit width and height.
6. **Test on 真机 via 预览 or 真机调试**, not only the simulator: domain
   whitelist, privacy prompts, keyboard behaviour and package size are only
   real there. Upload as 体验版 and run the privacy flows once more before
   提交审核.

## Patterns

### Minimal setData

```js
// wrong: whole list re-sent for one status change
this.data.list[i].status = 'done'
this.setData({ list: this.data.list })

// right: path update, payload is one string
this.setData({ [`list[${i}].status`]: 'done' })
```

### Pagination with a guard

```js
async loadMore() {
  if (this.loading || this.finished) return
  this.loading = true                                   // not in data, not rendered
  const page = await api.orders({ page: this.page + 1, size: 20 })
  this.page += 1
  this.setData({
    list: this.data.list.concat(page.items),
    finished: page.items.length < 20,
  })
  this.loading = false
}
```

Lists longer than ~500 items should either be paged server-side or rendered
with a recycling list component; a plain `wx:for` over thousands of nodes
exhausts memory on low-end phones.

### Login wrapper used by `request`

```js
let loginPromise = null
export function ensureSession() {
  if (wx.getStorageSync('token')) return Promise.resolve()
  if (!loginPromise) {
    loginPromise = new Promise((resolve, reject) => {
      wx.login({
        success: ({ code }) =>
          api.loginWithCode(code).then((r) => { wx.setStorageSync('token', r.token); resolve() }, reject),
        fail: reject,
      })
    }).finally(() => { loginPromise = null })
  }
  return loginPromise                                   // concurrent callers share one login
}
```

### Privacy gate before a sensitive API

```js
async function withPrivacy(fn) {
  const { needAuthorization } = await wx.getPrivacySetting()
  if (needAuthorization) await wx.requirePrivacyAuthorize()   // shows the 隐私协议 prompt
  return fn()
}
withPrivacy(() => wx.chooseLocation())
```

### Custom component with `observers` instead of manual sync

```js
Component({
  properties: { value: { type: Number, value: 0 } },
  observers: {
    value(v) { this.setData({ text: formatMoney(v) }) },   // derive once, where the input changes
  },
})
```

Share cross-component logic with `behaviors`; do not copy `methods` blocks
between components.

### Global state

`getApp().globalData` is for values needed on most pages during one launch
(user profile, system info). Anything that must survive a restart goes to
`wx.setStorageSync`. Anything that changes often and is rendered by several
pages belongs in a small store module with subscribe/unsubscribe in
`onShow`/`onHide`, not in `globalData`.

## Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| `navigateTo` does nothing after a few clicks | Page stack hit 10 | Use `redirectTo` for loops, check stack with `getCurrentPages().length` |
| Works in simulator, `request:fail` on phone | Domain not in 服务器域名 or HTTP | Register HTTPS domain; do not tick "不校验合法域名" in release builds |
| List flickers / phone heats up | `setData` on every scroll event | Throttle, send only changed paths |
| Upload fails with package size error | Images or node_modules in main package | Move assets to CDN, features to 分包, enable 预下载 for the first subpackage |
| Camera/location API returns `fail privacy permission` | No 隐私协议 declared or not prompted | Declare in 公众平台, gate with `getPrivacySetting` |
| 审核 rejected: "缺少类目" / "强制登录" | Category not set, or login wall on launch | Set 类目 matching the content, allow anonymous browsing |
| Phone number is empty after decrypt | Decrypting in client with stale session | Send `code` from `getPhoneNumber` to the server, decrypt there |
| Data fetched twice on return | Fetch in both `onLoad` and `onShow` | `onLoad` loads, `onShow` refreshes only when a flag says a child changed data |
| Timer keeps running after leaving page | Not cleared in `onUnload` | Store timer id on `this`, clear in `onUnload` and `onHide` |
| Styles leak between components | Global selectors in component WXSS | Keep component styles scoped; avoid tag and `*` selectors |
| Text misaligned on some devices | Layout in `px`, not `rpx` | `rpx` for widths and spacing; `px` only for 1px borders |
| TS errors on `wx.*` | Typings missing | Add `miniprogram-api-typings` to devDependencies and `tsconfig` `types` |
| Skyline page renders differently | Unsupported CSS under Skyline | Check `renderer` in page json; stay on WebView unless Skyline features are needed and tested |

## Before you finish

- [ ] No `setData` sends a whole list or the entire `data` object; none runs
      in a loop or an unthrottled scroll handler.
- [ ] Navigation choice (`navigateTo` / `redirectTo` / `switchTab` /
      `reLaunch`) is deliberate; looping flows cannot exceed 10 pages.
- [ ] New pages are in a 分包 unless they are tab pages; main package is
      under the limit after `npm run build` / 上传.
- [ ] Login goes through the shared wrapper; no AppSecret, no decrypt in
      client code.
- [ ] Every sensitive API call is behind the privacy gate and the 隐私协议
      is declared.
- [ ] All request domains are HTTPS and registered; "不校验域名" is off.
- [ ] Each `wx:for` has a stable id `wx:key`; images have explicit sizes.
- [ ] Timers and listeners are cleared in `onUnload`.
- [ ] Tested on 真机 (预览 or 真机调试), not only the simulator, and the
      体验版 was opened once by someone without developer rights.
