# Forms in 微信小程序 and uni-app

Companion to `vue-forms-validation/SKILL.md`. The rules (one source of
truth, blur + submit, single-flight submit, stable row keys) are the same;
the mechanics differ because there is no `v-model` in native WXML and no
`el-form`.

## Native 微信小程序

### Data flow

- Keep the model in `data.form` and a separate `data.errors` map. Update
  the model from `bindinput` / `bindchange` using `e.currentTarget.dataset.field`
  so one handler serves all inputs:

```js
onInput(e) {
  const { field } = e.currentTarget.dataset
  this.setData({ [`form.${field}`]: e.detail.value })
  if (this.data.errors[field]) this.validateField(field)      // clear a visible error as the user fixes it
},
onBlur(e) { this.validateField(e.currentTarget.dataset.field) },
```

- `setData` only the changed path and only the `errors` entry that changed;
  re-sending the whole `form` on each keystroke stutters on low-end phones.
- Keep validation state that is not rendered (`submitting`, debounce
  timers) on `this`, not in `data`.

### Rules

- Reuse the web rule table: `async-validator` (the engine under Element
  Plus) runs in 小程序 via npm support. Define rules once per form and share
  the format with the web app when both exist.
- Validate a single field on blur with `validator.validate(form, { keys: [field] })`;
  the whole form on submit. Map results into `errors` and `setData` the
  diff.
- Async rules (code sent, username free) go through the shared `request`
  wrapper with the same 300 ms debounce; show a spinner next to the field,
  not a global loading mask.

### Submit

- Use `<form bindsubmit>` with `form-type="submit"` on the button so the
  platform collects values from `name`d inputs as a fallback, but read from
  `data.form` for the real submit.
- Single-flight: `if (this.submitting) return; this.submitting = true` at the
  top of the handler; `wx.showLoading({ mask: true })` prevents a second tap
  on the whole screen while the request runs.
- On validation failure, `setData` the errors map and set `focus` on the
  first invalid input so the keyboard opens there; `wx.pageScrollTo` with a
  selector for the field's wrapper when it is off screen.
- Success: `wx.showToast`, then `navigateBack` with a flag the parent reads
  in `onShow`, or `redirectTo` the result page. Do not leave the filled
  form in the stack.

### Layout and keyboard

- `adjust-position` (default true) pushes the page up when the keyboard
  opens; fixed bottom bars need `cursor-spacing` on inputs or a
  `keyboardheightchange` handler.
- Mark numeric fields with `type="number"`/`"digit"`/`"idcard"` for the
  right keyboard; the value still arrives as a string.
- `maxlength` is enforced by the input; show the counter yourself.
- Picker and date fields have no blur: validate them on `bindchange`.

### Component-library forms

Vant Weapp (`van-field` with `error-message`), TDesign MiniProgram and WeUI
provide inputs and error display but not rules. Keep the rule table and
the `errors` map; pass `errors[field]` into the component's error prop.

## uni-app

- `uni-forms` + `uni-forms-item` with `:rules` and `ref.validate()` is the
  Element-Plus-like option; it also uses `async-validator` syntax, so rules
  can be shared with the web app's `el-form`.
- In uni-app with Vue 3 you have `v-model`, so `vee-validate` and a schema
  work on H5 and App, but check the 小程序 build: packages that touch
  `document`/`window` break there. Keep the schema in a plain module and
  test the mini-program target before committing to it.
- Validation messages must come from the same i18n table as the H5 build;
  `uni.setLocale` switches both.
- Use `#ifdef` blocks only for input types that differ per platform; the
  rules and the submit state machine stay platform-neutral.

## Differences checklist

| Web (Element Plus / vee-validate) | Native 小程序 |
| --- | --- |
| `v-model` | `bindinput` + `setData` by path |
| `el-form-item prop` / `defineField` | `data-field` on each input, `errors` map |
| `trigger: 'blur'` | `bindblur`; pickers validate on `bindchange` |
| `scroll-to-error` / focus first invalid | `focus` attribute + `wx.pageScrollTo` |
| `isSubmitting` | flag on `this` + `wx.showLoading({ mask: true })` |
| `resetForm({ values })` | `setData({ form: saved, errors: {} })` |
| Messages via `t()` | Same table, injected into `data.t` or resolved in JS before `setData` |
