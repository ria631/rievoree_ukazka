/**
 * The source the landing shows — pulled from the real repo files at build time
 * (Vite `?raw`), never retyped. If a file changes, the landing changes with it;
 * if a marker disappears, the excerpt falls back to the file's opening lines
 * rather than inventing anything.
 */
import identitySql from "../../../supabase/migrations/20260605000001_identity_and_tenancy.sql?raw"
import reportSql from "../../../supabase/migrations/20260610000002_report_account_monthly.sql?raw"
import ingestFn from "../../../supabase/functions/ingest-submit/index.ts?raw"
import workerDb from "../../../worker/src/db.ts?raw"
import instrumentedFetch from "../../lib/xray/instrumentedFetch.ts?raw"

/** Lines from the one containing `from` through the first one (from there on)
 *  containing `to` — or matching it, when `to` is a RegExp. */
function excerpt(raw: string, from: string, to: string | RegExp, { before = 0 } = {}): string {
  const lines = raw.split("\n")
  const a = lines.findIndex((l) => l.includes(from))
  if (a < 0) return lines.slice(0, 12).join("\n")
  const hit = (l: string) => (typeof to === "string" ? l.includes(to) : to.test(l))
  const rel = lines.slice(a).findIndex(hit)
  const b = rel < 0 ? Math.min(lines.length, a + 12) : a + rel + 1
  return dedent(lines.slice(Math.max(0, a - before), b).join("\n"))
}

function dedent(src: string): string {
  const lines = src.split("\n")
  const min = Math.min(...lines.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length))
  return Number.isFinite(min) && min > 0 ? lines.map((l) => l.slice(min)).join("\n") : src
}

export const SRC = {
  /** The tenant policy, with the three comment lines above it. */
  rls: excerpt(identitySql, "create policy entities_select", ");", { before: 3 }),
  /** The report view every reporting page reads. */
  report: excerpt(reportSql, "create view public.report_account_monthly", "grant select on public.report_account_monthly"),
  /** The worker's atomic queue claim. */
  worker: excerpt(workerDb, "// Atomic claim", "return rows[0] ?? null;") + "\n}",
  /** The fetch seam the X-ray panel reads from. */
  fetch: excerpt(instrumentedFetch, "export function createInstrumentedFetch", /^}$/),
  /** The edge function's tenant check before it issues an upload URL. */
  edge: excerpt(ingestFn, "const { data: entity, error: entityErr } = await userClient", "not authorized to upload for this entity") + "\n}",
}

export const FILES = {
  rls: "supabase/migrations/20260605000001_identity_and_tenancy.sql",
  fetch: "src/lib/xray/instrumentedFetch.ts",
  edge: "supabase/functions/ingest-submit/index.ts",
  worker: "worker/src/db.ts",
}

/** A short window into a snippet: the lines that carry the idea. */
export function lines(src: string, from: string, count: number): string {
  const all = src.split("\n")
  const a = Math.max(0, all.findIndex((l) => l.includes(from)))
  return dedent(all.slice(a, a + count).join("\n"))
}

// ── Highlighting: a deliberately tiny tokenizer (comments, strings, keywords) —
// enough for SQL and TS on the landing without shipping a grammar.
const KW = ["create", "policy", "view", "on", "for", "select", "to", "using", "or", "in", "update", "set", "where", "and",
  "skip", "locked", "limit", "returning", "order", "by", "alter", "table", "enable", "row", "level", "security", "revoke",
  "grant", "from", "insert", "delete", "all", "export", "function", "async", "await", "return", "const", "try", "catch",
  "throw", "typeof", "instanceof", "new", "if", "import", "as"]
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const KW_RE = new RegExp(`\\b(${KW.join("|")})\\b(?![^<]*>)`, "g")

/** Escape + colour a snippet (HTML string; input is repo source, never user data). */
export function hl(src: string): string {
  return esc(src)
    .replace(/(\/\/[^\n]*|--[^\n]*)/g, '<span class="c">$1</span>')
    .replace(/('[^'\n]*'|"[^"\n]*")/g, '<span class="s">$1</span>')
    .replace(KW_RE, '<span class="k">$1</span>')
}

export const KEYWORDS = new Set(KW)
