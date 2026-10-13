# i18n in 微信小程序 and uni-app

Companion to `vue-i18n-setup/SKILL.md`. Native 微信小程序 cannot run
`vue-i18n` and WXML cannot call arbitrary JS, so the approach is data
injection rather than a `t()` function. uni-app ships vue-i18n and needs
only configuration.

## Native 微信小程序

### Message tables

```js
// i18n/zh-CN.js and i18n/en.js, same key tree as the web app
module.exports = { common: { save: '保存', cancel: '取消' }, order: { title: '订单', empty: '暂无订单' } }
```

Keep the key tree identical to the web project's locale files and run the
same parity script over both; copying the JSON files into `i18n/` in the
build step is acceptable if the mini-program is in the same monorepo.

### Injecting into pages

```js
// i18n/index.js
const tables = { 'zh-CN': require('./zh-CN'), en: require('./en') }
let current = wx.getStorageSync('locale') || (wx.getAppBaseInfo().language.startsWith('zh') ? 'zh-CN' : 'en')
module.exports = {
  getLocale: () => current,
  t: (key, params = {}) => key.split('.').reduce((o, k) => o?.[k], tables[current])?.replace(/\{(\w+)\}/g, (_, p) => params[p] ?? '') ?? key,
  setLocale(locale) { current = locale; wx.setStorageSync('locale', locale) },
  behavior: Behavior({
    data: { t: tables[current] },
    pageLifetimes: { show() { this.setData({ t: tables[current] }) } },   // components
    lifetimes: { attached() { this.setData({ t: tables[current] }) } },
  }),
}
```

- Pages use `behaviors: [i18n.behavior]` (or spread `data.t` in `onLoad`
  and `onShow`) and WXML reads `{{ t.order.title }}`.
- Only the table for the current locale goes into `data`; `setData` of a
  200 KB table on every page show is too slow, so split big features into
  their own sub-tables injected by the pages that use them.
- Strings in JS (`wx.showToast`, validation messages) use `i18n.t(key, params)`.
- Interpolation in WXML has no function calls; use a WXS module for
  `{count}` substitution or precompute the string in JS into `data`.

### Switching

- After `setLocale`, every page in the stack holds the old table. Either
  `wx.reLaunch` to the home page (simplest, acceptable for a settings
  screen) or iterate `getCurrentPages()` and call `setData({ t })` on each.
- Native chrome is not data-driven: call `wx.setNavigationBarTitle`,
  `wx.setTabBarItem` for each tab, and update `navigationBarTitleText`
  translations yourself; the `app.json` values are the fallback for the
  default locale only.
- Plurals: write the rule in JS (`count === 1 ? t('x.one') : t('x.other')`)
  per language with a tiny `plural(locale, n)` helper; do not ship a
  general CLDR engine into the package size budget.

### Dates and numbers

`Intl` support in the mini-program runtime varies by base library and
platform; format with dayjs plus its locale files, or send pre-formatted
strings from the server with the request's locale. Test on 真机 for both
iOS and Android before relying on `toLocaleString`.

## uni-app

- Vue 3 uni-app projects use the bundled vue-i18n: `createI18n({ legacy: false, locale: uni.getLocale(), messages })`
  in `main.ts`, `$t`/`useI18n` in templates and scripts for all targets.
- `uni.setLocale(locale)` persists the choice and triggers `onLocaleChange`;
  native navigation titles and tab bar text come from `pages.json` keys
  written as `%key%` with a `locale/` folder (`locale/zh-Hans.json`, `locale/en.json`)
  for the platform-side strings. App and 小程序 titles are read from
  there, not from vue-i18n.
- Keep the vue-i18n messages and the `locale/` folder in sync with the
  parity script; they are two files for the same key only because the
  native shell cannot read JavaScript.
- `#ifdef MP-WEIXIN` is not needed for i18n except for platform-only
  chrome APIs.

## Differences checklist

| Web (vue-i18n) | Native 小程序 |
| --- | --- |
| `t('key', { n })` in template | `{{ t.key }}` from `data`, WXS or precomputed for params |
| `i18n.global.locale.value = x` | `setLocale` + re-`setData` on each page or `reLaunch` |
| Element Plus locale via `ElConfigProvider` | Component library locale prop (Vant Weapp `van-config-provider` has none for text; pass strings) |
| `<html lang/dir>` | No equivalent; RTL is manual layout per page |
| Lazy `import()` per locale | `require` all tables (small) or split per 分包 |
| Route `meta.title` via `t()` | `wx.setNavigationBarTitle` in `onShow` |
