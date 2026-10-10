---
name: element-plus-admin
description: Use when building or changing admin (中后台) pages with Element Plus — list pages with search form, el-table and pagination, create/edit dialogs, form validation, exports and permission-gated buttons. Enforces the page skeleton, state handling and Element Plus-specific traps that make CRUD pages consistent and bug-free.
---
# Element Plus admin pages

This skill applies to Vue 3 + Element Plus back-office apps (后台管理系统):
list pages, detail pages, dialog/drawer forms, bulk actions and exports. It
assumes `<script setup lang="ts">` and the project conventions from
`vue3-composition`. "Good" means a new teammate can open any list page and
find the same skeleton, the same loading/empty/error behaviour and the same
button placement. It does not cover marketing sites or mobile layouts.

## Non-negotiables

- **Copy the project's existing list page skeleton before inventing one.**
  Admin apps live or die on consistency; a page that puts the search form
  under the table is a bug even if it works.
- **One `query` object drives the list**: search fields + `page` + `pageSize`.
  Searching resets `page` to 1; changing page size resets `page` to 1. Every
  "why does page 3 show nothing" report comes from skipping this.
- **One dialog serves create and edit.** Distinguish by `form.id` being
  present, not by a boolean prop that drifts out of sync. Title and submit
  endpoint derive from `form.id`.
- **Forms always go through `FormInstance.validate()` before submit**, and
  `resetFields()` after close. Pre-filling edit data must happen *after* the
  dialog's form is mounted (`await nextTick()`), or `resetFields()` later
  resets to the edited values instead of the blanks.
- **Destructive actions need `ElMessageBox.confirm`** with the record name in
  the text ("删除用户 张三？"), never a generic "确定吗？".
- **`row-key` on every `el-table` that uses selection, expand or tree rows.**
  Without it, selection state silently breaks on refresh and expand toggles
  the wrong row.
- **Formatting lives in column slots or a `formatter` function**, never in a
  computed copy of the rows. Copies double memory and desync after edits.
- **Theme via CSS variables (`--el-color-primary`) at `:root` or a wrapper**,
  not SCSS `@forward` overrides, unless the project already does SCSS. CSS
  vars switch at runtime and survive Element Plus upgrades.
