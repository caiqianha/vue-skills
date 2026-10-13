# vue-skills

**Opinionated Agent Skills for Vue 3, Nuxt, Element Plus admin apps, WeChat Mini Programs and uni-app.**

[![validate](https://github.com/caiqianha/vue-skills/actions/workflows/validate.yml/badge.svg)](https://github.com/caiqianha/vue-skills/actions/workflows/validate.yml)
[![skills](https://img.shields.io/badge/skills-14-2a78d6)](#skills)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

Works with Claude Code, Codex, Cursor, Gemini CLI and anything else that reads
`SKILL.md` folders. [中文说明](#中文说明) below.

## Why another skills repo

Your agent already knows the Element Plus API. What it gets wrong is
*judgment*: deep-watching a 5k-row table, mutating a prop, calling `setData`
in a loop, putting the AppSecret in the client, adding the 404 route before
the dynamic ones, sharing a `useAsyncData` key between two pages. These
skills encode those decisions as short rules with reasons, a workflow,
wrong/right snippets, a pitfalls table and a checklist the agent runs before
it says "done".

Nothing here is pasted from documentation. Every `SKILL.md` is under 300
lines so it costs little context when loaded; the long tail lives in
`references/` files the agent opens only when needed.

## Install

**Option 1: Claude Code plugin (recommended)**

This repository is both a plugin marketplace and the plugin. In a Claude
Code session:

```
/plugin marketplace add caiqianha/vue-skills
/plugin install vue-skills@vue-skills
```

The part after `@` is the marketplace name from
`.claude-plugin/marketplace.json`. From a shell the same two steps are
`claude plugin marketplace add caiqianha/vue-skills` and
`claude plugin install vue-skills@vue-skills`; add `--scope project` to
share the install through the repo's settings. Pin a release with
`/plugin marketplace add caiqianha/vue-skills#v0.2.0`.

**Option 2: any agent, via the `skills` CLI**

```bash
npx skills add caiqianha/vue-skills          # pick skills and target agents interactively
npx skills add caiqianha/vue-skills --all    # everything, for every detected agent
```

**Option 3: manual**

Copy the folders you want from `skills/` into your project's `.claude/skills/`
(or `~/.claude/skills/` for all projects). Other agents: `.cursor/skills/`,
`.codex/skills/`, or the path your tool documents.

## Skills

| Skill | Use when |
| --- | --- |
| [vue3-composition](skills/vue3-composition/) | Writing or refactoring components and composables with `<script setup>`: ref vs reactive vs shallowRef, watcher discipline, typed props/emits, cleanup |
| [element-plus-admin](skills/element-plus-admin/) | Building CRUD pages with Element Plus: search form + table + pagination, dialog forms reused for create/edit, validation, loading/empty states |
| [vue-forms-validation](skills/vue-forms-validation/) | Forms with Element Plus rules or vee-validate + zod/valibot: async and cross-field rules, field arrays, translated messages, submit/reset state, error summary, mini-program forms |
| [vue-i18n-setup](skills/vue-i18n-setup/) | Adding vue-i18n v9–v11 to a Vue 3 + Element Plus app: message layout, lazy locales, formats and plurals, RTL, Nuxt i18n, extracting hardcoded strings, mini-program i18n |
| [nuxt3-app](skills/nuxt3-app/) | Nuxt 3/4 apps: directory layout, server routes vs external API, useFetch/useAsyncData keys and payload, useState vs Pinia, auth middleware, runtime config, hydration mismatches, deployment targets |
| [api-layer-axios](skills/api-layer-axios/) | Designing the request layer: interceptors that only normalise, typed API modules, cancellation, 401 refresh queue, blob downloads |
| [pinia-state](skills/pinia-state/) | Deciding what goes in a store vs a composable, setup stores, persistence whitelist, actions owning errors |
| [vue-router-auth](skills/vue-router-auth/) | Permission-driven dynamic routes, guards without redirect loops, button-level permissions, keep-alive tabs, 404 ordering |
| [vue-performance](skills/vue-performance/) | A page feels slow or the bundle is big: measure first, code splitting, shallow state, virtual lists, leak hunting |
| [vue-testing-vitest](skills/vue-testing-vitest/) | Adding tests: composables and utils first, component behaviour second, mocking the API layer, a handful of Playwright flows |
| [wechat-miniprogram](skills/wechat-miniprogram/) | Native 微信小程序 work: `setData` discipline, page stack, 分包, login without leaking AppSecret, 隐私协议, 审核 traps |
| [uni-app-cross-platform](skills/uni-app-cross-platform/) | uni-app targeting H5 + 小程序 + App: 条件编译 kept at the edges, pages.json, platform layer, CSS traps |
| [vue2-to-vue3-migration](skills/vue2-to-vue3-migration/) | Planning or executing a Vue 2 → Vue 3 / Element UI → Element Plus migration without rewriting features |
| [vue-code-review](skills/vue-code-review/) | Reviewing a Vue PR: correctness, security, performance, UX states, maintainability, with severity labels and an output format |

Run `npm run list` to print this table from the source.

## Evals

Two layers, so that a vague description or a broken trigger is caught
without spending tokens, and the real behaviour can still be measured.

**Automatic, no model (`npm test`, also in CI):**

- `scripts/validate.mjs`: frontmatter, mandatory sections, size limits,
  README coverage and badge count, `references/` links, and the two plugin
  JSON files (required fields, versions equal to `package.json`, plugin
  source pointing at the repo root).
- `scripts/eval-triggers.mjs`: reads `evals/triggers/<skill>.json`, which
  holds 3–5 prompts that should activate the skill and 2–3 that should not,
  and compares them with the skill's description using a keyword overlap
  heuristic. It fails when a trigger prompt shares no key term with the
  description (too vague to be picked) or a negative prompt shares three or
  more (so broad it fires on anything). `--verbose` prints the matched
  terms. It also checks that every skill has a `claude plugin eval` case
  and that the case's grader targets that skill.

**Manual, model-based (`claude plugin eval`, Claude Code 2.1.269+):**

`evals/<skill>/` holds one case per skill in the official format
(`prompt.md` plus `graders/*.md`): a `tool_used` grader asserting the
skill fired, and for `nuxt3-app` and `vue-forms-validation` an `llm`
grader with a rubric of what a good answer must contain. Three
`negative-*` cases assert that no skill fires on unrelated work. Every run
makes real model calls on your account, so start small:

```bash
claude plugin eval . --case nuxt3-app --runs 1 --ablation none   # one case, with-plugin arm only
npm run eval:model                                                # all cases, one run each, no baseline arm
claude plugin eval . --json results.json --threshold 0.8          # full run with the no-plugin baseline
```

Results land in `evals/results/<timestamp>/` (gitignored). To add a case,
copy an existing folder; to add trigger prompts, edit the JSON and run
`npm test`.

## How skills are written

See [STYLE.md](STYLE.md). Short version: judgment not documentation,
imperative voice, every rule has a reason, concrete thresholds, wrong/right
snippets, under 500 lines. `npm test` validates frontmatter, mandatory
sections, size and trigger prompts on every PR.

## Contributing

Fixing a wrong rule beats adding a new one. See [CONTRIBUTING.md](CONTRIBUTING.md)
and [CHANGELOG.md](CHANGELOG.md). All content is original and MIT licensed.
微信, Element Plus, Nuxt, uni-app and other names are trademarks of their
owners and are used only to identify the technology; this project is not
affiliated with them.

## 中文说明

给 Vue 3 / Nuxt / Element Plus 中后台、微信小程序、uni-app 项目用的 Agent Skills。
不是 API 文档搬运，模型本来就会查文档。这里写的是模型容易做错的判断：
什么时候用 `shallowRef`、`setData` 不要在循环里调、AppSecret 不能进客户端、
404 路由要在动态路由之后加、两个页面不能共用一个 `useAsyncData` key。每个 skill
都有规则加理由、操作流程、错误与正确写法对照、坑表和完工自检清单，`SKILL.md`
控制在 300 行以内，更长的材料放在 `references/` 里按需加载。

0.2.0 新增三个 skill：`nuxt3-app`（Nuxt 3/4 目录结构、server routes、
useFetch/useAsyncData、SSR 安全的状态、鉴权中间件、runtime config、水合不一致排查、
部署目标）、`vue-forms-validation`（Element Plus 表单规则与 vee-validate + zod/valibot、
异步与跨字段校验、动态字段数组、报错信息国际化、提交/重置状态机、小程序表单差异）、
`vue-i18n-setup`（vue-i18n v9–v11 接入 Element Plus、语言包组织与懒加载、数字日期格式、
复数、RTL、Nuxt i18n 差异、硬编码文案提取与评审清单、小程序国际化方案）。

安装：Claude Code 里执行 `/plugin marketplace add caiqianha/vue-skills`，
再 `/plugin install vue-skills@vue-skills`（`@` 后面是 marketplace 名）；其它工具用
`npx skills add caiqianha/vue-skills`，或者直接把 `skills/` 下的目录复制到
`.claude/skills/`。

评测：`npm test` 不调用模型，校验 skill 格式、插件 JSON，并用关键词重合度检查
`evals/triggers/*.json` 里的触发语句是否能命中 description；`claude plugin eval .`
跑官方格式的模型评测（`evals/<skill>/`），会产生真实调用费用，先用
`--case <skill> --runs 1 --ablation none` 试一个。

欢迎提 PR 修正错误的规则，比新增规则更有价值。所有内容原创，MIT 协议。
