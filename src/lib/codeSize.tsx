import { useEffect, useState } from "react"

/**
 * Font size of the full-screen code views, adjustable (A− / A+) and remembered
 * per browser. Default is compact — on a laptop with 125% display scaling the
 * old 12.5px read as "too zoomed in". Applied as the --code-size CSS variable.
 */
const KEY = "xray-code-size"
const MIN = 10, MAX = 17, DEFAULT = 11.5

export function useCodeSize() {
  const [size, setSize] = useState(() => {
    try {
      const v = Number(localStorage.getItem(KEY))
      return v >= MIN && v <= MAX ? v : DEFAULT
    } catch { return DEFAULT }
  })
  useEffect(() => { try { localStorage.setItem(KEY, String(size)) } catch { /* private mode */ } }, [size])
  const step = (d: number) => setSize((s) => Math.min(MAX, Math.max(MIN, Math.round((s + d) * 2) / 2)))
  return { size, step }
}

export function CodeSizeControl({ size, step }: { size: number; step: (d: number) => void }) {
  const btn = "grid h-6 min-w-6 place-items-center rounded px-1 text-[11px] text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
  return (
    <div className="flex items-center gap-0.5 font-mono" title="Code font size">
      <button className={btn} onClick={() => step(-0.5)} disabled={size <= MIN} aria-label="Smaller code">A−</button>
      <span className="w-9 text-center text-[10px] tabular-nums text-white/40">{size}px</span>
      <button className={btn} onClick={() => step(0.5)} disabled={size >= MAX} aria-label="Larger code">A+</button>
    </div>
  )
}
