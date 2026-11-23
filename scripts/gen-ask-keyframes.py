#!/usr/bin/env python3
"""The MCP chat animation's timeline (src/pages/landing/ask.css).

Times are in seconds of one 16 s loop; this turns them into keyframe
percentages and rewrites everything in ask.css from the TIMELINE marker on.
Run after changing a time:  python3 scripts/gen-ask-keyframes.py
"""
from pathlib import Path

CSS = Path(__file__).resolve().parent.parent / "src/pages/landing/ask.css"
MARKER = "/* ───── the timeline"

T = 16.0
FADE0, FADE1 = 15.2, 15.84  # everything fades out together at the end of the loop
E = 0.25                     # fade-in / fade-out length


def pc(t: float) -> str:
    return f"{t / T * 100:.2f}".rstrip("0").rstrip(".") + "%"


rules: list[str] = []
kfs: list[str] = []


def kf(name: str, body: str) -> None:
    kfs.append(f"@keyframes {name}{{{body}}}")


def sel(selector: str, name: str, extra: str = "") -> None:
    rules.append(f"  .lp .mcp {selector}{{animation-name:{name}{extra}}}")


def appear(name: str, t: float) -> None:
    """In at t with a small rise, stays, fades with the loop."""
    kf(name, f"0%,{pc(t)}{{opacity:0;transform:translateY(6px)}}{pc(t + E)},{pc(FADE0)}{{opacity:1;transform:none}}{pc(FADE1)},100%{{opacity:0}}")


def window(name: str, on: float, off: float | None) -> None:
    """Visible between on and off; off=None means until the loop fades."""
    end = FADE0 if off is None else off
    out = FADE1 if off is None else off + E
    kf(name, f"0%,{pc(on)}{{opacity:0}}{pc(on + E)},{pc(end)}{{opacity:1}}{pc(out)},100%{{opacity:0}}")


def travel(name: str, t: float, axis: str, dist: int, back: bool = False, dur: float = 0.4) -> None:
    a, b = (dist, 0) if back else (0, dist)
    tr = lambda v: f"transform:translate{axis}({v}px)"  # noqa: E731
    kf(name, f"0%,{pc(t)}{{opacity:0;{tr(a)}}}{pc(t + 0.04)}{{opacity:1}}{pc(t + dur)}{{opacity:1;{tr(b)}}}{pc(t + dur + 0.04)},100%{{opacity:0;{tr(b)}}}")


# ── the input box: placeholder, typed text, send button ──
kf("mc-ph", f"0%,{pc(0.3)}{{opacity:1}}{pc(0.4)},{pc(3.0)}{{opacity:0}}{pc(3.15)},{pc(8.3)}{{opacity:1}}{pc(8.4)},{pc(10.2)}{{opacity:0}}{pc(10.35)},100%{{opacity:1}}")
sel(".ph", "mc-ph")
kf("mc-ty1", f"0%,{pc(0.35)}{{opacity:0}}{pc(0.4)},{pc(3.0)}{{opacity:1}}{pc(3.1)},100%{{opacity:0}}")
kf("mc-ty2", f"0%,{pc(8.35)}{{opacity:0}}{pc(8.4)},{pc(10.2)}{{opacity:1}}{pc(10.3)},100%{{opacity:0}}")
sel(".ty1", "mc-ty1")
sel(".ty2", "mc-ty2")
# typing: the cover slides off the text in steps (its left edge is the caret)
kf("mc-cv1", f"0%,{pc(0.4)}{{transform:translateX(0);animation-timing-function:steps(44,end)}}{pc(2.8)},100%{{transform:translateX(100%)}}")
kf("mc-cv2", f"0%,{pc(8.4)}{{transform:translateX(0);animation-timing-function:steps(26,end)}}{pc(10.0)},100%{{transform:translateX(100%)}}")
sel(".cv1", "mc-cv1")
sel(".cv2", "mc-cv2")
kf("mc-send", f"0%,{pc(2.95)}{{transform:none}}{pc(3.05)}{{transform:scale(.8)}}{pc(3.3)},{pc(10.15)}{{transform:none}}{pc(10.25)}{{transform:scale(.8)}}{pc(10.5)},100%{{transform:none}}")
sel(".send", "mc-send")

# ── the conversation ──
appear("mc-u1", 3.0)
sel(".u1", "mc-u1")
window("mc-th", 3.3, 3.75)
sel(".th", "mc-th")
CALLS = {"c1": (3.8, 4.4), "c2": (4.4, 5.1), "c3": (5.0, 5.6), "c4": (10.6, 11.1), "c5": (11.2, 11.7)}
for c, (t_in, t_ok) in CALLS.items():
    appear(f"mc-{c}", t_in)
    sel(f".{c}", f"mc-{c}")
    window(f"mc-{c}s", t_in, t_ok - E)
    sel(f".{c} .sp", f"mc-spin,mc-{c}s")
    window(f"mc-{c}k", t_ok, None)
    sel(f".{c} .ok", f"mc-{c}k")
