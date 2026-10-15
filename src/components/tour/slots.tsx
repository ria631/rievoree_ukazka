import { useState } from "react"
import { Check, Code2, ThumbsDown, ThumbsUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase"
import { useXrayPanel } from "@/components/xray/XrayPanelContext"
import { DataGenerator } from "@/components/DataGenerator"

/** Interactive pieces rendered inside a tour card. */

export function OpenPageCode() {
  const { openCode } = useXrayPanel()
  return (
    <button onClick={() => openCode({ kind: "page" })}
      className="inline-flex items-center gap-2 rounded-full bg-[#0b0f0a] px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-accent ring-1 ring-accent transition hover:bg-[#121a0e]">
      <Code2 className="size-3.5" /> Open it full screen
    </button>
  )
}

export function TourDataGenerator() {
  return <DataGenerator compact />
}

/** A yes/no question with an optional note → tour_feedback (insert-only). */
export function AskFeedback({ step, question }: { step: string; question: string }) {
  const [answer, setAnswer] = useState<boolean | null>(null)
  const [note, setNote] = useState("")
  const [sent, setSent] = useState(false)

  async function send(h: boolean, withNote = false) {
    setAnswer(h)
    if (!withNote && h === false) return // let them add a word first
    try { await supabase.from("tour_feedback").insert({ helpful: h, note: note.trim() || null, step }) } catch { /* best-effort */ }
    setSent(true)
  }

  if (sent) {
    return <p className="flex items-center gap-1.5 text-sm text-accent"><Check className="size-4" /> Thanks — noted.</p>
  }
  return (
    <div className="rounded-xl border border-accent/30 bg-accent/[0.06] p-3">
      <p className="text-sm font-medium text-foreground">{question}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button onClick={() => send(true)}
          className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition",
            answer === true ? "border-accent bg-accent/15" : "border-border hover:border-accent")}>
          <ThumbsUp className="size-3.5" /> Yes, it's clear
        </button>
        <button onClick={() => send(false)}
          className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition",
            answer === false ? "border-accent bg-accent/15" : "border-border hover:border-accent")}>
          <ThumbsDown className="size-3.5" /> I wanted more
        </button>
      </div>
      {answer === false && (
        <form onSubmit={(e) => { e.preventDefault(); void send(false, true) }} className="mt-2 flex gap-2">
          <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="what were you hoping to try?"
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-xs outline-none focus:border-accent" />
          <button type="submit" className="shrink-0 rounded-md bg-foreground px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-background">Send</button>
        </form>
      )}
    </div>
  )
}

/** Closing step: 👍/👎 + note (→ tour_feedback), an email (→ leads), and CTAs. */
export function TourCloseSlot() {
  const [email, setEmail] = useState("")
  const [sentEmail, setSentEmail] = useState(false)

  async function sendEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    try { await supabase.from("leads").insert({ email: email.trim(), source: "tour" }) } catch { /* best-effort */ }
    setSentEmail(true); setEmail("")
  }

  return (
    <div className="space-y-3">
      <AskFeedback step="end" question="Was the tour useful?" />
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
      <div className="flex flex-wrap gap-2">
        <a href="/register" className="rounded-full bg-accent px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-accent-foreground transition hover:brightness-110">Create account</a>
        <a href="/login" className="rounded-full border border-border px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-foreground transition hover:border-accent">Sign in</a>
        <a href="https://github.com/ria631/rievoree_ukazka" target="_blank" rel="noreferrer" className="rounded-full border border-border px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-foreground transition hover:border-accent">Code ↗</a>
      </div>
    </div>
  )
}
