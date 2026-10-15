/**
 * Shared X-ray code helpers.
 *
 * Honesty invariant: every snippet shown in the X-ray is the LITERAL repo file
 * pulled in via Vite `?raw` at build time — never hand-written. These helpers
 * only *present* it: pull the marked regions, drop comments, and de-indent so
 * what the visitor sees reads like clean, focused production code instead of a
 * raw dump with long comment headers.
 *
 * Region markers: wrap the interesting parts of a real file with
 *   #region xray   …code…   #endregion
 * (in line / block / JSX comments). extractRegions() returns just those parts,
 * comment-free. If a file has no markers, the whole file is cleaned.
 */

/** Drop comments: full-line line-comments, block comments, and JSX comments. */
function stripComments(src: string): string {
  const out: string[] = []
  let inBlock = false
  for (let line of src.split("\n")) {
    if (inBlock) {
      const end = line.indexOf("*/")
      if (end === -1) continue
      line = line.slice(end + 2)
      inBlock = false
    }
    line = line.replace(/\{\/\*[\s\S]*?\*\/\}/g, "") // single-line JSX comment
    line = line.replace(/\/\*.*?\*\//g, "")          // single-line block comment
    const open = line.indexOf("/*")
    if (open !== -1 && line.indexOf("*/", open) === -1) {
      line = line.slice(0, open)
      inBlock = true
    }
    const trimmed = line.trim()
    if (trimmed.startsWith("//") || trimmed.startsWith("--") || trimmed === "{/*" || trimmed === "*/}") continue
    out.push(line.replace(/\s+$/, ""))
  }
  // collapse runs of blank lines
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}

/** Remove the common leading indentation from every line. */
function dedent(src: string): string {
  const lines = src.split("\n")
  let min = Infinity
  for (const l of lines) {
    if (!l.trim()) continue
    const lead = l.length - l.trimStart().length
    if (lead < min) min = lead
  }
  if (!isFinite(min) || min === 0) return src
  return lines.map((l) => l.slice(min)).join("\n")
}

/** Pull the `#region xray` blocks (or the whole file), comment-free + dedented. */
export function extractRegions(raw: string): string {
  const lines = raw.split("\n")
  const picked: string[] = []
  let depth = 0
  for (const line of lines) {
    if (/#region/.test(line)) { if (depth === 0 && picked.length) picked.push(""); depth++; continue }
    if (/#endregion/.test(line)) { depth = Math.max(0, depth - 1); continue }
    if (depth > 0) picked.push(line)
  }
  const body = picked.length ? picked.join("\n") : raw
  return dedent(stripComments(body))
}

/**
 * Pull a single real SQL statement from a migration: from the line containing
 * `startNeedle` through the first line that ends the statement (`;`). Lets us
 * show the genuine view / policy from a `?raw` migration without editing it.
 */
export function sliceStatement(raw: string, startNeedle: string): string {
  const lines = raw.split("\n")
  const start = lines.findIndex((l) => l.includes(startNeedle))
  if (start === -1) return ""
  let end = start
  while (end < lines.length && !lines[end].includes(";")) end++
  return dedent(stripComments(lines.slice(start, end + 1).join("\n")))
}

/** Grab `count` real lines starting at the line containing `needle` (comment-free,
 *  dedented). For pulling a representative fragment of a worker/edge file. */
export function sliceFrom(raw: string, needle: string, count: number): string {
  const lines = raw.split("\n")
  const start = lines.findIndex((l) => l.includes(needle))
  if (start === -1) return ""
  return dedent(stripComments(lines.slice(start, start + count).join("\n")))
}

// ---------------------------------------------------------------------------
// Shiki — fine-grained core, lazy singleton. Bundles ONLY the Dark+ theme + the
// grammars we use + the oniguruma engine (no 200-language chunk explosion).
// ---------------------------------------------------------------------------
export type XrayLang = "tsx" | "typescript" | "css" | "sql"

let hlPromise: Promise<{ codeToHtml: (c: string, o: { lang: string; theme: string }) => string }> | null = null
function getHighlighter() {
  if (!hlPromise) {
    hlPromise = Promise.all([
      import("shiki/core"),
      import("shiki/engine/oniguruma"),
    ]).then(([core, oniguruma]) =>
      core.createHighlighterCore({
        themes: [import("shiki/themes/dark-plus.mjs")],
        langs: [
          import("shiki/langs/tsx.mjs"),
          import("shiki/langs/typescript.mjs"),
          import("shiki/langs/css.mjs"),
          import("shiki/langs/sql.mjs"),
        ],
        engine: oniguruma.createOnigurumaEngine(import("shiki/wasm")),
      }),
    )
  }
  return hlPromise
}

// ── Off-main-thread highlighting ──────────────────────────────────────────
// All highlighting runs in a Web Worker (highlight.worker.ts), so opening the
// code view never freezes the page. If a worker can't be created, it falls back
// to the same highlighter on the main thread.
let worker: Worker | null | undefined
let seq = 0
const pending = new Map<number, { resolve: (h: string) => void; reject: (e: Error) => void }>()
function getWorker(): Worker | null {
  if (worker !== undefined) return worker
  try {
    worker = new Worker(new URL("./highlight.worker.ts", import.meta.url), { type: "module" })
    worker.onmessage = (e: MessageEvent<{ id: number; html?: string; error?: string }>) => {
      const p = pending.get(e.data.id)
      if (!p) return
      pending.delete(e.data.id)
      if (e.data.html != null) p.resolve(e.data.html)
      else p.reject(new Error(e.data.error ?? "highlight failed"))
    }
    worker.onerror = () => { worker = null } // fall back to the main thread from now on
  } catch {
    worker = null
  }
  return worker
}

/** Warm the worker (WASM + grammars compile) in the background, so the first
 *  "show me the code" is instant. */
export function prewarmHighlighter() {
  for (const lang of ["tsx", "typescript", "sql"] as const) void highlightCode("const a = 1", lang).catch(() => {})
}

/** Highlight code to VS Code Dark+ HTML. Returns Shiki's escaped <pre> markup. */
export async function highlightCode(code: string, lang: XrayLang): Promise<string> {
  const w = getWorker()
  if (w) {
    const id = ++seq
    return new Promise<string>((resolve, reject) => {
      pending.set(id, { resolve, reject })
      w.postMessage({ id, code, lang })
    })
  }
  const hl = await getHighlighter()
  return hl.codeToHtml(code, { lang, theme: "dark-plus" })
}
