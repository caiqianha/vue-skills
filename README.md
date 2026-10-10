# vue-skills

**Opinionated Agent Skills for Vue 3, Element Plus admin apps, WeChat Mini Programs and uni-app.**

[![validate](https://github.com/caiqianha/vue-skills/actions/workflows/validate.yml/badge.svg)](https://github.com/caiqianha/vue-skills/actions/workflows/validate.yml)
[![skills](https://img.shields.io/badge/skills-11-2a78d6)](#skills)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

Works with Claude Code, Codex, Cursor, Gemini CLI and anything else that reads
`SKILL.md` folders. [中文说明](#中文说明) below.

## Why another skills repo

Your agent already knows the Element Plus API. What it gets wrong is
*judgment*: deep-watching a 5k-row table, mutating a prop, calling `setData`
in a loop, putting the AppSecret in the client, adding the 404 route before
the dynamic ones. These skills encode those decisions as short rules with
reasons, a workflow, wrong/right snippets, a pitfalls table and a checklist
the agent runs before it says "done".

Nothing here is pasted from documentation. Every file is under 300 lines so
it costs little context when loaded.

## Install

**Claude Code (plugin, recommended)**

```
/plugin marketplace add caiqianha/vue-skills
/plugin install vue-skills@vue-skills
```

**Any agent, via the `skills` CLI**

```bash
npx skills add caiqianha/vue-skills          # pick skills and target agents interactively
npx skills add caiqianha/vue-skills --all    # everything, for every detected agent
```

**Manual**

Copy the folders you want from `skills/` into your project's `.claude/skills/`
(or `~/.claude/skills/` for all projects). Other agents: `.cursor/skills/`,
`.codex/skills/`, or the path your tool documents.

## Skills

| Skill | Use when |
| --- | --- |
| [vue3-composition](skills/vue3-composition/) | Writing or refactoring components and composables with `<script setup>`: ref vs reactive vs shallowRef, watcher discipline, typed props/emits, cleanup |
| [element-plus-admin](skills/element-plus-admin/) | Building CRUD pages with Element Plus: search form + table + pagination, dialog forms reused for create/edit, validation, loading/empty states |
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

## How skills are written

See [STYLE.md](STYLE.md). Short version: judgment not documentation,
imperative voice, every rule has a reason, concrete thresholds, wrong/right
snippets, under 500 lines. `npm test` validates frontmatter, mandatory
sections and size on every PR.

## Contributing

Fixing a wrong rule beats adding a new one. See [CONTRIBUTING.md](CONTRIBUTING.md).
All content is original and MIT licensed. 微信, Element Plus, uni-app and
other names are trademarks of their owners and are used only to identify the
technology; this project is not affiliated with them.

## 中文说明

给 Vue 3 / Element Plus 中后台、微信小程序、uni-app 项目用的 Agent Skills。
不是 API 文档搬运，模型本来就会查文档。这里写的是模型容易做错的判断：
什么时候用 `shallowRef`、`setData` 不要在循环里调、AppSecret 不能进客户端、
404 路由要在动态路由之后加。每个 skill 都有规则加理由、操作流程、错误与正确写法
对照、坑表和完工自检清单，长度控制在 300 行以内，加载不费上下文。

安装：Claude Code 里执行 `/plugin marketplace add caiqianha/vue-skills`，
再 `/plugin install vue-skills@vue-skills`；其它工具用 `npx skills add caiqianha/vue-skills`，
或者直接把 `skills/` 下的目录复制到 `.claude/skills/`。

欢迎提 PR 修正错误的规则，比新增规则更有价值。所有内容原创，MIT 协议。
