---
name: vue-i18n-setup
description: Use when adding or restructuring internationalisation (i18n, 国际化, 多语言) in a Vue 3 app — vue-i18n v9 to v11 setup with Element Plus, locale message organisation, lazy-loaded locales, number and date formats, pluralisation, RTL, the Nuxt @nuxtjs/i18n differences, extracting hardcoded strings and reviewing a PR for them, or the equivalent approach in a 微信小程序 / uni-app. Enforces composition-mode setup, message files organised by feature and loaded on demand, formatting through the library rather than hand-built strings, and a review pass that catches every hardcoded user-facing string.
---
# vue-i18n setup and string discipline

This skill covers making a Vue 3 app multilingual and keeping it that way:
initial `vue-i18n` setup, Element Plus locale wiring, message file layout,
lazy loading, formats, pluralisation, RTL, the Nuxt module and the
mini-program approach where `vue-i18n` is unavailable. "Good" means a new
locale is one folder plus one line of config, switching language updates
every visible string including Element Plus and dates without a reload, and
CI fails when a key is missing in a locale. It does not cover translation
vendor management or content CMS localisation. For forms' validation
messages see `vue-forms-validation`.

## Non-negotiables

- **Composition mode only** (`legacy: false`), `useI18n()` in setup and
  `i18n.global.t` outside components. Legacy mode is deprecated in v11 and
  removed in v12; mixing `this.$i18n` and `useI18n` means two code paths.
- **Keys are semantic, not English sentences.** `user.form.nameRequired`,
  not `"Name is required"`. Sentence keys break the moment the English
  wording changes and they collide across contexts.
- **One file per feature per locale, under three levels of nesting.**
  `locales/zh-CN/user.json`, `locales/en/user.json`, merged at load.
  A single 4k-line `zh-CN.json` produces merge conflicts on every PR.
- **Interpolate, never concatenate.** Word order differs per language;
  `t('cart.total', { count, amount })` lets the translator reorder.
  `t('cart.total') + count` does not.
- **Numbers, currency and dates go through `n()` / `d()` with named
  formats** defined per locale. `toFixed(2) + ' 元'` and `dayjs().format('YYYY-MM-DD')`
  are hardcoded locale decisions.
- **Lazy-load every locale except the default.** Each locale's messages
  are bundled otherwise; five locales times a large admin app is megabytes
  the user never reads.
- **Switching locale updates four things together**: `i18n.global.locale`,
  Element Plus `ElConfigProvider` locale, dayjs/date-picker locale and
  `<html lang>` (plus `dir` for RTL). Missing one gives a half-translated
  page.
- **Pluralisation uses the library's plural syntax and `count`**, with
  custom `pluralRules` for languages whose rules differ (ru, ar). An
  `if (n === 1)` in a component is wrong in half the world's languages.
- **Missing keys fail CI, not the user.** A script compares every locale's
  key set with the default locale; in production, `fallbackLocale` hides
  gaps while the pipeline reports them.
- **No HTML in messages except through `<i18n-t>` slots.** `v-html` with
  translated strings is an XSS path once translators can edit files.
- **Hardcoded user-facing strings are a review blocker in an i18n project**,
  including `ElMessage` text, placeholders, `title`/`aria-label`,
  validation messages, enum labels and route titles.

## Workflow

1. **Inventory the current state**: `vue-i18n` version, legacy or
   composition mode, where messages live, how Element Plus gets its locale,
   whether a bundler plugin (`@intlify/unplugin-vue-i18n`) is present, and
   how many hardcoded strings exist (grep for CJK and quoted sentences in
   `.vue` files).
2. **Set up or normalise the instance** in `src/i18n/index.ts`: default
   locale from cookie/localStorage → browser → config, `fallbackLocale`,
   `numberFormats`, `datetimeFormats`, and a `setLocale()` that performs the
   four updates above. Register the bundler plugin so JSON is precompiled.
3. **Lay out messages** by locale and feature; write a tiny `loadLocale()`
   that `import()`s the folder and calls `setLocaleMessage`. Keep `common`
   (actions, states, units) separate from feature files.