appear("mc-a1", 5.8)
sel(".a1", "mc-a1")
appear("mc-x0", 6.2)
sel(".x0", "mc-x0")
for i, t in enumerate([6.6, 6.9, 7.2, 7.5], 1):
    appear(f"mc-xr{i}", t)
    sel(f".xr{i}", f"mc-xr{i}")
kf("mc-xb", f"0%,{pc(7.9)}{{transform:none}}{pc(8.1)}{{transform:scale(1.08)}}{pc(8.4)},100%{{transform:none}}")
sel(".xb", "mc-xb")
# the chart beside it: the card, then its bars grow one by one
appear("mc-g0", 7.5)
sel(".g0", "mc-g0")
for i in range(1, 7):
    t = 7.75 + (i - 1) * 0.12
    kf(f"mc-g{i}", f"0%,{pc(t)}{{transform:scaleY(0)}}{pc(t + 0.35)},{pc(FADE0)}{{transform:none}}{pc(FADE1)},100%{{transform:scaleY(0)}}")
    sel(f".cbars .g{i}", f"mc-g{i}")
appear("mc-u2", 10.2)
sel(".u2", "mc-u2")
appear("mc-ap", 11.8)
sel(".ap", "mc-ap")
window("mc-apw", 11.8, 12.9)
sel(".ap .w", "mc-apw")
window("mc-apk", 13.0, None)
sel(".ap .k", "mc-apk")

# ── behind it: tools and tables light up (::after layers) ──
for c, (on, off) in {"k1": (3.8, 4.5), "k2": (4.4, 5.8), "k3": (10.6, 11.2), "k4": (11.2, 11.9)}.items():
    window(f"mc-{c}", on, off)
    sel(f".tools .{c}::after", f"mc-{c}")
for c, (on, off) in {"d1": (4.7, 5.4), "d2": (5.2, 5.8), "d3": (10.9, 13.3)}.items():
    window(f"mc-{c}", on, off)
    sel(f".tbls .{c}::after", f"mc-{c}")
window("mc-pend", 10.9, 12.9)
sel(".tbls .pend", "mc-pend")
window("mc-done", 13.0, None)
sel(".tbls .done", "mc-done")

# ── packets: chat ⇄ server (24 px), server ⇄ database (18 px) ──
for n, (t, back) in {"p1": (3.8, False), "p2": (4.4, False), "p3": (5.0, False), "p4": (5.6, True), "p5": (10.6, False), "p6": (11.7, True)}.items():
    travel(f"mc-{n}", t, "X", 24, back)
    sel(f".{n}", f"mc-{n}", ";animation-timing-function:linear")
for n, (t, back) in {"v1": (4.6, False), "v2": (5.1, False), "v3": (5.6, True), "v4": (10.9, False)}.items():
    travel(f"mc-{n}", t, "Y", 18, back, 0.35)
    sel(f".{n}", f"mc-{n}", ";animation-timing-function:linear")

HEAD = """/* ───── the timeline (GENERATED by scripts/gen-ask-keyframes.py — edit the times there) ───── */
@media (prefers-reduced-motion:no-preference){
  .lp .mcp .a,.lp .mcp .a::after{animation-duration:16s;animation-timing-function:ease;animation-iteration-count:infinite}
  .lp .mcp:not(.on) .a,.lp .mcp:not(.on) .a::after,.lp .mcp:not(.on) .think i{animation-play-state:paused}
  .lp .mcp .think{display:flex}
  .lp .mcp .think i{animation:mc-dot .9s ease-in-out infinite}
  .lp .mcp .think i:nth-child(2){animation-delay:.15s}
  .lp .mcp .think i:nth-child(3){animation-delay:.3s}
  .lp .mcp .call .sp{display:block;animation-duration:.8s,16s;animation-timing-function:linear,ease}
"""
FOOT = """
@keyframes mc-spin{to{transform:rotate(360deg)}}
@keyframes mc-dot{0%,60%,100%{transform:none}30%{transform:translateY(-4px)}}
"""

src = CSS.read_text()
keep = src[: src.index(MARKER)]
CSS.write_text(keep + HEAD + "\n".join(rules) + "\n}\n\n" + "\n".join(kfs) + "\n" + FOOT)
print(f"wrote {len(kfs)} keyframes to {CSS.name}")
