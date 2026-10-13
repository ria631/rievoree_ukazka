import { useEffect, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { AnimatePresence, motion } from "motion/react"
import { ScanLine, X } from "lucide-react"
import { useXrayPanel, type XrayTab } from "@/components/xray/XrayPanelContext"

/**
 * Guided 3-minute tour. The review's core finding was that visitors see a nice
 * dashboard but never discover the machinery (X-ray, RLS, the pipeline). This
 * walks them through it: each step navigates to the right page and, where it
 * helps, opens the X-ray panel to the right tab. It never performs writes, so
 * it's safe in the read-only demo.
 *
 * Starts from the floating button (or auto-offers once per browser). State is
 * local; the only persistence is a "seen" flag in localStorage.
 */
const SEEN_KEY = "xray-tour-seen"

interface Step {
  title: string
  body: string
  /** Where to be for this step. */
  go?: string
  /** Open the X-ray panel to this tab. */
  xray?: XrayTab
  /** A call-to-action link (e.g. register) instead of plain Next. */
  cta?: { label: string; to: string }
}

const STEPS: Step[] = [
  {
    title: "A 3-minute tour",
    body: "This is a portfolio project built backend-first. In three minutes you'll see the row-level security, the ETL pipeline and the live X-ray that makes it all visible.",
    go: "/dashboard",
  },
  {
    title: "1 · Every number is real",
    body: "The X-ray panel (opened on the right) logs every call this page made to Postgres — method, status, timing. No mocked data: what you see was queried live.",
    go: "/dashboard",
    xray: "calls",
  },
  {
    title: "2 · Row-level security, live",
    body: "Click Run as Viewer, then Manager, then Admin. The identical query returns 1 / 2 / 4 entities — the database decides by identity, not the frontend. (It runs in an isolated session, so your view doesn't change.)",
    go: "/dashboard",
    xray: "rls",
  },
  {
    title: "3 · The reports it produces",
    body: "RLS-filtered figures roll up here. The balance sheet ties (A = L + E) and the variance bridge sums to the total — real double-entry, not decoration.",
    go: "/reports",
  },
  {
    title: "4 · The ETL pipeline",
    body: "Uploading a CSV runs validation → a z-score anomaly screen → manual approval → an idempotent load that refreshes the reports (trigger chain + pg_cron). The demo is read-only, so create a free account to run it yourself in a private sandbox.",
    cta: { label: "Create an account", to: "/register" },
  },
  {
    title: "That's the machinery",
    body: "Every layer ran in the open. Thanks for taking the tour — the source is on GitHub.",
  },
]

export function Tour({ autoOffer }: { autoOffer?: boolean }) {
  const navigate = useNavigate()
  const { openTo, setOpen } = useXrayPanel()
  const [running, setRunning] = useState(false)
  const [i, setI] = useState(0)
  const [dismissedOffer, setDismissedOffer] = useState(false)

  // Auto-offer once per browser (never auto-starts — just surfaces the button).
  const [seen, setSeen] = useState(true)
  useEffect(() => {
    try { setSeen(localStorage.getItem(SEEN_KEY) === "1") } catch { /* private mode */ }
  }, [])

  function markSeen() {
    try { localStorage.setItem(SEEN_KEY, "1") } catch { /* ignore */ }
    setSeen(true)
  }

  function start() {
    setDismissedOffer(true)
    setI(0)
    setRunning(true)
    applyStep(STEPS[0])
  }
  function applyStep(step: Step) {
    if (step.go) navigate({ to: step.go })
    if (step.xray) openTo(step.xray)
    else setOpen(false)
  }
  function next() {
    if (i >= STEPS.length - 1) { end(); return }
    const n = i + 1
    setI(n)
    applyStep(STEPS[n])
  }
  function back() {
    if (i === 0) return
    const n = i - 1
    setI(n)
    applyStep(STEPS[n])
  }
  function end() {
    setRunning(false)
    setOpen(false)
    markSeen()
  }

  const step = STEPS[i]
  const offer = autoOffer && !seen && !running && !dismissedOffer

  return (
    <>
      {/* Persistent launcher — bottom-left so it never covers the X-ray button. */}
      {!running && (
        <button
          onClick={start}
          className="fixed bottom-5 left-5 z-50 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-accent-foreground shadow-soft transition hover:brightness-110"
        >
          <ScanLine className="size-3.5" strokeWidth={2.25} /> Take the tour
        </button>
      )}

      {/* First-visit nudge above the launcher. */}
      <AnimatePresence>
        {offer && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-20 left-5 z-50 w-64 rounded-2xl border border-border bg-card p-4 text-sm shadow-soft ring-1 ring-border">
            <p className="text-foreground">New here? A 3-minute guided tour shows what this project is really about.</p>
            <div className="mt-3 flex items-center gap-2">
              <button onClick={start} className="rounded-full bg-accent px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-accent-foreground">Start</button>
              <button onClick={() => { setDismissedOffer(true); markSeen() }} className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">No thanks</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The step card. */}
      <AnimatePresence>
        {running && (
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-5 left-5 z-50 w-[min(92vw,22rem)] rounded-2xl border border-border bg-card p-5 shadow-soft ring-1 ring-border">
            <div className="flex items-start justify-between gap-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
                Tour · {i + 1} / {STEPS.length}
              </span>
              <button onClick={end} aria-label="End tour" className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
            <h3 className="mt-2 text-lg font-semibold tracking-tight">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            <div className="mt-4 flex items-center justify-between gap-2">
              <button onClick={back} disabled={i === 0}
                className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground disabled:opacity-40 hover:text-foreground">
                ← Back
              </button>
              {step.cta ? (
                <a href={step.cta.to}
                  className="rounded-full bg-accent px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-accent-foreground transition hover:brightness-110">
                  {step.cta.label}
                </a>
              ) : null}
              <button onClick={next}
                className="rounded-full bg-foreground px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-background transition hover:scale-[1.03]">
                {i >= STEPS.length - 1 ? "Done" : "Next →"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
