/**
 * The torn paper edge of the brand, drawn once as an SVG data URI and exposed as
 * a CSS custom property on <html>:
 *
 *   --fibre-v  a vertical torn lime lip along the X-ray drawer's left edge
 *
 * Deterministic (seeded Park–Miller RNG), so the edge is identical on every
 * render and every machine — it's part of the brand, not noise.
 */

function rng(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

const fmt = (p: [number, number]) => p.map((v) => v.toFixed(1)).join(",")

function verticalEdge() {
  const r = rng(7)
  const H = 200
  const pts: [number, number][] = []
  let y = 0
  while (y < H) {
    pts.push([6 + r() * 7, y])
    y += 3 + r() * 7
  }
  pts.push([pts[0][0], H])
  const edge = pts.map(fmt).join(" L")
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 ${H}' preserveAspectRatio='none'>`
    + `<path d='M16 0 L${edge} L16 ${H} Z' fill='#A3E635'/>`
    + `<path d='M${edge}' fill='none' stroke='#E6F8B8' stroke-width='1.6' vector-effect='non-scaling-stroke'/></svg>`
}

const url = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`

/** Install the edge variable on <html>. Call once at startup. */
export function installTornEdges() {
  document.documentElement.style.setProperty("--fibre-v", url(verticalEdge()))
}
