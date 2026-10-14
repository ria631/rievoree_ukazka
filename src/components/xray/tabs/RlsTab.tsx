import { useEffect, useRef, useState } from "react"
import { createClient } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { createInstrumentedFetch } from "@/lib/xray/instrumentedFetch"
import { useXrayPanel } from "@/components/xray/XrayPanelContext"

/**
 * RLS — "same query, three identities". The core demo moment: run the IDENTICAL
 * SELECT as Viewer / Manager / Admin and watch Postgres RLS return different
 * rows. The numbers are REAL — each "Run as…" signs in as a seeded demo user
 * and runs the same query through the same instrumented seam.
 *
 * It runs on an ISOLATED client (its own storage, no session persistence), so
 * it NEVER changes the app's own session — the read-only demo tour stays
 * read-only, and a real signed-in user keeps their seat. (Previously this
 * signed the whole app in as another role, which broke the demo's read-only
 * guarantee and confused the "acting as" banner.)
 */

// LOCAL + remote demo accounts. The shared password is the public demo
// password, never a real secret; these accounts are DB-locked to read-only.
const DEMO_PASSWORD = "demo123456"

type Role = "viewer" | "manager" | "admin"

const IDENTITIES: { role: Role; email: string; label: string; reason: string }[] = [
  { role: "viewer", email: "viewer@demo.local", label: "Viewer",
    reason: "my_entity_ids() — assigned entities only" },
  { role: "manager", email: "manager@demo.local", label: "Manager",
    reason: "my_entity_ids() — assigned entities only" },
  { role: "admin", email: "admin@demo.local", label: "Admin",
    reason: "is_admin() — platform staff, bypasses the entity filter" },
]

// The one query every identity runs — verbatim. Only the JWT differs.
const QUERY_SQL = "select id, name from entities order by name"

interface RunResult {
  count: number
  names: string[]
  error?: string
}

// A throwaway client that never touches the app's own auth storage. Each run
// signs in, queries, signs out on THIS client only. Instrumented, so the calls
// still show up on the X-ray CALLS tab.
function makeProbeClient() {
  return createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: "xray-rls-probe" },
      global: { fetch: createInstrumentedFetch() },
    },
  )
}

export function RlsTab() {
  const { rlsRunToken } = useXrayPanel()
  const [results, setResults] = useState<Partial<Record<Role, RunResult>>>({})
  const [busy, setBusy] = useState<Role | null>(null)
  const [lastRun, setLastRun] = useState<Role | null>(null)

  // The guided tour asks us to play all three roles in sequence (animated).
  // Init to 0 (not the current token): the tab mounts AFTER runRls() bumps the
  // token, so seeding with the live value would make the first open skip the run.
  const seenToken = useRef(0)
  useEffect(() => {
    if (rlsRunToken === 0 || rlsRunToken === seenToken.current) return
    seenToken.current = rlsRunToken
    let alive = true
    ;(async () => {
      for (const id of IDENTITIES) {
        if (!alive) return
        await runAs(id.role, id.email)
        await new Promise((r) => setTimeout(r, 650)) // let each result land visibly
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rlsRunToken])

  async function runAs(role: Role, email: string) {
    setBusy(role)
    const probe = makeProbeClient()
    try {
      const auth = await probe.auth.signInWithPassword({ email, password: DEMO_PASSWORD })
      if (auth.error) {
        setResults((r) => ({ ...r, [role]: { count: 0, names: [], error: auth.error!.message } }))
        return
      }
      // The identical query, now under this identity's JWT → RLS decides rows.
      const { data, error } = await probe.from("entities").select("id,name").order("name")
      setResults((r) => ({
        ...r,
        [role]: error
          ? { count: 0, names: [], error: error.message }
          : { count: data.length, names: data.map((e) => e.name as string) },
      }))
      setLastRun(role)
    } finally {
      // Always drop the probe session; the app's own session is never touched.
      await probe.auth.signOut().catch(() => {})
      setBusy(null)
    }
  }

  function reset() {
    setResults({})
    setLastRun(null)
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* The identical query — only the JWT changes between runs. */}
      <div className="border-b border-border px-4 py-3">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          identical query · GET /rest/v1/entities
        </p>
        <code className="block bg-secondary/50 px-3 py-2 font-mono text-xs text-foreground">
          {QUERY_SQL}
        </code>
        <p className="mt-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
          Same SQL, three identities. The server returns different rows by{" "}
          <span className="text-accent">auth.uid()</span> — RLS is the only
          barrier, not the frontend. Runs in an isolated session, so{" "}
          <span className="text-foreground">your own view here doesn't change.</span>
        </p>
      </div>

      {/* Status line — which identity was last probed (no global session change). */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          last run:{" "}
          <span className={lastRun ? "text-accent" : "text-foreground"}>
            {lastRun ?? "—"}
          </span>
        </span>
        <Button variant="outline" size="xs" className="font-mono text-[10px]"
          disabled={busy !== null || (!lastRun && Object.keys(results).length === 0)}
          onClick={reset}>
          Clear
        </Button>
      </div>

      {/* Three identity cards, side by side — the comparison. */}
      <div className="grid grid-cols-3 gap-px bg-border">
        {IDENTITIES.map((id) => (
          <IdentityCard
            key={id.role}
            label={id.label}
            reason={id.reason}
            result={results[id.role]}
            active={lastRun === id.role}
            busy={busy === id.role}
            onRun={() => runAs(id.role, id.email)}
          />
        ))}
      </div>
    </div>
  )
}

function IdentityCard({
  label,
  reason,
  result,
  active,
  busy,
  onRun,
}: {
  label: string
  reason: string
  result?: RunResult
  active: boolean
  busy: boolean
  onRun: () => void
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 bg-background p-3",
        active && "ring-1 ring-inset ring-accent",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-wider">{label}</span>
        {active && (
          <span className="size-1.5 animate-pulse rounded-full bg-accent" aria-hidden />
        )}
      </div>

      {/* The big number — entity rows this identity can see. */}
      <div className="font-mono tabular-nums">
        <span className="text-3xl font-bold">
          {result ? (result.error ? "—" : result.count) : "·"}
        </span>
        <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          {result?.error ? "err" : "entities"}
        </span>
      </div>

      {/* Which rows, concretely. */}
      <div className="min-h-8 font-mono text-[10px] leading-snug text-muted-foreground">
        {result?.error ? (
          <span className="text-destructive break-words">{result.error}</span>
        ) : result ? (
          result.names.map((n) => <div key={n} className="truncate">{n}</div>)
        ) : (
          <span className="opacity-50">not run</span>
        )}
      </div>

      <p className="font-mono text-[9px] leading-tight text-muted-foreground">
        {reason}
      </p>

      <Button
        variant={active ? "default" : "outline"}
        size="xs"
        className="mt-auto font-mono text-[10px]"
        disabled={busy}
        onClick={onRun}
      >
        {busy ? "running…" : `Run as ${label}`}
      </Button>
    </div>
  )
}
