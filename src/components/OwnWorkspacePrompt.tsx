import { useNavigate } from "@tanstack/react-router"
import { Check, Sparkles } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

/**
 * Shown in the shared read-only demo wherever a real workspace would let you
 * act — manage people, upload documents, connect sources. It explains what
 * that page does in your own workspace and offers the way there. Leaving goes
 * through a local sign-out first: the demo accounts are shared, and a global
 * sign-out would end every visitor's session on them.
 */
export function OwnWorkspacePrompt({ title, body, points, compact = false }: {
  title: string
  body: string
  points?: string[]
  compact?: boolean
}) {
  const navigate = useNavigate()
  const leaveTo = async (to: "/register" | "/login") => {
    await supabase.auth.signOut({ scope: "local" })
    navigate({ to })
  }
  return (
    <section className={cn("rounded-2xl border border-accent/30 bg-accent/[0.06] ring-1 ring-inset ring-accent/10", compact ? "mb-6 px-5 py-4" : "px-6 py-7 sm:px-8")}>
      <div className={cn("flex gap-4", compact ? "flex-col sm:flex-row sm:items-center" : "flex-col")}>
        <div className="flex min-w-0 flex-1 gap-3">
          <span className="grid size-9 flex-none place-items-center rounded-lg bg-accent/15 text-accent ring-1 ring-accent/30">
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className={cn("font-display font-extrabold uppercase", compact ? "text-lg" : "text-2xl")}>{title}</h2>
            <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">{body}</p>
            {points && !compact && (
              <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                {points.map((p) => (
                  <li key={p} className="flex items-start gap-2"><Check className="mt-0.5 size-4 flex-none text-accent" />{p}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className={cn("flex flex-wrap gap-2.5", compact ? "sm:flex-none" : "sm:pl-12")}>
          <button type="button" onClick={() => void leaveTo("/register")}
            className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:brightness-110">
            Create your workspace
          </button>
          <button type="button" onClick={() => void leaveTo("/login")}
            className="rounded-md border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-foreground/40">
            Sign in
          </button>
        </div>
      </div>
    </section>
  )
}
