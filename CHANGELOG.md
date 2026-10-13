# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
semver for the plugin manifest.

## [0.2.0] - 2026-10-13

### Added

- Three skills: `nuxt3-app` (Nuxt 3/4 structure, server routes, data
  fetching, SSR-safe state, auth middleware, runtime config, hydration
  checklist, deployment targets), `vue-forms-validation` (Element Plus
  rules and vee-validate + zod/valibot, async and cross-field rules, field
  arrays, i18n of messages, submit state, error summary, mini-program
  forms) and `vue-i18n-setup` (vue-i18n v9–v11 with Element Plus, message
  layout, lazy locales, formats, plurals, RTL, Nuxt i18n, extraction and
  review, mini-program i18n). Each ships `references/` for the long tail.
- Claude Code plugin packaging: `.claude-plugin/plugin.json` and
  `.claude-plugin/marketplace.json` so the repo installs with
  `/plugin marketplace add caiqianha/vue-skills` and
  `/plugin install vue-skills@vue-skills`.
- Eval suite in the `claude plugin eval` format under `evals/` (one
  positive case per skill with a skill-fired grader, LLM rubrics for
  `nuxt3-app` and `vue-forms-validation`, three negative cases) and a
  per-skill trigger dataset in `evals/triggers/*.json`.
- `scripts/eval-triggers.mjs`: model-free check that every trigger prompt
  shares key terms with its skill description, and that negative prompts
  do not; wired into `npm test` and CI.
- `CHANGELOG.md`.

### Changed

- `scripts/validate.mjs` also validates the two plugin JSON files (required
  fields, version equal to `package.json`, plugin source pointing at the
  repo root) and that every `references/*.md` linked from a SKILL.md exists.
- README: plugin install documented first, Evals section, skills table and
  badge updated to 14, 中文说明 updated.
- Version 0.2.0 in `package.json`, `plugin.json` and `marketplace.json`.

## [0.1.0] - 2026-10-10

### Added

- Initial release with 11 skills: `vue3-composition`, `element-plus-admin`,
  `api-layer-axios`, `pinia-state`, `vue-router-auth`, `vue-performance`,
  `vue-testing-vitest`, `wechat-miniprogram`, `uni-app-cross-platform`,
  `vue2-to-vue3-migration`, `vue-code-review`.
- `scripts/validate.mjs`, GitHub Actions workflow, issue and PR templates,
  STYLE.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md.
