import { useEffect, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Dialog } from "radix-ui"
import { Check, X } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { isDemoEmail } from "@/lib/auth/demo"
import { enterDemo, onOpenDemoGate, rememberedDemoEmail, DemoSessionError } from "@/lib/demoSession"

const INSIDE = [
  "Seven reports on four sample companies — two years of books",
  "Press X on any page: the API calls, the SQL and the security policy behind it",
  "Switch between Viewer, Manager and Admin and watch the data change",
  "A two-minute guided tour, if you want one",
]

/**
 * The way into the live demo. It shows what's inside first — a short, silent
 * recording of the real demo and four lines on what to try — then asks for an
 * e-mail and goes straight in. Mounted once at the root; any "Open the demo"
 * button opens it (openDemoGate). A visitor already in a demo session goes
 * straight to the dashboard.
 */
export function DemoGateHost() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const reduceMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches

  useEffect(() => onOpenDemoGate(async () => {
    const { data } = await supabase.auth.getSession()
    if (isDemoEmail(data.session?.user.email)) { navigate({ to: "/dashboard" }); return }
    setEmail(rememberedDemoEmail())
    setError(null)
    setOpen(true)
  }), [navigate])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError(null)
    try {
      await enterDemo(email)
      setOpen(false)
      navigate({ to: "/dashboard" })
    } catch (err) {
      setError(err instanceof DemoSessionError ? err.message : "The demo could not open — please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !busy && setOpen(v)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          onOpenAutoFocus={(e) => { e.preventDefault(); input.current?.focus() }}
          className="fixed left-1/2 top-1/2 z-[91] grid max-h-[94vh] w-[min(94vw,940px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card text-foreground shadow-2xl md:grid-cols-[1.25fr_1fr]">
          <Dialog.Close aria-label="Close" className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-md bg-card/80 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X className="size-4" />
          </Dialog.Close>
          {/* What's inside, before anyone is asked for anything: a real, silent
              walk through the demo (recorded from the live site). Loaded only
              when the gate opens; still poster for reduced motion. */}
          <figure className="relative m-0 flex flex-col justify-center bg-[#061716] p-3 md:rounded-l-2xl md:p-4">
            <video className="block aspect-[8/5] w-full rounded-lg ring-1 ring-border" poster="/img/demo-peek.webp"
              autoPlay={!reduceMotion} muted loop playsInline preload="metadata" controls={reduceMotion} aria-label="A silent walk through the demo: the overview, the X-ray panel's row-level security check, the P&L and the rent roll">
              <source src="/img/demo-peek.webm" type="video/webm" />
              <source src="/img/demo-peek.mp4" type="video/mp4" />
            </video>
            <figcaption className="mt-2.5 text-center text-[12px] text-muted-foreground">The real demo, recorded — overview · X-ray security check · P&amp;L · rent roll</figcaption>
          </figure>
          <div className="flex flex-col p-6 sm:p-7">
            <Dialog.Title className="pr-8 font-display text-2xl font-extrabold uppercase leading-none">Open the live demo</Dialog.Title>
            <Dialog.Description className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
              The whole product, read-only, on sample data. No password, no sign-up — just your e-mail.
            </Dialog.Description>
            <ul className="mt-4 grid gap-2 text-[13.5px] leading-snug">
              {INSIDE.map((t) => (
                <li key={t} className="flex gap-2"><Check className="mt-0.5 size-4 flex-none text-accent" />{t}</li>
              ))}
            </ul>
            <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
              <label className="text-[13px] font-semibold" htmlFor="demo-email">E-mail</label>
              <input id="demo-email" ref={input} type="email" required autoComplete="email" inputMode="email" maxLength={254}
                value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
                className="h-12 rounded-lg border border-border bg-background px-4 text-[15px] outline-none transition focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40" />
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <button type="submit" disabled={busy}
                className="mt-1 h-12 rounded-lg bg-accent text-[15px] font-semibold text-accent-foreground transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70">
                {busy ? "Opening the demo…" : "Open the demo"}
              </button>
            </form>
            <p className="mt-4 text-[12.5px] leading-relaxed text-muted-foreground">
              I keep your e-mail only to follow up about this project — no newsletter, never shared. Ask and it's deleted.
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
