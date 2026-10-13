---
type: llm
weight: 2
---

Score the final answer against these criteria. A good answer satisfies all of them; each missed criterion lowers the score proportionally.

- Defines the rules in a single schema (zod or valibot) passed through toTypedSchema; no duplicated el-form rules
- Validates on blur and submit, not on every keystroke (validateOnModelUpdate: false or equivalent)
- Implements the username check as a debounced async rule that runs only after sync rules pass and ignores stale results
- Cross-field confirm-password rule uses refine with path ['confirm'] (or equivalent) and re-validates when password changes
- Dynamic contacts use useFieldArray with the row key, not the index
- Submit is single-flight via isSubmitting (or a flag inside the handler); the button is disabled only while submitting
- Maps server field errors with setErrors and resets the form to the saved values after success
- Mentions checking the adapter's peerDependencies before choosing the zod major version
