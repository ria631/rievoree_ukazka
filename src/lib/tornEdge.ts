/**
 * The torn paper edges of the brand, drawn once as SVG data URIs and exposed as
 * CSS custom properties on <html>:
 *
 *   --torn     mask for the bottom edge of a page header (the lime sheet)
 *   --fibre    the pale paper fibre + shadow along that edge
 *   --fibre-v  a vertical torn lip (the X-ray drawer slides out from under the page)
 *
 * Deterministic (seeded Park–Miller RNG), so the edge is identical on every
 * render and every machine — it's part of the brand, not noise.
 */

function rng(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

const fmt = (p: [number, number]) => p.map((v) => v.toFixed(1)).join(",")

function horizontalEdge() {
  const r = rng(42)
  const W = 400
  const pts: [number, number][] = []
  let x = 0
  while (x < W) {
    pts.push([x, 6 + r() * 9 + (r() < 0.18 ? r() * 6 : 0)])
    x += 3 + r() * 7
  }
  pts.push([W, pts[0][1]])
  const edge = pts.map(fmt).join(" L")
  const shadow = pts.map(([px, py]) => fmt([px, py + 2.6])).join(" L")
  const mask = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} 22' preserveAspectRatio='none'><path d='M0 0 L${edge} L${W} 0 Z' fill='black'/></svg>`
  const fibre = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} 22' preserveAspectRatio='none'>`
    + `<path d='M${edge}' fill='none' stroke='#E6F8B8' stroke-width='2.2' stroke-linejoin='round' vector-effect='non-scaling-stroke'/>`
    + `<path d='M${shadow}' fill='none' stroke='#000' stroke-opacity='.45' stroke-width='3' vector-effect='non-scaling-stroke'/></svg>`
  return { mask, fibre }
}

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

/** Install the edge variables on <html>. Call once at startup. */
export function installTornEdges() {
  const { mask, fibre } = horizontalEdge()
  const s = document.documentElement.style
  s.setProperty("--torn", url(mask))
  s.setProperty("--fibre", url(fibre))
  s.setProperty("--fibre-v", url(verticalEdge()))
}
