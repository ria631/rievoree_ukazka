import { useEffect, useState } from "react"
import { Code2, Maximize2 } from "lucide-react"
import { highlightCode, type XrayLang } from "@/lib/code-xray"

/**
 * A small VS Code (Dark+) window for a snippet inside the X-ray panel — same
 * engine, gutter and status bar as the full-screen view, so code looks like
 * code everywhere in the X-ray (not a grey <pre>).
 */
export function CodeBlock({ code, lang, file, onExpand }: { code: string; lang: XrayLang; file: string; onExpand?: () => void }) {
  const [html, setHtml] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    highlightCode(code, lang).then((h) => { if (alive) setHtml(h) }).catch(() => {})
    return () => { alive = false }
  }, [code, lang])

  return (
    <div className="overflow-hidden rounded-lg bg-[#1e1e1e] font-mono text-[#d4d4d4] ring-1 ring-white/10">
      <div className="flex items-center bg-[#252526] text-[11px]">
        <span className="flex min-w-0 items-center gap-1.5 border-r border-black/30 bg-[#1e1e1e] px-3 py-1.5 text-white/85">
          <Code2 className="size-3 shrink-0 text-accent" /> <span className="truncate">{file}</span>
        </span>
        {onExpand && (
          <button onClick={onExpand} className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 text-[10px] uppercase tracking-widest text-accent transition hover:text-white">
            <Maximize2 className="size-3" /> open file
          </button>
        )}
      </div>
      <div className="code-shiki code-shiki-sm max-h-72 overflow-auto">
        {html != null
          // Safe: Shiki's escaped output of our own source text.
          ? <div dangerouslySetInnerHTML={{ __html: html }} />
          : <pre className="px-4 py-3 text-[11.5px] leading-[1.6] text-white/70">{code}</pre>}
      </div>
    </div>
  )
}
