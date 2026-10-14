/**
 * Full-bleed colourful orbs (system B) behind the whole app. STATIC soft radial
 * gradients: painted once, never re-rasterised. (They used to be blur(64px)
 * layers drifting forever — a continuous full-page repaint that made the app
 * stutter on laptops while nothing was even happening. The glow reads the same
 * standing still.) A faint wash keeps text contrast over them.
 *
 * `subtle` dials the orbs back for in-app pages, where they're atmosphere
 * behind real content — not a showpiece.
 */
const ORBS = [
  { cls: "-left-24 top-[0%] size-[34rem]", color: "var(--accent)", mix: 32 },
  { cls: "-right-24 top-[12%] size-[38rem]", color: "var(--signal)", mix: 26 },
  { cls: "left-[30%] top-[40%] size-[34rem]", color: "var(--cold)", mix: 30 },
  { cls: "-right-28 top-[58%] size-[38rem]", color: "var(--accent)", mix: 22 },
  { cls: "left-[2%] top-[78%] size-[34rem]", color: "var(--cold)", mix: 26 },
]

export function OrbsBackground({ subtle = false }: { subtle?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background">
      <div className={`absolute inset-0 ${subtle ? "opacity-45" : ""}`}>
        {ORBS.map((o, i) => (
          <div key={i} className={`absolute rounded-full ${o.cls}`}
            style={{ background: `radial-gradient(closest-side, color-mix(in oklch, ${o.color} ${o.mix}%, transparent), transparent)` }} />
        ))}
      </div>
      {/* readability wash */}
      <div className={`absolute inset-0 ${subtle ? "bg-background/60" : "bg-background/35"}`} />
    </div>
  )
}
