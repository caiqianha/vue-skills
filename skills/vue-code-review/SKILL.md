---
name: vue-code-review
description: Use when reviewing a pull request or diff in a Vue project (Vue 2 or 3, Element UI/Plus, Pinia/Vuex). Enforces an intent-first pass, then correctness, security, performance, UX, maintainability and test checks, with blocker/should/nit severities and a file:line findings format.
---
# Vue code review

This skill applies when asked to review a diff, branch or PR in a Vue
codebase. "Good" is a short list of findings a developer can act on in one
sitting, ordered by what would hurt in production, each anchored to a
file and line with a one-line fix. It is not for reviewing formatting,
import order or anything ESLint and Prettier already enforce. Skip the
UX section for pure library code.

## Non-negotiables

- **Understand intent before judging code.** Read the PR title, linked
  issue and the full diff once without commenting. Half of "bugs" found by
  reviewers who skipped this step are intended behaviour.
- **Findings are anchored.** Every finding names `path:line`, the symptom,
  and a one-line fix. "Consider refactoring this" is not a finding.
- **Severity has thresholds.** `blocker`: wrong result, data loss, security
  hole, crash, or a race users will hit. `should`: correct today but will
  break under a foreseeable change, or costs >50 ms per interaction.
  `nit`: style and naming that lint does not cover. Do not inflate nits to
  look thorough.
- **At most ~10 findings per review.** Beyond that, group and summarise;
  a 40-item review gets skimmed and the blocker gets lost.
- **Every blocker is verified**, not pattern-matched. Open the file, trace
  the data flow, confirm the failing input. If you cannot confirm, mark it
  "plausible" and say what to check.
- **Do not review what the linter owns.** Formatting, import order, quote
  style, trailing commas, unused vars that ESLint catches. If the project
  has no lint, say so once as a `should` and move on.
- **Request changes only for blockers.** Approve with comments when there
  are only `should` and `nit` items; blocking a PR over naming trains
  people to ignore reviews.
- **Praise is specific or absent.** "Nice use of the sequence counter in
  `useList`" teaches; "LGTM" does not.

## Workflow

1. **Scope.** List the files changed, group by feature. Note anything
   touched that the PR description does not mention; that is the first
   question to ask, not a finding.
2. **Correctness pass** (one file at a time, template then script):
   - Reactivity: `reactive` destructured, `watch` on a plain prop value,
     `computed` with side effects, state read before async resolves.
   - Props mutated, `v-model` on a prop.
   - Cleanup: timers, `addEventListener`, `ResizeObserver`, websocket,
     store subscriptions without `onUnmounted` / `onScopeDispose`.
   - Async races: list loads without a sequence guard, submit buttons
     without a pending flag (double submit), `await` inside `v-for` loops.
   - Null paths: optional API fields used without `?.` in template; `[0]`
     on possibly-empty arrays.
3. **Security pass**:
   - `v-html` with any content that was ever user input, unless it passed
     through a sanitizer on this code path.
   - Tokens: `localStorage` is acceptable only if the project already
     does it; new code should not add a second storage. Flag tokens in
     URL query strings as `blocker`.
   - Request params built from `route.query` / `route.params` passed
     straight to the API without type coercion.
   - Upload: file type checked by extension only, no size limit, no
     server-side validation mentioned.
   - Secrets or internal hostnames in client code.
4. **Performance pass**:
   - `deep: true` watchers on objects over ~10 fields; `reactive` /
     `ref` holding API lists over ~1k rows.
   - `v-for` without a stable `key`, or `key="index"` on a list that
     reorders or deletes.
   - Scroll / resize / input handlers without throttle or debounce.
   - Heavy work in `computed` that depends on a large array and runs on
     each keystroke.
   - Component imported statically on a route that is otherwise lazy.
5. **UX pass** (pages and dialogs only):
   - Loading, empty and error states exist for each request.
   - Destructive actions have a confirm; the confirm names the item.
   - Forms reset on dialog close; validation errors visible without
     scrolling; submit disabled while pending.
   - Strings hardcoded where the project uses i18n.
