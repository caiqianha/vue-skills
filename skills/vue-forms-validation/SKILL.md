---
name: vue-forms-validation
description: Use when building or fixing forms and validation in a Vue 3 app — Element Plus el-form rules, headless forms with vee-validate plus zod or valibot, async uniqueness checks, dynamic field arrays, cross-field rules, translated error messages, submit/disable/reset state and error summaries, or the equivalent in a 微信小程序 / uni-app form. Enforces one schema as the source of truth, validation that runs on submit and on blur but never on every keystroke, submit state that cannot double-fire, and errors the user can actually find.
---
# Vue forms and validation

This skill covers data-entry forms: login and registration, admin create/edit
dialogs, multi-step wizards, settings pages and the mini-program versions of
the same. It applies whether the form uses Element Plus `el-form` rules or a
headless setup (`vee-validate` with a `zod` or `valibot` schema). "Good"
means the rules exist in one place, the user sees the first error without
hunting, double submits are impossible, and the form can be reset to a known
state. It does not cover table inline editing or rich-text editors. For the
surrounding admin page skeleton use `element-plus-admin`; for the request
layer use `api-layer-axios`.

## Non-negotiables

- **One source of truth for rules.** Either the `el-form` `rules` object or
  the schema, never both for the same field. Duplicated rules drift: the UI
  accepts what the submit rejects.
- **Pick the engine per form, not per field.** Element Plus rules for
  dialogs with under ~10 fields inside an admin app; `vee-validate` +
  schema when the form has arrays, wizards, conditional sections or must be
  reused outside Element Plus. Mixing both in one form doubles the state.
- **Validate on `blur` and on submit; show errors on `change` only after a
  field was touched.** Red text while the user types the second character
  of an email is the most common form complaint and it lowers completion.
- **Async rules are debounced (~300 ms), cancel stale results and run only
  when the sync rules pass.** A uniqueness check on every keystroke floods
  the backend and shows "taken" for a value the user has already changed.
- **Cross-field rules live on the dependent field and re-run when the
  source changes.** "Confirm password" validates against `password`; when
  `password` changes, re-validate `confirm`, or the user sees a stale pass.
- **Dynamic arrays get a stable key per row** (`crypto.randomUUID()` on
  push, or the server id), never the index. Index keys make the deleted
  row's error appear on its neighbour.
- **The submit button is disabled only while submitting, not while invalid.**
  Disabling until valid hides *why* it is disabled. Submit runs validation,
  shows the errors and scrolls to the first one.
- **Submit is single-flight.** `isSubmitting` (or a local flag) guards the
  handler itself, not just the button; Enter in a text input and a
  double-click both bypass a disabled attribute that lags one tick.
- **Error messages are translated at render time, not at schema creation.**
  A schema built once with `t()` keeps the first locale forever. Build it
  inside a `computed`/function or use message keys resolved in the template.
- **Server-side field errors map back onto fields.** A 422 with
  `{ email: 'already registered' }` becomes a field error via
  `setErrors`/`setFieldError`, not a toast, and clears when the user edits.
- **Reset means "back to initial values", and initial values change after a
  successful save.** Otherwise "Reset" on an edit form wipes the record to
  blanks and `dirty` never becomes false after saving.

## Workflow

1. **Write the data contract first**: the typed shape sent to the API, which
   fields are required, formats, limits and which checks need the server
   (uniqueness, coupon validity). Decide the engine from the form's shape.
2. **Model and rules side by side.** Element Plus: `reactive` model and a
   `rules` object keyed exactly like the model, `prop` on every
   `el-form-item`. Headless: `z.object`/`v.object` schema, `useForm({ validationSchema: toTypedSchema(schema) })`,
   `defineField` per input.
3. **Add async and cross-field rules** with debounce, cancellation and the
   re-validate hook on the source field. Confirm the backend returns field
   errors in a mappable shape.
4. **Wire the state machine**: `idle → submitting → (saved | failed)`.
   Success: toast, `resetForm({ values })` with the saved values, close or
   navigate. Failure: field errors mapped, a general error above the button,
   focus the first invalid field.
5. **Add the error summary** for forms longer than one screen or with more
   than ~8 fields: an `aria-live="polite"` list of messages linking to
   fields, plus scroll-to-first-error on submit.
6. **Translate messages** through the project's i18n with field labels
   interpolated; verify by switching locale with an error visible.