- **Buttons are gated by permission codes** (`v-permission="'user:update'"`
  or the project's equivalent). Hidden is not enough: the API must also
  reject, but the UI must not show what the user cannot do.
- **Loading has three states, not one**: `loading` (skeleton or `v-loading`),
  empty (`el-empty` inside the table's `empty` slot with a hint), error (a
  retry button). A blank table after a failed request is a bug.

## Workflow

1. **Collect the contract**: list endpoint, its query params, page/pageSize
   names (`pageNum`/`pageSize` vs `page`/`size`), response shape
   (`{ list, total }` vs `{ records, total }`), and the create/update/delete
   endpoints. Write the typed API module first (`api-layer-axios`).
2. **Build the page from top to bottom**: search `el-form` (inline) → toolbar
   (create / bulk delete / export, right-aligned) → `el-table` → `el-pagination`
   (right-aligned, `layout="total, sizes, prev, pager, next, jumper"`).
3. **Wire the list composable** (`useList` or the project's `useTable`): it
   owns `rows`, `total`, `loading`, `load(query)`, and drops out-of-order
   responses. The page owns `query` and calls `load` on search, reset, page
   change and after every mutation.
4. **Build the form dialog as its own component** (`UserFormDialog.vue`)
   exposing `open(row?)`. Rules live next to the form model; async rules
   (username uniqueness) go through the API module and debounce ~300 ms.
5. **Add permissions, confirm dialogs and messages**: success → `ElMessage.success`
   then `load()`; failure is shown by the API layer, not by the page.
6. **Check it in the browser at 1280 px and 1920 px width**, with 0 rows, 1 row
   and a full page, then with a failing request (devtools offline). Run the
   type-check before reporting done.

## Patterns

### Query, search and reset

```ts
const query = reactive({ keyword: '', status: undefined as number | undefined, dateRange: [] as string[], page: 1, pageSize: 20 })
function search() { query.page = 1; load(toParams(query)) }
function reset() { searchFormRef.value?.resetFields(); search() }
function toParams(q: typeof query) {
  const [startTime, endTime] = q.dateRange ?? []      // backend wants two fields
  const { dateRange, ...rest } = q
  return { ...rest, startTime, endTime }
}
```

`resetFields` only resets fields rendered inside `el-form-item` with a `prop`;
a filter outside the form keeps its value and surprises the user.

### Dialog that serves create and edit

```ts
const form = reactive<UserForm>({ id: undefined, name: '', role: undefined })
const visible = ref(false)
async function open(row?: User) {
  visible.value = true
  await nextTick()                       // form is now mounted
  formRef.value?.resetFields()           // snapshot of blanks is correct
  if (row) Object.assign(form, pick(row, Object.keys(form)))
}
async function submit() {
  await formRef.value!.validate()        // throws on failure, no if needed
  form.id ? await updateUser(form) : await createUser(form)
  ElMessage.success(form.id ? '已更新' : '已创建')
  visible.value = false
  emit('saved')
}
```

Use `destroy-on-close` only when the dialog hosts heavy children (editors,
maps). For ordinary forms keep it mounted and rely on `resetFields`.

### Column formatting

```vue
<!-- wrong: a computed copy of rows just to format a date -->
<!-- right -->
<el-table-column label="创建时间" prop="createdAt" width="170" :formatter="(_, __, v) => fmtDateTime(v)" />
<el-table-column label="状态" width="90">
  <template #default="{ row }">
    <el-tag :type="row.status === 1 ? 'success' : 'info'">{{ statusLabel(row.status) }}</el-tag>
  </template>
</el-table-column>
```

### Remote select with typed value

```vue
<el-select v-model="form.deptId" filterable remote :remote-method="searchDept" :loading="deptLoading" clearable>
  <el-option v-for="d in deptOptions" :key="d.id" :label="d.name" :value="d.id" />
</el-select>
```

Load the currently selected option into `deptOptions` when editing, or the
select shows the raw id. Keep the `value` type stable: an id that is a number
on the row but a string in the option never matches.

### Export / download

```ts
async function exportList() {
  exporting.value = true
  try { await downloadFile(exportUsers(toParams(query)), 'users.xlsx') }   // api layer handles blob + filename
  finally { exporting.value = false }
}
```

Export uses the same `toParams(query)` as the list, without `page`/`pageSize`
unless the backend paginates exports. Disable the button while exporting.

### Big tables

Above ~2k rows rendered at once, switch to `el-table-v2` (virtualized) or
paginate server-side. Below that, set a fixed `height` so the header sticks
and the page does not grow past the viewport. `max-height` plus
`:style="{ height: 'calc(100vh - 220px)' }"` is the usual admin layout.

## Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| Edit dialog "reset" restores edited values | `resetFields` snapshot taken after assigning row data | `await nextTick(); resetFields()` before `Object.assign` |
| `validate()` says valid for an empty field | `prop` missing on `el-form-item` or rule key mismatch | `prop` must equal the key in `rules` and in the model |
| Selection lost after reload | No `row-key`, or rows replaced by new objects | `row-key="id"` and `reserve-selection` on the column |
| Page 3 empty after a new search | `page` not reset | `query.page = 1` in `search()` |
| Select shows a number instead of the label | Option list does not contain the current value | Preload the selected option when editing |
| Date picker sends `[Date, Date]` | No `value-format` | `value-format="YYYY-MM-DD"` and split into two params |
| Table spills past the viewport, pagination hidden | No `height` on `el-table` | Fixed height or `calc(100vh - header)` |
| Buttons render for users without permission | Only the API checks | Permission directive plus API check |
| "确定吗？" confirm on delete | Generic text | Put the record name in the message |
| Table lags on sort/filter with 5k rows | Full reactive rows | `shallowRef` rows, server-side sort, or `el-table-v2` |
| Dialog form keeps previous errors | No `clearValidate` on open | `resetFields` already clears; if using `v-if`, remount |
| Theme override ignored after upgrade | SCSS variable map changed | Use `--el-color-*` CSS vars |

## Before you finish

- [ ] Search resets `page`, page size change resets `page`, all paths call `load`.
- [ ] Create and edit share one dialog; `resetFields` runs before pre-fill.
- [ ] Every `el-table` with selection/expand/tree has `row-key`.
- [ ] Delete and other destructive actions confirm with the record name.
- [ ] Loading, empty and error states each render something sensible.
- [ ] Buttons carry permission codes; export reuses `toParams(query)`.
- [ ] Verified in browser with 0 rows, 1 row, full page and a failed request.
- [ ] Type-check passes; no computed copies of row arrays.
