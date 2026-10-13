#!/usr/bin/env node
// Model-free trigger check for skills/*/SKILL.md descriptions.
//
// For every evals/triggers/<skill>.json it tokenises the skill's frontmatter
// description (plus the skill name) and each prompt, then:
//   - FAILS when a trigger prompt shares no key term with the description
//     (the description is too vague to make the agent pick the skill);
//   - FAILS when a negative prompt shares NEG_MAX or more key terms with the
//     description (the description is so broad it would fire on anything);
//   - FAILS when a skill has no trigger file, too few prompts, or when a
//     trigger file names a skill that does not exist.
// It also checks that every skill has a positive case in evals/<skill>/ for
// `claude plugin eval` and that the case's skill-fired grader targets it.
//
// Matching is deliberately crude: lowercase, a tiny stemmer, prefix match
// for words of 5+ letters, substring match for CJK runs. It catches vague
// descriptions, not subtle ones; the model-based suite covers the rest.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = join(root, "skills");
const triggersDir = join(root, "evals", "triggers");
const verbose = process.argv.includes("--verbose");
const MIN_TRIGGERS = 3;
const MAX_TRIGGERS = 5;
const MIN_NEGATIVES = 2;
const NEG_MAX = 3; // a negative prompt sharing this many terms means the description is too broad

const STOP = new Set(`
a an and are as at be by for from has have how i in into is it its my of on or our so that the this to
use used uses using when with without we you your will should can could do does not no into onto than
then there these those what which who whose why where while also any all some both each one two three
app apps application applications project projects code codebase page pages component components file files
vue vue3 js ts javascript typescript web frontend front end build building built make making write writing
add adding new change changing fix fixing help me show explain give get set setup up out over under before after
enforces enforce enforced rule rules check checks checking plus equivalent approach work works working
`.split(/\s+/).filter(Boolean));

function stem(w) {
  let s = w.replace(/iz/g, "is");
  if (s.length > 5 && s.endsWith("ation")) s = s.slice(0, -5);
  else if (s.length > 5 && s.endsWith("ing")) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith("ies")) s = s.slice(0, -3) + "y";
  else if (s.length > 4 && s.endsWith("ed")) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss")) s = s.slice(0, -1);
  if (s.length > 4 && s.endsWith("e")) s = s.slice(0, -1);
  return s;
}

function tokenize(text) {
  const latin = new Set();
  const cjk = new Set();
  for (const run of text.toLowerCase().match(/[\p{Script=Han}]+/gu) ?? []) cjk.add(run);
  const words = text.toLowerCase().replace(/[\p{Script=Han}]+/gu, " ").match(/[a-z0-9][a-z0-9+#@./-]*[a-z0-9+#]|[a-z0-9]/g) ?? [];
  for (const raw of words) {
    for (const part of raw.split(/[./@-]+/)) {
      if (!part || STOP.has(part)) continue;
      const bare = part.replace(/\d+$/, "");
      for (const w of new Set([part, bare])) {
        if (!w || STOP.has(w) || w.length < 2) continue;
        latin.add(stem(w));
      }
    }
  }
  return { latin, cjk };
}

function overlap(a, b) {
  const hits = new Set();
  for (const x of a.latin) {
    for (const y of b.latin) {
      if (x === y || (x.length >= 5 && y.length >= 5 && (x.startsWith(y) || y.startsWith(x)))) { hits.add(x); break; }
    }
  }
  for (const x of a.cjk) for (const y of b.cjk) if (x.includes(y) || y.includes(x)) hits.add(x);
  return [...hits];
}

function description(skill) {
  const file = join(skillsDir, skill, "SKILL.md");
  if (!existsSync(file)) return null;
  const m = readFileSync(file, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const line = m?.[1].split(/\r?\n/).find((l) => l.startsWith("description:"));
  return line ? line.slice("description:".length).trim().replace(/^["']|["']$/g, "") : null;
}

const skills = readdirSync(skillsDir).filter((d) => statSync(join(skillsDir, d)).isDirectory()).sort();
const triggerFiles = existsSync(triggersDir) ? readdirSync(triggersDir).filter((f) => f.endsWith(".json")) : [];
const errors = [];
let checked = 0;

for (const f of triggerFiles) {
  const name = f.replace(/\.json$/, "");
  if (!skills.includes(name)) errors.push(`evals/triggers/${f}: no skill named "${name}"`);
}

for (const skill of skills) {
  const file = join(triggersDir, `${skill}.json`);
  const where = `evals/triggers/${skill}.json`;
  if (!existsSync(file)) { errors.push(`${where}: missing (every skill needs trigger prompts)`); continue; }
  let data;
  try { data = JSON.parse(readFileSync(file, "utf8")); } catch (e) { errors.push(`${where}: invalid JSON (${e.message})`); continue; }
  if (data.skill !== skill) errors.push(`${where}: "skill" must be "${skill}"`);
  const triggers = Array.isArray(data.triggers) ? data.triggers : [];
  const negatives = Array.isArray(data.negatives) ? data.negatives : [];
  if (triggers.length < MIN_TRIGGERS || triggers.length > MAX_TRIGGERS) errors.push(`${where}: need ${MIN_TRIGGERS}-${MAX_TRIGGERS} triggers, found ${triggers.length}`);
  if (negatives.length < MIN_NEGATIVES) errors.push(`${where}: need at least ${MIN_NEGATIVES} negatives, found ${negatives.length}`);
  if (data.rubric !== undefined && (!Array.isArray(data.rubric) || data.rubric.length < 3)) errors.push(`${where}: rubric must list at least 3 criteria`);

  const desc = description(skill);
  if (!desc) { errors.push(`skills/${skill}/SKILL.md: no description to match against`); continue; }
  const descTokens = tokenize(`${skill.replace(/-/g, " ")} ${desc}`);

  for (const p of triggers) {
    const hits = overlap(tokenize(p), descTokens);
    if (verbose) console.log(`  + ${skill}: [${hits.join(", ")}] ${p}`);
    if (hits.length === 0) errors.push(`${where}: trigger shares no key term with the description: "${p}"`);
  }
  for (const p of negatives) {
    const hits = overlap(tokenize(p), descTokens);
    if (verbose) console.log(`  - ${skill}: [${hits.join(", ")}] ${p}`);
    if (hits.length >= NEG_MAX) errors.push(`${where}: negative prompt overlaps the description on ${hits.length} terms (${hits.join(", ")}): "${p}"`);
  }

  const caseDir = join(root, "evals", skill);
  const prompt = join(caseDir, "prompt.md");
  const graders = join(caseDir, "graders");
  if (!existsSync(prompt)) errors.push(`evals/${skill}/prompt.md: missing (claude plugin eval case)`);
  else {
    const graderFiles = existsSync(graders) ? readdirSync(graders).filter((g) => g.endsWith(".md")) : [];
    const fired = graderFiles.some((g) => readFileSync(join(graders, g), "utf8").includes(`${skill}"`));
    if (!fired) errors.push(`evals/${skill}/graders/: no grader asserting that "${skill}" fired`);
    if (data.rubric && !graderFiles.some((g) => /^type:\s*llm/m.test(readFileSync(join(graders, g), "utf8")))) errors.push(`evals/${skill}/graders/: rubric declared in triggers but no llm grader`);
  }
  checked++;
}

console.log(`${checked} skills trigger-checked`);
if (errors.length) {
  console.error(`\n${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("all triggers overlap their descriptions; negatives stay below the overlap limit");