7. **Test by behaviour**: submit empty, fix one field, async rule with a slow
   network, double-click submit, reset after edit, locale switch. Test the
   schema with Vitest (`safeParse` cases) when it is non-trivial.

## Patterns

### Element Plus: rules keyed like the model, async with debounce

```ts
const form = reactive({ username: '', password: '', confirm: '' })
const formRef = ref<FormInstance>()
let checkTimer: number | undefined
const rules = computed<FormRules<typeof form>>(() => ({
  username: [
    { required: true, message: t('v.required', { field: t('f.username') }), trigger: 'blur' },
    { min: 3, max: 32, message: t('v.length', { min: 3, max: 32 }), trigger: 'blur' },
    { trigger: 'blur', asyncValidator: (_, v) => new Promise<void>((resolve, reject) => {
      clearTimeout(checkTimer)
      checkTimer = window.setTimeout(async () => (await checkUsernameFree(v)) ? resolve() : reject(t('v.taken')), 300)
    }) },
  ],
  password: [{ required: true, min: 8, message: t('v.minLength', { min: 8 }), trigger: 'blur' }],
  confirm: [{ trigger: 'blur', validator: (_, v, cb) => cb(v === form.password ? undefined : new Error(t('v.mismatch'))) }],
}))
watch(() => form.password, () => form.confirm && formRef.value?.validateField('confirm'))
```

`rules` as a `computed` re-renders messages on locale change. `validate()`
without a callback returns a promise that rejects with the invalid fields;
pair it with `scroll-to-error` on `el-form`.

### Element Plus: submit state and reset to saved values

```ts
const submitting = ref(false)
async function submit() {
  if (submitting.value) return                      // guards Enter + click
  submitting.value = true
  try {
    await formRef.value!.validate()                 // rejects → first invalid field scrolled into view
    const saved = await saveUser(form)
    Object.assign(form, saved)                      // new baseline for resetFields
    await nextTick(); formRef.value!.clearValidate()
    ElMessage.success(t('saved'))
  } catch (e) {
    if (isFieldErrors(e)) applyServerErrors(e.fields)   // shows under the inputs
    // validation rejection: nothing to do, Element Plus already rendered it
  } finally { submitting.value = false }
}
```

`resetFields()` restores the values present when the form *mounted*, so an
edit dialog must call it before assigning the record (see
`element-plus-admin`).

### Headless: vee-validate + schema, field arrays, cross-field

```ts
const schema = computed(() => toTypedSchema(z.object({
  email: z.string().min(1, t('v.required')).email(t('v.email')),
  password: z.string().min(8, t('v.minLength', { min: 8 })),
  confirm: z.string(),
  contacts: z.array(z.object({ phone: z.string().regex(/^1\d{10}$/, t('v.phone')) })).min(1, t('v.atLeastOne')),
}).refine((d) => d.password === d.confirm, { path: ['confirm'], message: t('v.mismatch') })))

const { handleSubmit, defineField, validateField, errors, isSubmitting, meta, resetForm, setErrors } =
  useForm({ validationSchema: schema, initialValues: { email: '', password: '', confirm: '', contacts: [{ phone: '' }] } })
const [email, emailAttrs] = defineField('email', { validateOnModelUpdate: false })   // blur/submit only
const { fields: contacts, push, remove } = useFieldArray<{ phone: string }>('contacts')

const onSubmit = handleSubmit(
  async (values) => { const saved = await register(values); resetForm({ values: saved }) },
  ({ errors }) => document.querySelector<HTMLElement>(`[name="${Object.keys(errors)[0]}"]`)?.focus(),
)
```

```vue
<div v-for="(row, i) in contacts" :key="row.key">
  <input v-model="row.value.phone" :name="`contacts[${i}].phone`" @blur="validateField(`contacts[${i}].phone`)" />
  <span>{{ errors[`contacts[${i}].phone`] }}</span>
  <button type="button" @click="remove(i)">×</button>
</div>
```

`row.key` from `useFieldArray` is the stable per-row key. A reactive schema
(computed) re-validates with the new locale when `t` changes. Check the
adapter's `peerDependencies` before picking the schema library version:
`@vee-validate/zod` 4.15 declares `zod ^3.24`, so a zod 4 project either
imports from the `zod/v3` entry or uses `@vee-validate/valibot` (`valibot ^1`).

