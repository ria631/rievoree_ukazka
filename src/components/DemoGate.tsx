import { useEffect, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Dialog } from "radix-ui"
import { X } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { isDemoEmail } from "@/lib/auth/demo"
import { enterDemo, onOpenDemoGate, rememberedDemoEmail, DemoSessionError } from "@/lib/demoSession"

/**
 * The way into the live demo: an e-mail, then straight in. Mounted once at
 * the root; any "Open the demo" button opens it (openDemoGate). A visitor who
 * is already in a demo session goes straight to the dashboard.
 */
export function DemoGateHost() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

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
          className="fixed left-1/2 top-1/2 z-[91] w-[min(92vw,460px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 text-foreground shadow-2xl sm:p-7">
          <Dialog.Close aria-label="Close" className="absolute right-3 top-3 grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X className="size-4" />
          </Dialog.Close>
          <Dialog.Title className="font-display text-2xl font-extrabold uppercase leading-none">Open the live demo</Dialog.Title>
          <Dialog.Description className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
            Leave your e-mail and you're in: the whole product, read-only, on sample data — no password, no sign-up.
          </Dialog.Description>
          <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
            <label className="text-[13px] font-semibold" htmlFor="demo-email">Work e-mail</label>
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
