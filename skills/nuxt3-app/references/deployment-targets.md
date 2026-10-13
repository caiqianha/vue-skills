# Choosing and verifying a Nuxt deployment target

Companion to `nuxt3-app/SKILL.md`. Decide the target before writing server
code; some targets forbid APIs the others allow.

## Rendering modes first, hosting second

| Mode | Config | Fits | Does not fit |
| --- | --- | --- | --- |
| Universal SSR | default (`ssr: true`) | Content that must be indexed or paint fast on slow devices, personalised pages | Pure internal tools with no SEO need and heavy client state |
| Hybrid | `routeRules` per path | Marketing pages prerendered, `/app/**` as SPA, `/api/**` cached | Teams that will not maintain the rules table |
| Full static | `nuxi generate` | Docs, blogs, landing sites | Anything with per-user data at request time; `server/api` is only available during generation |
| SPA | `ssr: false` | Admin dashboards behind login | Anything needing SEO; you lose most of the reason to use Nuxt |

Hybrid rules that cover most apps:

```ts
routeRules: {
  '/': { prerender: true },
  '/blog/**': { isr: 3600 },            // regenerate at most hourly where the host supports it
  '/admin/**': { ssr: false },          // client-only area
  '/api/public/**': { cors: true, swr: 60 },
}
```

## Presets

| Target | Preset | Notes |
| --- | --- | --- |
| Any VPS / Docker / PM2 | `node-server` | `node .output/server/index.mjs`; `PORT`, `HOST`, `NITRO_PORT`; put a reverse proxy in front for TLS and compression |
| Vercel | `vercel` (auto) | ISR and edge functions map to `routeRules`; check the function size limit when bundling a heavy SDK |
| Netlify | `netlify` (auto) | Similar; `netlify.toml` must not override the publish dir Nitro sets |
| Cloudflare Pages / Workers | `cloudflare_pages` / `cloudflare_module` | No Node built-ins; 1 MB-ish compressed bundle on free tiers; use `nuxi preview` with wrangler to test |
| AWS Lambda | `aws-lambda` or `aws-amplify` | Cold starts are visible; keep server deps small |
| Static host / OSS / CDN | `nuxi generate` | Upload `.output/public`; configure the host to serve `200.html` or `404.html` for unknown paths |

Set the preset explicitly once chosen so CI and local builds agree:

```ts
nitro: { preset: 'node-server' }
```

or `NITRO_PRESET=node-server nuxi build` in the pipeline.

## Environment and config at runtime

- Only `runtimeConfig` keys with defaults in `nuxt.config.ts` are
  overridable; the env name is `NUXT_` + SCREAMING_SNAKE path
  (`runtimeConfig.public.apiBase` → `NUXT_PUBLIC_API_BASE`).
- `.env` is read by `nuxi dev` and `nuxi build`, not by the production
  server. Inject real variables in the container, systemd unit or host
  dashboard.
- Numbers and booleans from env arrive as strings; coerce where you read
  them.
- Never commit a `.env` with real values; commit `.env.example` with every
  key and a dummy value so the pipeline can diff for missing ones.

## Docker skeleton

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/.output ./.output
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
```

The runtime image contains only `.output`; `node_modules` is not needed
because Nitro bundles server dependencies. Dependencies marked
`nitro.externals` are the exception and must be installed in the final stage.

## Pre-release checklist per target

1. `nuxi build` with `NODE_ENV=production` and the real preset, then start
   the output locally with the production env file exported.
2. Open the app with JavaScript disabled: server HTML should be complete
   for public pages.
3. Open with JavaScript enabled and the console visible: zero hydration
   warnings, zero 404s for `_nuxt/*` assets (wrong `app.baseURL` or CDN
   prefix shows up here).
4. Hit a private `server/api` route with `curl` and no cookie: expect 401,
   not data.
5. Check the response size of the HTML for the heaviest page; payload above
   ~200 KB means `pick`/`transform` work is pending.
6. For static output, request a deep dynamic route directly; it must be
   prerendered or fall back to the SPA shell as intended.
7. For edge targets, run the real preset locally once (`wrangler dev`,
   `vercel dev`) to catch Node-only APIs before the deploy fails.
