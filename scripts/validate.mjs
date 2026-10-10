#!/usr/bin/env node
// Zero-dependency validator for skills/*/SKILL.md.
// Checks frontmatter, naming, size limits and README coverage.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = join(root, "skills");
const listOnly = process.argv.includes("--list");
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_LINES = 500;
const MIN_LINES = 60;
const MAX_DESC = 1024;

function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    fm[k] = v;
  }
  return { fm, body: text.slice(m[0].length) };
}

const readme = existsSync(join(root, "README.md")) ? readFileSync(join(root, "README.md"), "utf8") : "";
const dirs = readdirSync(skillsDir).filter((d) => statSync(join(skillsDir, d)).isDirectory()).sort();
const errors = [];
const rows = [];

for (const dir of dirs) {
  const file = join(skillsDir, dir, "SKILL.md");
  const where = `skills/${dir}/SKILL.md`;
  if (!existsSync(file)) { errors.push(`${where}: missing`); continue; }
  const text = readFileSync(file, "utf8");
  const parsed = parseFrontmatter(text);
  if (!parsed) { errors.push(`${where}: no YAML frontmatter`); continue; }
  const { fm, body } = parsed;
  const lines = text.split(/\r?\n/).length;
  if (!NAME_RE.test(dir)) errors.push(`${where}: directory name must be lowercase-hyphenated`);
  if (fm.name !== dir) errors.push(`${where}: frontmatter name "${fm.name}" must equal directory "${dir}"`);
  if (!fm.description || fm.description.length < 40) errors.push(`${where}: description missing or too short (<40 chars)`);
  if (fm.description && fm.description.length > MAX_DESC) errors.push(`${where}: description longer than ${MAX_DESC} chars`);
  if (fm.description && !/^use when/i.test(fm.description)) errors.push(`${where}: description should start with "Use when ..." so agents know the trigger`);
  if (lines > MAX_LINES) errors.push(`${where}: ${lines} lines, keep SKILL.md under ${MAX_LINES} (move detail to references/)`);
  if (lines < MIN_LINES) errors.push(`${where}: only ${lines} lines, too thin to be useful`);
  if (!/^# /m.test(body)) errors.push(`${where}: body needs an H1 title`);
  for (const h of ["Non-negotiables", "Pitfalls", "Before you finish"]) {
    if (!new RegExp(`^## .*${h}`, "mi").test(body)) errors.push(`${where}: missing section "## ${h}"`);
  }
  if (/\t/.test(body)) errors.push(`${where}: contains tab characters, use spaces`);
  if (readme && !readme.includes(`skills/${dir}/`)) errors.push(`README.md: skill "${dir}" is not listed`);
  rows.push({ name: dir, lines, description: fm.description ?? "" });
}

if (listOnly) {
  for (const r of rows) console.log(`${r.name.padEnd(28)} ${String(r.lines).padStart(4)} lines  ${r.description.slice(0, 80)}`);
  process.exit(0);
}

console.log(`${rows.length} skills checked`);
for (const r of rows) console.log(`  ok  ${r.name} (${r.lines} lines)`);
if (errors.length) {
  console.error(`\n${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("all good");
