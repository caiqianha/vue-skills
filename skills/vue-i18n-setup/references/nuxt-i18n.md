# i18n in Nuxt with @nuxtjs/i18n

Companion to `vue-i18n-setup/SKILL.md`. `@nuxtjs/i18n` v10 targets Nuxt 4
and bundles `vue-i18n` 11; v9 covers Nuxt 3. The rules from the main skill
still apply; what changes is who decides the locale and when.

## What the module decides for you

- **Locale per request**, from the URL prefix, the `i18n_redirected`
  cookie or `Accept-Language`, according to `strategy`. Never read or
  store the locale in a module-level variable or a plain Pinia field
  initialised from `localStorage`; on the server that is either shared
  between users or undefined.
- **Routes**: with `prefix_except_default` the English site is `/about`
  and Chinese is `/zh/about`. Generate links with `useLocalePath()` or
  `<NuxtLinkLocale>`; a hand-written `/about` loses the prefix after a
  language switch.
- **Switching**: `useSwitchLocalePath()` returns the same page in the other
  locale; `setLocale()` from `useI18n()` does the navigation and cookie
  update. Do not set `i18n.global.locale` yourself.
- **SEO**: `useLocaleHead({ seo: true })` emits `hreflang` and `og:locale`;
  put it in the layout.

## Minimal config (Nuxt 4 layout)

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxtjs/i18n'],
  i18n: {
    locales: [
      { code: 'zh', language: 'zh-CN', file: 'zh-CN.json', dir: 'ltr' },
      { code: 'en', language: 'en-US', file: 'en.json', dir: 'ltr' },
      { code: 'ar', language: 'ar', file: 'ar.json', dir: 'rtl' },
    ],
    defaultLocale: 'zh',
    strategy: 'prefix_except_default',
    lazy: true,
    detectBrowserLanguage: { useCookie: true, cookieKey: 'i18n_redirected', redirectOn: 'root' },
  },
})
```

Files live under `i18n/locales/` and extra vue-i18n options
(`numberFormats`, `datetimeFormats`, `pluralRules`) go in
`i18n/i18n.config.ts` exporting `defineI18nConfig(() => ({ ... }))`. The
`i18n/` root is the module's default `restructureDir`; a project upgraded
from v8 may still have `langDir: 'locales'` at the app root.

Per-feature files: the `file` option takes one file per locale; set
`files: ['zh-CN/common.json', 'zh-CN/order.json']` to keep the per-feature
layout, or merge them in a small `zh-CN.ts` that the module loads.

## Lazy loading and payload

- `lazy: true` ships only the active locale's messages in the SSR payload
  and loads others on switch. Without it every locale is in the client
  bundle.
- Messages are part of the Nuxt payload; a 400 KB locale file adds 400 KB
  to every HTML response. Split rarely used feature files and load them
  with `loadLocaleMessages` from the page that needs them, or keep legal
  texts in content rather than messages.

## Element Plus under Nuxt

With `@element-plus/nuxt`, pass the locale through `ElConfigProvider` the
same way as in the SPA, mapping the module's `locale.value` to the Element
Plus locale object with a dynamic import. Do it in `app.vue`, not in a
plugin, so it reacts to switches. The dayjs locale import must be guarded
with `import.meta.client` only if the date formatting is rendered on the
server too; otherwise the server and client format differently and you get
a hydration mismatch on every date.

## Hydration traps specific to i18n

| Symptom | Cause | Fix |
| --- | --- | --- |
| Mismatch warning on every formatted date | Server Node ICU vs browser, or dayjs locale loaded client-only | Format with `d()` using explicit options, or load the dayjs locale in both environments |
| First paint in English, flips to Chinese | Locale read from `localStorage` in a plugin | Let the module decide; cookie-based detection |
| `t()` returns the key during SSR only | Messages loaded in a client-only hook | `lazy: true` with `file` per locale, no manual `setLocaleMessage` on the client |
| Links lose the `/zh` prefix | Plain `NuxtLink to="/x"` | `NuxtLinkLocale` / `localePath('/x')` |
| Crawlers see duplicate content | No `hreflang` | `useLocaleHead` in the layout |

## Server routes

`server/api` handlers do not have `useI18n`. For emails or server-rendered
messages, read the locale from the cookie or `Accept-Language` with
`getCookie(event, 'i18n_redirected')`, then use `createCoreContext` from
`@intlify/core` or a plain message lookup. Keep server-side strings in the
same locale files so parity checks cover them.
