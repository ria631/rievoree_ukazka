#!/usr/bin/env node
// Verifies every element → code mapping the X-ray code view relies on:
//   1. each `focus` needle in src/components/xray/codeMap.ts exists in its file,
//   2. each mapped file is registered in src/components/xray/sources.ts,
//   3. each data-tour id in the map is actually present somewhere in src/.
// So "show me the code of this element" can never open on nothing.
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const root = new URL("..", import.meta.url).pathname
const read = (p) => readFileSync(join(root, p), "utf8")

let src = read("src/components/xray/codeMap.ts")
src = src
  .replace(/P\("(\w+)"\)/g, '"src/pages/$1.tsx"')
  .replace(/\bCHARTS\b(?!\s*=)/g, '"src/components/charts/FinancialCharts.tsx"')
  .replace(/\bAGG\b(?!\s*=)/g, '"src/lib/data/aggregate.ts"')
  .replace(/MIG\("([\w-]+)"\)/g, '"supabase/migrations/$1.sql"')

const sources = read("src/components/xray/sources.ts")
const refRe = /file:\s*"([^"]+)",\s*focus:\s*(?:'([^']+)'|"([^"]+)")/g
const idRe = /^\s*"([\w-]+)":\s*\{\s*title:/gm

let failures = 0
for (const m of src.matchAll(refRe)) {
  const [, file, a, b] = m
  const needle = a ?? b
  let text
  try { text = read(file) } catch { console.error(`✗ missing file: ${file}`); failures++; continue }
  if (!text.includes(needle)) { console.error(`✗ needle not found in ${file}: ${needle}`); failures++ }
  if (!sources.includes(`"${file}"`)) { console.error(`✗ not registered in sources.ts: ${file}`); failures++ }
}

// Anchors: the id must appear as data-tour="id" / tour="id" in real UI code
// (not counting the map itself or the tour script that references it).
const ui = []
const walk = (d) => {
  for (const f of readdirSync(join(root, d))) {
    const p = join(d, f)
    if (statSync(join(root, p)).isDirectory()) walk(p)
    else if (/\.tsx$/.test(f) && !/codeMap|Tour|tour\//.test(p)) ui.push(read(p))
  }
}
walk("src")
const corpus = ui.join("\n")
// Anchors built from a template (e.g. the X-ray tab body: data-tour={`xray-${tab}`}).
const DYNAMIC = [[/^xray-(calls|rls|sql|pipeline|code|arch)$/, "data-tour={`xray-${tab}`}"]]
for (const m of src.matchAll(idRe)) {
  const id = m[1]
  const dyn = DYNAMIC.find(([re]) => re.test(id))
  if (dyn ? !corpus.includes(dyn[1]) : (!corpus.includes(`data-tour="${id}"`) && !corpus.includes(`tour="${id}"`))) {
    console.error(`✗ data-tour anchor not found in UI: ${id}`); failures++
  }
}

// The tour script: every spotlight target / cursor action / live source must be a
// real anchor, and every "Show the code" key must exist in the map.
const steps = read("src/components/tour/steps.tsx")
const mapKeys = new Set([...src.matchAll(idRe)].map((m) => m[1]))
const TEMPLATED = [/^xray-(calls|rls|sql|pipeline|code|arch)$/, /^xray-tab-/, /^rls-run-/, /^nav-/, /^role-(viewer|manager)$/, /^aging-(ar|ap)$/]
const TEMPLATE_SRC = ["data-tour={`xray-${tab}`}", "data-tour={`xray-tab-${t.id}`}", "data-tour={`rls-run-${label.toLowerCase()}`}", "data-tour={`nav-${item.to.slice(1)}`}", "data-tour={`role-${r.label.toLowerCase()}`}", "data-tour={`aging-${k}`}"]
for (const t of TEMPLATE_SRC) if (!corpus.includes(t)) { console.error(`✗ templated anchor missing: ${t}`); failures++ }
const allUi = corpus
for (const m of steps.matchAll(/\b(target|to|spot|live):\s*"([\w-]+)"/g)) {
  const id = m[2]
  if (TEMPLATED.some((re) => re.test(id))) continue
  const conditional = allUi.includes(`? "${id}" : undefined`) // data-tour={cond ? "id" : undefined}
  if (!conditional && !allUi.includes(`data-tour="${id}"`) && !allUi.includes(`tour="${id}"`)) { console.error(`✗ tour ${m[1]} anchor not in UI: ${id}`); failures++ }
}
for (const m of steps.matchAll(/\bcode:\s*"([\w-]+)"/g)) {
  if (!mapKeys.has(m[1])) { console.error(`✗ tour code key not in codeMap: ${m[1]}`); failures++ }
}

if (failures) { console.error(`\n${failures} code-map problem(s).`); process.exit(1) }
console.log("✓ code map: every element points at real, registered code")