### Async field rule in a schema, run only after sync rules pass

```ts
// wrong: fires on every keystroke and on invalid input
username: z.string().refine(async (v) => await isFree(v), 'taken')

// right: sync checks first, async only for plausible values, debounced caller
username: z.string().min(3).max(32).superRefine(async (v, ctx) => {
  if (!(await isFreeDebounced(v))) ctx.addIssue({ code: 'custom', message: t('v.taken') })
}),
```

`isFreeDebounced` wraps the API call in a 300 ms debounce that resolves the
latest call only; `validateOnModelUpdate: false` on that field keeps the
check on blur.

### Error summary with live region

```vue
<ul v-if="submitted && Object.keys(errors).length" role="alert" aria-live="polite" class="form-errors">
  <li v-for="(msg, field) in errors" :key="field">
    <a :href="`#${field}`" @click.prevent="focusField(field)">{{ labels[field] }}: {{ msg }}</a>
  </li>
</ul>
```

Show it after the first submit attempt, above the submit button on long
forms and at the top on wizards. Field labels, not field names.

### Mini-program forms in brief

No two-way binding and no form library by default. Keep a plain `form`
object on `data`, update it from `bindinput` (`e.detail.value`), validate on
submit with the same rule table you use on the web (`async-validator` runs
in 小程序), and `setData` only the `errors` map. Mark the first error field
with `focus` so the keyboard opens there. Details and a uni-app variant in
[references/miniprogram-forms.md](references/miniprogram-forms.md); deeper
vee-validate recipes (wizards, conditional sections, testing schemas) in
[references/vee-validate-recipes.md](references/vee-validate-recipes.md).

## Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| Field shows required error while typing first letters | `trigger: 'change'` or `validateOnModelUpdate` default | `blur` trigger; `validateOnModelUpdate: false` |
| `validate()` passes with empty required field | `prop` missing or spelled differently than the rule key | `prop` = model key = rule key |
| "Username taken" after the user changed it | Async result applied out of order | Debounce and resolve only the latest call |
| Confirm password stays valid after password edited | No re-validation of dependent field | `watch` source → `validateField('confirm')` |
| Deleting row 2 shows row 2's error on row 3 | `:key="i"` | Stable key from `useFieldArray` `row.key` or an id |
| Form submits twice on fast double-click | Only the button is disabled | Guard inside the handler with `isSubmitting`/flag |
| Submit button disabled with no visible reason | `:disabled="!meta.valid"` | Enable it; validate on click and show errors |
| Messages stay in the old language | Schema/rules created once | `computed` rules/schema, or message keys resolved in the template |
| Reset on an edit dialog wipes to blanks | Initial values are blanks | `resetForm({ values })` / assign before `resetFields` snapshot |
| `dirty` stays true after save | Initial values not updated | `resetForm({ values: saved })` |
| 422 field errors shown as a toast only | No mapping to fields | `setErrors(map)` / per-field `error` state |
| `toTypedSchema` type errors after upgrading zod | Adapter peer range not met | Match the adapter's `peerDependencies` or switch to valibot |
| First error is below the fold, user thinks submit failed silently | No scroll/focus | `scroll-to-error` / focus first invalid in `onInvalidSubmit` |
| Date picker value fails a string rule | Model holds `Date` | `value-format` on the picker, or a `z.coerce.date()` |
| Number input sends `""` | Empty string from input | `el-input-number`, or `z.coerce.number()` with `min` |
| Mini-program errors do not update | Mutating `this.data.errors` | `setData({ errors })` with the new map |

## Before you finish

- [ ] Each field's rules exist in exactly one place; model keys, `prop`s and
      rule keys match.
- [ ] Validation triggers on blur and submit; nothing validates on every
      keystroke except explicitly chosen fields.
- [ ] Async rules are debounced, ordered and skipped when sync rules fail.
- [ ] Dependent fields re-validate when their source changes.
- [ ] Array rows use stable keys; add/remove keeps errors on the right row.
- [ ] Submit handler is single-flight; button disabled only while submitting.
- [ ] Server field errors land on fields; a general failure message exists.
- [ ] Reset returns to the last saved values; `dirty` is false after save.
- [ ] Messages switch with the locale while an error is visible.
- [ ] Walked: empty submit, fix one field, slow async, double-click, reset
      after edit; the first error is scrolled into view or focused.
