/// <reference lib="webworker" />
/**
 * Shiki, off the main thread. Tokenising a few hundred lines of TSX (and the
 * one-time WASM + grammar compile) used to block the page for ~0.3–0.5 s when
 * the code view opened; here it never touches the UI thread.
 */
import type { HighlighterCore } from "shiki/core"

let hl: Promise<HighlighterCore> | null = null
function get() {
  if (!hl) {
    hl = Promise.all([import("shiki/core"), import("shiki/engine/oniguruma")]).then(([core, oniguruma]) =>
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
  return hl
}

self.onmessage = async (e: MessageEvent<{ id: number; code: string; lang: string }>) => {
  const { id, code, lang } = e.data
  try {
    const h = await get()
    self.postMessage({ id, html: h.codeToHtml(code, { lang, theme: "dark-plus" }) })
  } catch (err) {
    self.postMessage({ id, error: String(err) })
  }
}
