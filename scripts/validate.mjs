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
  // references/*.md linked from SKILL.md must exist, and every reference file must be linked.
  const linked = new Set([...body.matchAll(/\]\((references\/[^)#\s]+)\)/g)].map((m) => m[1]));
  for (const ref of linked) if (!existsSync(join(skillsDir, dir, ref))) errors.push(`${where}: links ${ref} which does not exist`);
  const refDir = join(skillsDir, dir, "references");
  if (existsSync(refDir)) {
    for (const f of readdirSync(refDir).filter((f) => f.endsWith(".md"))) {
      if (!linked.has(`references/${f}`)) errors.push(`skills/${dir}/references/${f}: not linked from SKILL.md`);
      if (readFileSync(join(refDir, f), "utf8").split(/\r?\n/).length > MAX_LINES) errors.push(`skills/${dir}/references/${f}: over ${MAX_LINES} lines`);
    }
  }
  rows.push({ name: dir, lines, description: fm.description ?? "" });
}

// Plugin packaging: .claude-plugin/plugin.json and marketplace.json.
function readJson(rel) {
  const file = join(root, rel);
  if (!existsSync(file)) { errors.push(`${rel}: missing`); return null; }
  try { return JSON.parse(readFileSync(file, "utf8")); } catch (e) { errors.push(`${rel}: invalid JSON (${e.message})`); return null; }
}
const pkg = readJson("package.json");
const plugin = readJson(".claude-plugin/plugin.json");
const market = readJson(".claude-plugin/marketplace.json");
const ID_RE = /^[a-z0-9][a-z0-9._-]*$/i;
if (pkg && plugin) {
  for (const k of ["name", "version", "description", "author", "repository", "license", "keywords"]) {
    if (plugin[k] === undefined || plugin[k] === "") errors.push(`.claude-plugin/plugin.json: missing "${k}"`);
  }
  if (plugin.name && !ID_RE.test(plugin.name)) errors.push(`.claude-plugin/plugin.json: name "${plugin.name}" must be letters, digits, ., _ or -`);
  if (plugin.version !== pkg.version) errors.push(`.claude-plugin/plugin.json: version ${plugin.version} differs from package.json ${pkg.version}`);
  if (plugin.author && (typeof plugin.author !== "object" || !plugin.author.name)) errors.push(`.claude-plugin/plugin.json: author must be an object with "name"`);
  if (plugin.homepage && !/^https?:\/\//.test(plugin.homepage)) errors.push(`.claude-plugin/plugin.json: homepage must be a URL`);
  if (!Array.isArray(plugin.keywords) || plugin.keywords.length === 0) errors.push(`.claude-plugin/plugin.json: keywords must be a non-empty array`);
  if (plugin.skills !== undefined) errors.push(`.claude-plugin/plugin.json: do not set "skills"; the default skills/ directory is used`);
}
if (pkg && market) {
  for (const k of ["name", "owner", "plugins"]) if (market[k] === undefined) errors.push(`.claude-plugin/marketplace.json: missing "${k}"`);
  if (market.name && !ID_RE.test(market.name)) errors.push(`.claude-plugin/marketplace.json: name "${market.name}" must be letters, digits, ., _ or -`);
  if (market.owner && (typeof market.owner !== "object" || !market.owner.name)) errors.push(`.claude-plugin/marketplace.json: owner must be an object with "name"`);
  if (market.metadata?.version && market.metadata.version !== pkg.version) errors.push(`.claude-plugin/marketplace.json: metadata.version ${market.metadata.version} differs from package.json ${pkg.version}`);
  const entries = Array.isArray(market.plugins) ? market.plugins : [];
  if (entries.length !== 1) errors.push(`.claude-plugin/marketplace.json: expected exactly one plugin entry, found ${entries.length}`);
  for (const p of entries) {
    if (!p.name) errors.push(`.claude-plugin/marketplace.json: plugin entry without "name"`);
    if (plugin && p.name !== plugin.name) errors.push(`.claude-plugin/marketplace.json: entry name "${p.name}" must equal plugin.json name "${plugin.name}"`);
    if (!(p.source === "." || p.source === "./")) errors.push(`.claude-plugin/marketplace.json: plugin source must be "." (this repo is the plugin), got ${JSON.stringify(p.source)}`);
    if (p.version && p.version !== pkg.version) errors.push(`.claude-plugin/marketplace.json: plugin version ${p.version} differs from package.json ${pkg.version}`);
    if (!p.description) errors.push(`.claude-plugin/marketplace.json: plugin entry needs a description`);
  }
}
// README badge count must match the number of skills.
const badge = readme.match(/badge\/skills-(\d+)-/);
if (badge && Number(badge[1]) !== rows.length) errors.push(`README.md: skills badge says ${badge[1]}, there are ${rows.length} skills`);

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
