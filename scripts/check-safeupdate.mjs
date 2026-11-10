#!/usr/bin/env node
// pg_safeupdate guard. Every request from the app runs through PostgREST, whose
// sessions load pg_safeupdate: an UPDATE or DELETE with no WHERE clause is
// refused — even on a temp table inside a SECURITY DEFINER function (that is how
// registering with demo data broke). Fails CI on any such statement in a
// migration. `INSERT … ON CONFLICT DO UPDATE` is an insert and is fine; a
// deliberate whole-table update says so with `where true`.
import { readdirSync, readFileSync } from "node:fs"

const DIR = "supabase/migrations"
// Superseded bodies that already ran on production (fixed by a later migration).
const ALLOW = [
  ["20261015000001_real_estate_reporting.sql", "update pg_temp.rv2_ls s set renewed"],
  ["20261015000001_real_estate_reporting.sql", "update pg_temp.rv2_ap a set paid"],
]

/** Blank out comments and string literals, keeping offsets and newlines. */
function strip(sql) {
  let out = "", i = 0
  const blank = (s) => s.replace(/[^\n]/g, " ")
  while (i < sql.length) {
    if (sql.startsWith("--", i)) {
      let j = sql.indexOf("\n", i); if (j < 0) j = sql.length
      out += blank(sql.slice(i, j)); i = j
    } else if (sql.startsWith("/*", i)) {
      const j = sql.indexOf("*/", i) + 2
      out += blank(sql.slice(i, j)); i = j
    } else if (sql[i] === "'") {
      let j = i + 1
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue }
        if (sql[j] === "'") break
        j++
      }
      out += "'" + blank(sql.slice(i + 1, j)) + "'"; i = j + 1
    } else { out += sql[i]; i++ }
  }
  return out
}

let failures = 0
for (const f of readdirSync(DIR).filter((n) => n.endsWith(".sql")).sort()) {
  const raw = readFileSync(`${DIR}/${f}`, "utf8")
  const low = strip(raw).toLowerCase()
  const re = /(?<![a-z_."])(update\s+(?!of\b|set\b)[a-z_."]+|delete\s+from\s+[a-z_."]+)/g
  for (const m of low.matchAll(re)) {
    const prev = low.slice(0, m.index).trimEnd()
    // Only statements: after ; or a block keyword (not "on update", "for update", "do update").
    if (!(/[;(]$/.test(prev) || /(begin|then|else|loop|\$\$|as)$/.test(prev))) continue
    let depth = 0, found = false
    for (let j = m.index; j < low.length; j++) {
      const c = low[j]
      if (c === "(") depth++
      else if (c === ")") { if (--depth < 0) break }
      else if (c === ";" && depth === 0) break
      else if (depth === 0 && low.startsWith("where", j) && !/[a-z0-9_]/.test(low[j - 1] ?? " ") && !/[a-z0-9_]/.test(low[j + 5] ?? " ")) { found = true; break }
    }
    if (found) continue
    const text = raw.slice(m.index, m.index + 120).replace(/\s+/g, " ")
    if (ALLOW.some(([file, needle]) => file === f && text.toLowerCase().startsWith(needle))) continue
    const line = raw.slice(0, m.index).split("\n").length
    console.error(`✗ ${DIR}/${f}:${line}: UPDATE/DELETE without WHERE — pg_safeupdate refuses it via the API: ${text.slice(0, 80)}…`)
    failures++
  }
}
if (failures) { console.error(`\n${failures} statement(s) would fail under pg_safeupdate (add a WHERE, e.g. \`where true\`).`); process.exit(1) }
console.log("✓ safeupdate: every UPDATE / DELETE in the migrations has a WHERE")