4. **Convert strings**: templates first (`{{ t('x') }}`), then script
   (`ElMessage.success(t('x'))`), then option-style data (enum labels become
   functions or computed). Add keys to the default locale as you go; other
   locales get the key with the default text and a TODO marker the script
   can count.
5. **Add formats and plurals** for the few places that need them: money,
   large counts, relative time. Define them once per locale.
6. **Wire CI**: key-parity script, the `@intlify/eslint-plugin-vue-i18n`
   rules `no-raw-text` and `no-missing-keys`, and a build check that no
   locale file is imported statically except the default.
7. **Verify by switching locale at runtime** on the heaviest page with a
   dialog open and an error visible: text, Element Plus pagination/picker
   strings, dates, number formats and `<html lang>` all change.

## Patterns

### Instance with lazy locales and the four-part switch

```ts
// src/i18n/index.ts
import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN'                     // default locale bundled, others lazy
export const SUPPORTED = ['zh-CN', 'en', 'ar'] as const
export type Locale = (typeof SUPPORTED)[number]
export const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN },
  numberFormats: { 'zh-CN': { currency: { style: 'currency', currency: 'CNY' } }, en: { currency: { style: 'currency', currency: 'USD' } } },
  datetimeFormats: { 'zh-CN': { short: { year: 'numeric', month: '2-digit', day: '2-digit' } }, en: { short: { dateStyle: 'medium' } } },
})
const elLocales = { 'zh-CN': () => import('element-plus/es/locale/lang/zh-cn'), en: () => import('element-plus/es/locale/lang/en'), ar: () => import('element-plus/es/locale/lang/ar') }
export const elLocale = shallowRef<Language>()
export async function setLocale(locale: Locale) {
  if (!i18n.global.availableLocales.includes(locale)) {
    const msgs = await import(`./locales/${locale}/index.ts`)      // one folder per locale
    i18n.global.setLocaleMessage(locale, msgs.default)
  }
  elLocale.value = (await elLocales[locale]()).default
  await import(`dayjs/locale/${locale.toLowerCase()}.js`); dayjs.locale(locale.toLowerCase())
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'
  localStorage.setItem('locale', locale)
}
```

```vue
<el-config-provider :locale="elLocale"><router-view /></el-config-provider>
```

`locales/zh-CN/index.ts` re-exports `{ common, user, order }` from JSON
files; the glob is explicit so the bundler creates one chunk per locale.

### Message file shape

```jsonc
// locales/en/order.json
{
  "list": { "title": "Orders", "empty": "No orders yet" },
  "status": { "pending": "Pending", "paid": "Paid", "refunded": "Refunded" },
  "total": "{count} order | {count} orders, total {amount}",
  "shipBy": "Ship before {date}"
}
```

```ts
t('order.total', { count: n, amount: nf(sum, 'currency') }, n)   // plural chosen by the third argument
t('order.status.' + row.status)                                   // enum label from a stable code
d(row.shipBy, 'short')
```

Chinese has one plural form: `"total": "{count} 个订单，共 {amount}"` is
correct and `t()` with a count still works.

### Linked text with a clickable part

```vue
<!-- wrong: HTML in the message -->
<p v-html="t('signup.terms')"></p>

<!-- right -->
<i18n-t keypath="signup.terms" tag="p">
  <template #link><router-link to="/terms">{{ t('signup.termsLink') }}</router-link></template>
</i18n-t>
```

Message: `"terms": "I agree to the {link}"`.

### Outside components

```ts
// wrong: useI18n() in a router guard or axios interceptor throws
// right
import { i18n } from '@/i18n'
const t = i18n.global.t
ElMessage.error(t('api.timeout'))
document.title = t(String(to.meta.titleKey))   // meta stores the key, not the text
```

### Key-parity check (CI, no dependencies)