6. **Maintainability pass**:
   - Component over ~300 lines or over ~3 unrelated state groups.
   - Same API call written inline in two places instead of the api module.
   - Magic strings for status / type where a dictionary or enum exists.
   - New util that duplicates one in `utils/`.
7. **Test pass.** Map each behaviour change to a test. Missing test on a
   `blocker`-class path (money, permissions, deletion) is itself a
   `should`. Snapshot tests of whole pages count as no test.
8. **Write the review** in the format below. Order: blockers, shoulds,
   nits, then one line of verdict.

## Patterns

### Findings format

```
### Blockers
- `src/views/order/List.vue:84` Submit handler has no pending flag; double
  click creates two orders. Fix: `if (submitting.value) return` + set flag.

### Should
- `src/composables/useList.ts:21` Response can land out of order while
  typing in search. Fix: sequence counter, drop stale responses.

### Nits
- `src/views/order/Detail.vue:12` `data1` → `orderSummary`.

Verdict: request changes (1 blocker). Rest is solid, nice split of the
dialog into `OrderEditDialog.vue`.
```

### Race in a submit handler

```ts
// flagged
async function submit() {
  await api.createOrder(form)   // second click while awaiting → duplicate
  ElMessage.success('ok')
}

// fix
const submitting = ref(false)
async function submit() {
  if (submitting.value) return
  submitting.value = true
  try { await api.createOrder(form); ElMessage.success('ok') }
  finally { submitting.value = false }
}
```

### `v-html` from the API

```vue
<!-- flagged: content originates from a rich-text editor filled by users -->
<div v-html="article.body" />

<!-- fix: sanitize on the way in, once, with an allowlist -->
<div v-html="sanitize(article.body)" />
```

Server-side sanitisation is the real fix; flag the client side as
`blocker` only when the content path provably includes untrusted input.

### Keys in reorderable lists

```vue
<!-- flagged: deleting row 2 re-renders every row below, inputs keep old values -->
<Row v-for="(r, i) in rows" :key="i" />

<!-- fix -->
<Row v-for="r in rows" :key="r.id" />
```

### Reviewing what is not in the diff

When the diff adds a call to an existing function, read that function.
Reviews that stop at the diff boundary miss the majority of null-path
bugs; budget ~30% of review time for the callee side.

## Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| Review lists 30 items, author fixes the easy ones | No severity, no cap | Label severity, cap at ~10, group the rest |
| "Bug" turns out to be intended | Skipped reading issue and description | Intent pass first; ask before asserting |
| Blocker raised on a false positive | Pattern-matched `v-html` without tracing the source | Trace to origin; downgrade to "plausible" when unsure |
| Author argues about naming for two days | Nit was filed as `should` | Nits never block; mark them `nit` |
| Same comment on 12 files | Repeated instead of grouped | One finding with the file list |
| Review approves, prod double-submits | Pending flag check skipped on "simple" form | Run the correctness list on every handler that awaits |
| Review flags `localStorage` token as blocker in a project that always did that | Project convention not checked | Match severity to the delta the PR introduces |
| Findings cite wrong line numbers | Read a stale checkout | Review the branch head; quote the line text with the number |
| Reviewer rewrites the feature in comments | Scope creep | Suggest the minimal fix; file bigger ideas as a follow-up issue |

## Before you finish

- [ ] Each finding has `path:line`, symptom, one-line fix, and a severity.
- [ ] Every `blocker` was verified by reading the surrounding code, or is
  marked "plausible" with what to check.
- [ ] No finding duplicates an ESLint / Prettier rule the project runs.
- [ ] At most ~10 findings; the rest grouped.
- [ ] Verdict line states approve / approve with comments / request
  changes and the count of blockers.
- [ ] Files touched but not described in the PR were called out as a
  question.
- [ ] Test coverage of money / permission / deletion paths was checked.
