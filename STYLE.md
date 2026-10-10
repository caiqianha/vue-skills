# How a skill in this repo is written

Agents already know the Vue, Element Plus and WeChat APIs. A skill earns its
place only if it changes what the agent *does*: picks a better default, avoids
a known trap, or checks its work before it says "done". Everything else is
noise that costs context tokens on every turn.

## Rules

1. **Judgment, not documentation.** Never paste API signatures or option
   tables the model can recall. Write the decision the model gets wrong.
2. **Imperative voice.** "Use `shallowRef` for lists over 1k rows", not
   "it is recommended to consider".
3. **Every rule carries a reason** in half a sentence. Rules without reasons
   get ignored or over-applied.
4. **Code only where words are ambiguous.** Snippets are 3–15 lines, show
   the wrong and the right version side by side when the difference is subtle.
5. **Concrete thresholds.** "Over 10 pages in the stack" beats "too many".
6. **Original content.** No copied docs, blog text or licensed material.
   Trademarks (微信, Element Plus, DCloud) are referenced only to name the
   technology.
7. **English body, Chinese terms where the ecosystem uses them**
   (分包, 云开发, 审核). Keep CJK for proper nouns the reader would search.
8. **Under 500 lines.** Longer material goes into `references/*.md` inside
   the skill folder and is linked from SKILL.md.

## Required layout

```
---
name: <same as folder, lowercase-hyphenated>
description: Use when <trigger>. <What it enforces in one sentence>.
---
# <Title>

<2–4 sentences: scope, what "good" looks like, when NOT to apply.>

## Non-negotiables
<5–12 bullets. Each: rule + why.>

## Workflow
<Numbered steps the agent follows for the typical task of this skill.>

## Patterns
<2–6 subsections with short wrong/right snippets.>

## Pitfalls
<Table or bullets: symptom → cause → fix.>

## Before you finish
<Checklist the agent runs before reporting completion.>
```

`node scripts/validate.mjs` enforces the frontmatter, the three mandatory
sections and the size limits.