```ts
const flat = (o: any, p = ''): string[] => Object.entries(o).flatMap(([k, v]) => typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`])
const base = new Set(flat(load('zh-CN')))
for (const loc of others) {
  const keys = new Set(flat(load(loc)))
  const missing = [...base].filter((k) => !keys.has(k)); const extra = [...keys].filter((k) => !base.has(k))
  if (missing.length || extra.length) { console.error(loc, { missing, extra }); process.exitCode = 1 }
}
```

### Nuxt and mini-programs in brief

Nuxt uses `@nuxtjs/i18n` (v10 wraps vue-i18n 11): locales live in
`i18n/locales/`, the module decides the locale per request from the URL
prefix, cookie or `Accept-Language`, and links go through
`<NuxtLinkLocale>` / `useLocalePath()`; never store the locale in a
module-level variable. Native 微信小程序 has no `vue-i18n`: keep message
objects in `i18n/<locale>.js`, inject the current table into page data via a
behavior and read `{{ t.order.title }}` in WXML; uni-app ships vue-i18n and
`uni.setLocale`. Details: [references/nuxt-i18n.md](references/nuxt-i18n.md),
[references/miniprogram-i18n.md](references/miniprogram-i18n.md). Extraction
workflow and the hardcoded-string review checklist:
[references/extraction-and-review.md](references/extraction-and-review.md).

## Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| Key path shown instead of text | Key missing in current locale and no fallback | `fallbackLocale` set, parity script in CI |
| Pagination says "Go to" after switching to Chinese | Element Plus locale not switched | `ElConfigProvider :locale` driven by the same `setLocale` |
| Date picker weekdays in English | dayjs locale not loaded | Import `dayjs/locale/<code>` in `setLocale` |
| Switching locale changes nothing until reload | `i18n.global.locale` set as a string in composition mode | `i18n.global.locale.value = locale` |
| `useI18n` throws "Must be called at the top of setup" | Called in a guard, store or after `await` | `i18n.global.t` |
| Strings bundled for every language | Static imports of all locale files | Dynamic `import()` per locale |
| Translators broke a layout | Concatenated fragments in template | One message with placeholders |
| `{name}` printed literally | Named vs list interpolation mismatch | Pass an object for `{name}`, an array for `{0}` |
| Plural wrong in Russian/Arabic | Only `one | other` forms | `pluralRules` for the locale, three or more forms |
| Currency shows `¥` for USD | One global number format | Per-locale `numberFormats` with explicit `currency` |
| XSS via translated string | `v-html` with messages | `<i18n-t>` with slots |
| Element Plus RTL partially broken | Physical CSS properties and directional icons | Logical properties (`margin-inline-start`), flip icons under `[dir=rtl]` |
| Enum labels still Chinese after switch | Labels stored in a constant array | Store codes, map to `t('x.status.' + code)` in a computed |
| Nuxt page shows previous user's language | Locale kept in module scope on the server | Use the module's per-request locale, `useI18n().locale` |
| Mini-program page keeps old language after switch | Only `globalData` updated | Re-`setData` the table on `onShow` of every page |
| Tests print key paths | Test instance without messages | Mount with the real `i18n` plugin and default locale |

## Before you finish

- [ ] `createI18n({ legacy: false })`; no `this.$i18n` or legacy options remain.
- [ ] Default locale bundled, every other locale loaded on demand (check
      the chunk list in the build output).
- [ ] `setLocale` updates vue-i18n, Element Plus, dayjs and `<html lang/dir>`;
      verified live on the heaviest page with a dialog open.
- [ ] Messages organised per locale and feature; no file over ~300 keys.
- [ ] No concatenated fragments; money, counts and dates use `n()`/`d()`.
- [ ] Plurals use `count` and the pipe syntax; non-trivial languages have `pluralRules`.
- [ ] Key-parity script and lint rules run in CI and pass.
- [ ] Grep for CJK and quoted sentences in changed `.vue`/`.ts` files returns
      only keys, comments and test fixtures.
- [ ] Route titles, `ElMessage` texts, placeholders, validation messages and
      enum labels all go through `t()`.
