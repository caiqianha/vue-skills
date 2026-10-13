# Extracting hardcoded strings and reviewing for them

Companion to `vue-i18n-setup/SKILL.md`. Two jobs: converting an existing
app, and keeping new PRs clean.

## Finding the strings

Run these from the project root and keep the counts in the migration log
so progress is visible:

```bash
# CJK text anywhere in templates and scripts
rg -n '[\p{Script=Han}]' src --glob '*.vue' --glob '*.ts' --glob '*.js' --glob '!**/locales/**' | wc -l
# quoted sentences in script (two or more words with a space, capitalised, English projects)
rg -n "['\"][A-Z][a-z]+ [a-z]" src --glob '*.ts' --glob '*.vue' --glob '!**/*.spec.*' | wc -l
# attributes that carry user-facing text
rg -n '(placeholder|title|label|aria-label|alt)="[^{]' src --glob '*.vue' | wc -l
```

Add the ESLint rules from `@intlify/eslint-plugin-vue-i18n` so the same
search runs on every PR: `no-raw-text` (templates), `no-missing-keys`,
`no-unused-keys`, `no-dynamic-keys` as a warning (dynamic enum keys are
legitimate but must be whitelisted with a comment).

## Conversion order

1. **Shared UI first**: layout, navigation, buttons (`common.actions.*`),
   table empty states, confirm dialogs. These appear on every page and
   make the switch visibly work early.
2. **One feature folder at a time**, template → script → constants. Finish
   and merge a feature before starting the next; half-converted features
   are the ones that stay half-converted.
3. **Constants and enums last**: `const STATUS = [{ value: 1, label: '已支付' }]`
   becomes codes plus a `statusLabel(code) => t('order.status.' + code)` or
   a `computed` list built inside setup, because a module-level constant
   evaluated once cannot react to locale changes.
4. **Backend-provided text** (error messages, dictionary labels) is a
   contract decision: either the backend returns codes and the frontend
   translates, or the frontend sends `Accept-Language` and displays what it
   gets. Pick one per API and write it down; do not do both.

## Key naming

- `feature.area.meaning`: `order.list.title`, `order.form.amountRequired`,
  `common.actions.save`. Three levels max.
- Verbs for actions (`save`, `exportCsv`), nouns for labels (`amount`),
  `*Hint`, `*Placeholder`, `*Error` suffixes for secondary text.
- Reuse `common.*` for words that mean the same thing everywhere; do not
  reuse a feature key in another feature just because the text matches
  today.
- Never encode the value in the key (`red`, `top`); encode the meaning
  (`danger`, `primary`).

## Hand-off to translators

- Export the default locale's files as they are (JSON) or flatten to CSV
  with columns `key, source, translation, context`. Fill `context` for
  anything under 3 words; "Close" the verb and "Close" the adjective are
  different entries in many languages.
- Placeholders (`{count}`, `{name}`, `@:common.appName`) must survive
  translation unchanged; run the parity script plus a placeholder diff on
  the returned files before merging.
- Lock the pipe character `|` in plural messages; translators often replace
  it with a slash.

## Review checklist for a PR in an i18n project

Block the PR if any of these contain literal user-facing text:

- [ ] Template text nodes and `{{ }}` expressions with string literals.
- [ ] `placeholder`, `title`, `label`, `alt`, `aria-label`, `confirm-button-text`
      and similar props.
- [ ] `ElMessage` / `ElMessageBox` / `ElNotification` calls, toasts,
      `console`-visible errors shown to users.
- [ ] Validation rule `message` fields and schema messages.
- [ ] Enum/dictionary label arrays and status maps.
- [ ] Route `meta.title`, breadcrumb and tab names; `document.title` writes.
- [ ] Date and number formatting with hardcoded patterns or units
      (`'YYYY年MM月DD日'`, `+ ' 元'`).
- [ ] Strings built by concatenation or template literals from fragments.
- [ ] Keys added to the default locale but missing from the others (parity
      script output).
- [ ] New `v-html` with translated content.
- [ ] Images containing text without a per-locale variant.
- [ ] Tests asserting on translated text instead of keys or roles.

Allowed without a key: developer-facing logs, `data-testid`, class names,
API field names, and fixtures in tests.

## Measuring done

- `rg` counts above trend to zero (minus whitelisted files).
- Lint rules enabled as errors, not warnings.
- Parity script green for every locale.
- A manual locale switch on the three most-used pages shows no untranslated
  text, including dialogs and empty states.
