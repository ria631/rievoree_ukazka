import { useEffect, useState, type ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import { AnimatePresence, motion } from "motion/react"
import { ScanLine, X, Check } from "lucide-react"
import { useXrayPanel, type XrayTab } from "@/components/xray/XrayPanelContext"
import { DataGenerator } from "@/components/DataGenerator"
import { supabase } from "@/lib/supabase"

/**
 * Guided tour — the part that SELLS the project. It's not just a walkthrough: at
 * each stop it says what you're seeing, and (the point) WHERE that skill matters
 * in a real product. It opens the X-ray to the right lens, lets you generate
 * data shaped like your own, and ends by asking for a quick reaction + an easy
 * way to get in touch. Fully client-safe: it performs no writes to tenant data.
 */
const SEEN_KEY = "xray-tour-seen"

interface Step {
  title: string
  body: string
  /** "Where this helps" sell line. */
  sell?: string
  go?: string
  xray?: XrayTab
  /** Custom content (generator, feedback form). */
  render?: () => ReactNode
}

const STEPS: Step[] = [
  {
    title: "See the machinery — in 3 minutes",
    body: "This is a portfolio project by Mariia Chernenko: a financial reporting engine built backend-first. Instead of telling you it's solid, it lets you watch every layer work.",
    sell: "What this demonstrates: production-grade full-stack — security, data pipelines, and the judgement to make them observable.",
    go: "/dashboard",
  },
  {
    title: "1 · Every number is real & timed",
    body: "The X-ray panel logs every call this page made to Postgres — method, status, milliseconds. Nothing is mocked; this is live traffic.",
    sell: "Where it helps: this is how you prove performance and debug a slow page in production without guessing.",
    go: "/dashboard",
    xray: "calls",
  },
  {
    title: "2 · The real code, in place",
    body: "The Code tab shows the actual React component that rendered this page — pulled straight from the repo, not a screenshot.",
    sell: "Where it helps: honesty. A reviewer can read exactly how it's built, which is what earns trust in an engineer.",
    go: "/dashboard",
    xray: "code",
  },
  {
    title: "3 · Row-level security, proven",
    body: "Run the same query as Viewer, Manager, Admin — different rows each time. The database decides, not the frontend. (See the SQL tab for the policy, and the privilege-escalation it was hardened against.)",
    sell: "Where it helps: multi-tenant SaaS, where one customer seeing another's data is a company-ending bug.",
    go: "/dashboard",
    xray: "rls",
  },
  {
    title: "4 · A real ETL pipeline — try it",
    body: "Messy spreadsheets become clean reports: validate → z-score anomaly screen → human approval → idempotent load → auto-refresh. Generate a month of data shaped like yours (with a planted anomaly), download it, then create an account to run it through:",
    sell: "Where it helps: onboarding a client's books, catching bad numbers before they hit a report.",
    render: () => <DataGenerator />,
  },
  {
    title: "5 · The async machinery, live",
    body: "On approval, database triggers + pg_cron + pg_net load the rows and refresh the reports. The Pipeline tab streams those events as they fire — the backend talking to itself, in the open.",
    sell: "Where it helps: scheduled jobs and event-driven refreshes you can actually see, instead of a black box.",
    go: "/dashboard",
    xray: "pipeline",
  },
  {
    title: "That's the machinery",
    body: "Thanks for looking. If this is the kind of work you want on your team — or you'd just like to say what you thought — here's the quickest way:",
    render: () => <TourClose />,
  },
]

export function Tour({ autoOffer }: { autoOffer?: boolean }) {
  const navigate = useNavigate()
  const { openTo, setOpen } = useXrayPanel()
  const [running, setRunning] = useState(false)
  const [i, setI] = useState(0)
  const [dismissedOffer, setDismissedOffer] = useState(false)
  const [seen, setSeen] = useState(true)

  useEffect(() => {
    try { setSeen(localStorage.getItem(SEEN_KEY) === "1") } catch { /* private mode */ }
  }, [])

  function markSeen() {
    try { localStorage.setItem(SEEN_KEY, "1") } catch { /* ignore */ }
    setSeen(true)
  }
  function applyStep(step: Step) {
    if (step.go) navigate({ to: step.go })
    if (step.xray) openTo(step.xray)
    else setOpen(false)
  }
  function start() { setDismissedOffer(true); setI(0); setRunning(true); applyStep(STEPS[0]) }
  function next() {
    if (i >= STEPS.length - 1) { end(); return }
    const n = i + 1; setI(n); applyStep(STEPS[n])
  }
  function back() { if (i === 0) return; const n = i - 1; setI(n); applyStep(STEPS[n]) }
  function end() { setRunning(false); setOpen(false); markSeen() }

  const step = STEPS[i]
  const offer = autoOffer && !seen && !running && !dismissedOffer
  const isLast = i >= STEPS.length - 1

  return (
    <>
      {!running && (
        <button onClick={start}
          className="fixed bottom-5 left-5 z-50 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-accent-foreground shadow-soft transition hover:brightness-110">
          <ScanLine className="size-3.5" strokeWidth={2.25} /> Take the tour
        </button>
      )}

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

      <AnimatePresence>
        {running && (
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-5 left-5 z-50 flex max-h-[85vh] w-[min(93vw,24rem)] flex-col rounded-2xl border border-border bg-card shadow-soft ring-1 ring-border">
            <div className="flex items-start justify-between gap-3 px-5 pt-4">
              <span className="font-mono text-[10px] uppercase tracking-widest text-accent">Tour · {i + 1} / {STEPS.length}</span>
              <button onClick={end} aria-label="End tour" className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
            </div>
            {/* progress dots */}
            <div className="flex gap-1 px-5 pt-2">
              {STEPS.map((_, idx) => (
                <span key={idx} className={`h-1 flex-1 rounded-full ${idx <= i ? "bg-accent" : "bg-border"}`} />
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              <h3 className="text-lg font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              {step.sell && (
                <p className="mt-3 border-l-2 border-accent/50 pl-3 text-sm leading-relaxed text-foreground/90">{step.sell}</p>
              )}
              {step.render && <div className="mt-4">{step.render()}</div>}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
              <button onClick={back} disabled={i === 0}
                className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground disabled:opacity-40 hover:text-foreground">← Back</button>
              <button onClick={next}
                className="rounded-full bg-foreground px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-background transition hover:scale-[1.03]">
                {isLast ? "Done" : "Next →"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

/** Closing step: a quick 👍/👎 + optional note (→ tour_feedback), an email
 *  capture (→ leads), and the sign-up / sign-in / source CTAs. All writes are
 *  insert-only, read-nobody tables — the same honesty stance as the rest. */
function TourClose() {
  const [helpful, setHelpful] = useState<boolean | null>(null)
  const [note, setNote] = useState("")
  const [email, setEmail] = useState("")
  const [sentFb, setSentFb] = useState(false)
  const [sentEmail, setSentEmail] = useState(false)

  async function sendFeedback(h: boolean) {
    setHelpful(h)
    await supabase.from("tour_feedback").insert({ helpful: h, note: note.trim() || null, step: "end" })
    setSentFb(true)
  }
  async function sendEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    await supabase.from("leads").insert({ email: email.trim(), source: "tour" })
    setSentEmail(true); setEmail("")
  }

  return (
    <div className="space-y-4">
      {/* Feedback */}
      <div className="rounded-xl border border-border bg-background/40 p-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Was this useful?</p>
        {sentFb ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-accent"><Check className="size-4" /> Thanks for the feedback.</p>
        ) : (
          <>
            <div className="mt-2 flex gap-2">
              <button onClick={() => sendFeedback(true)}
                className={`rounded-md border px-3 py-1.5 text-sm transition ${helpful === true ? "border-accent bg-accent/10" : "border-border hover:border-accent"}`}>👍 Yes</button>
              <button onClick={() => sendFeedback(false)}
                className={`rounded-md border px-3 py-1.5 text-sm transition ${helpful === false ? "border-accent bg-accent/10" : "border-border hover:border-accent"}`}>👎 Not really</button>
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional — one line of feedback"
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-xs outline-none transition focus:border-accent" />
          </>
        )}
      </div>

      {/* Email capture */}
      <div className="rounded-xl border border-border bg-background/40 p-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Leave an email (optional)</p>
        {sentEmail ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-accent"><Check className="size-4" /> Noted — thank you.</p>
        ) : (
          <form onSubmit={sendEmail} className="mt-2 flex gap-2">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-xs outline-none transition focus:border-accent" />
            <button type="submit" className="shrink-0 rounded-md bg-foreground px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-background">Send</button>
          </form>
        )}
      </div>

      {/* CTAs */}
      <div className="flex flex-wrap gap-2">
        <a href="/register" className="rounded-full bg-accent px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-accent-foreground transition hover:brightness-110">Create account</a>
        <a href="/login" className="rounded-full border border-border px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-foreground transition hover:border-accent">Sign in</a>
        <a href="https://github.com/ria631/rievoree_ukazka" target="_blank" rel="noreferrer" className="rounded-full border border-border px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-foreground transition hover:border-accent">Code ↗</a>
      </div>
    </div>
  )
}
