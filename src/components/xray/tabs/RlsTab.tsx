import { useEffect, useRef, useState } from "react"
import { createClient } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { createInstrumentedFetch } from "@/lib/xray/instrumentedFetch"
import { useXrayPanel } from "@/components/xray/XrayPanelContext"
import { useAuth } from "@/lib/auth/useAuth"
import { supabase } from "@/lib/supabase"

/**
 * RLS — "same query, three identities". The core demo moment: run the IDENTICAL
 * SELECT as Viewer / Manager / Admin and watch Postgres RLS return different
 * rows. The numbers are REAL — each "Run as…" signs in as a seeded demo user
 * and runs the same query through the same instrumented seam.
 *
 * It runs OUTSIDE the app's session: a plain token request, then one query
 * with that token, then a sign-out of just that one session. It never changes
 * who the app is signed in as — a demo visitor who wants the app itself to act
 * as Manager gets an explicit "Switch the app" button below the cards.
 */

// LOCAL + remote demo accounts. The shared password is the public demo
// password, never a real secret; these accounts are DB-locked to read-only.
const DEMO_PASSWORD = "demo123456"

type Role = "viewer" | "manager" | "admin"

// `useApp`: a demo visitor can also switch the app itself to this identity.
const IDENTITIES: { role: Role; email: string; label: string; reason: string; useApp?: boolean }[] = [
  { role: "viewer", email: "viewer@demo.local", label: "Viewer",
    reason: "my_entity_ids() — assigned entities only" },
  { role: "manager", email: "manager@demo.local", label: "Manager", useApp: true,
    reason: "my_entity_ids() — assigned entities only" },
  { role: "admin", email: "admin@demo.local", label: "Admin", useApp: true,
    reason: "member of all four — a demo admin is never platform staff" },
]

// The one query every identity runs — verbatim. Only the JWT differs.
const QUERY_SQL = "select id, name from entities order by name"

interface RunResult {
  count: number
  names: string[]
  error?: string
}

const URL_ = import.meta.env.VITE_SUPABASE_URL as string
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

/** Sign in as `email`, run THE query under that JWT, end that one session.
 *  No second auth client (no GoTrueClient warnings, nothing touches the app's
 *  storage). Instrumented, so the calls still show up on the X-ray CALLS tab. */
async function probeAs(email: string): Promise<RunResult> {
  const fetchX = createInstrumentedFetch()
  const res = await fetchX(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: DEMO_PASSWORD }),
  })
  const auth = await res.json().catch(() => ({}))
  if (!res.ok || !auth.access_token) {
    return { count: 0, names: [], error: auth.msg ?? auth.error_description ?? `sign-in failed (${res.status})` }
  }
  const token = auth.access_token as string
  try {
    // The identical query, now under this identity's JWT → RLS decides rows.
    const probe = createClient(URL_, KEY, { accessToken: async () => token, global: { fetch: fetchX } })
    const { data, error } = await probe.from("entities").select("id,name").order("name")
    return error
      ? { count: 0, names: [], error: error.message }
      : { count: data.length, names: data.map((e) => e.name as string) }
  } finally {
    // scope=local ends ONLY this probe's session. The demo accounts are shared:
    // a global sign-out would log out every visitor using them (you included).
    await fetchX(`${URL_}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: { apikey: KEY, Authorization: `Bearer ${token}` },
    }).catch(() => {})
  }
}

export function RlsTab() {
  const { rlsRunToken } = useXrayPanel()
  const { isDemo, user } = useAuth()
  const [switching, setSwitching] = useState<Role | null>(null)
  const [switchErr, setSwitchErr] = useState<string | null>(null)
  const me = user?.email?.toLowerCase() ?? ""

  // Demo only: sign the APP in as this shared demo identity (all read-only).
  async function switchApp(role: Role, email: string) {
    setSwitching(role); setSwitchErr(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password: DEMO_PASSWORD })
    setSwitching(null)
    if (error) setSwitchErr(error.message)
  }
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
    try {
      const result = await probeAs(email)
      setResults((r) => ({ ...r, [role]: result }))
      if (!result.error) setLastRun(role)
    } catch (e) {
      setResults((r) => ({ ...r, [role]: { count: 0, names: [], error: e instanceof Error ? e.message : "request failed" } }))
    } finally {
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
      <div data-tour="rls-cards" className="grid grid-cols-3 gap-px bg-border">
        {IDENTITIES.map((id) => (
          <IdentityCard
            key={id.role}
            label={id.label}
            reason={id.reason}
            result={results[id.role]}
            active={lastRun === id.role}
            busy={busy === id.role}
            onRun={() => runAs(id.role, id.email)}
            onUseApp={isDemo && id.useApp && me !== id.email ? () => switchApp(id.role, id.email) : undefined}
            switching={switching === id.role}
          />
        ))}
      </div>

      <SwitchHint error={switchErr} />
    </div>
  )
}

/** "Run as" only peeks — say so. */
function SwitchHint({ error }: { error: string | null }) {
  const { isDemo, role } = useAuth()
  return (
    <div className="border-t border-border px-4 py-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
      <p>
        <span className="text-foreground">Run as …</span> only looks through that identity's eyes —
        the app itself stays signed in as <span className="text-accent">{role ?? "you"}</span>.
        {isDemo ? <> <span className="text-foreground">Use app as …</span> switches the whole app (still read-only).</> : <> Your own role is set in Account.</>}
      </p>
      {error && <p className="mt-1 text-destructive">{error}</p>}
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
  onUseApp,
  switching,
}: {
  label: string
  reason: string
  result?: RunResult
  active: boolean
  busy: boolean
  onRun: () => void
  onUseApp?: () => void
  switching?: boolean
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

      <div className="mt-auto flex flex-col gap-1">
        <Button
          data-tour={`rls-run-${label.toLowerCase()}`}
          variant={active ? "default" : "outline"}
          size="xs"
          className="font-mono text-[10px]"
          disabled={busy}
          onClick={onRun}
        >
          {busy ? "running…" : `Run as ${label}`}
        </Button>
        {onUseApp && (
          <button onClick={onUseApp} disabled={switching}
            className="truncate rounded-md px-1 py-0.5 font-mono text-[10px] text-accent underline-offset-4 transition hover:underline disabled:opacity-50">
            {switching ? "switching…" : `Use app as ${label}`}
          </button>
        )}
      </div>
    </div>
  )
}
