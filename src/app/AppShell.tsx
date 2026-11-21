import { useState } from "react"
import { Link, Navigate, Outlet, useNavigate, useRouterState } from "@tanstack/react-router"
import { Menu, ScanLine } from "lucide-react"
import { NAV, RANK, type NavItem } from "./nav"
import { XRayPanel } from "@/components/xray/XRayPanel"
import { XrayPanelProvider } from "@/components/xray/XrayPanelContext"
import { CodeOverlay } from "@/components/xray/CodeOverlay"
import { CodeXrayButton, InspectLayer } from "@/components/xray/CodeInspect"
import { Tour } from "@/components/Tour"
import { PaperBackground, PaperGrain } from "@/components/PaperBackground"
import { BrandLink } from "@/components/BrandMark"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useAuth } from "@/lib/auth/useAuth"
import { supabase } from "@/lib/supabase"
import { requestTourStart } from "@/lib/tourBus"
import { cn } from "@/lib/utils"

const DEMO_EMAIL = "demo@demo.local"
const DEMO_PASSWORD = "demo123456"

// Routes the read-only viewer tour must not reach (write / account features).
const DEMO_BLOCKED = new Set(["/ingest", "/users", "/connectors", "/account"])
const PAPER_ROUTES = new Set(["/", "/login", "/register", "/about", "/reset-password"])

/** Is the session a shared demo identity? Any *@demo.local account is. */
function isDemoEmail(email: string | undefined) {
  return (email ?? "").toLowerCase().endsWith("@demo.local")
}

export function AppShell() {
  const { session, role, active, loading } = useAuth()
  const path = useRouterState({ select: (s) => s.location.pathname })
  const onPaper = PAPER_ROUTES.has(path)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="inline-flex items-center gap-2.5 rounded-full bg-card px-5 py-3 font-mono text-xs uppercase tracking-widest text-muted-foreground ring-1 ring-border">
          <span className="size-1.5 animate-pulse rounded-full bg-accent" /> loading…
        </span>
      </div>
    )
  }

  // Guard: anon on a protected route → login.
  if (!session && !onPaper) {
    return <Navigate to="/login" search={{ redirect: path }} />
  }
  const isDemo = !!session && isDemoEmail(session.user.email)
  // Guard: a deactivated account sees nothing but a notice (RLS also cuts all
  // data server-side; this is the human-facing half).
  if (session && !isDemo && active === false) {
    return <DeactivatedScreen email={session.user.email ?? ""} />
  }

  return (
    // XrayPanelProvider: the X-ray panel's open/tab state is shared so the
    // guided tour can drive it.
    <XrayPanelProvider>
      {onPaper ? <PaperLayout path={path} /> : <AppLayout path={path} role={role} email={session?.user.email ?? ""} isDemo={isDemo} />}
      <CodeOverlay />
    </XrayPanelProvider>
  )
}

/* ───────────────────────── the public pages: one lime sheet ───────────────────────── */

function PaperLayout({ path }: { path: string }) {
  // The landing brings its own bar (lime over the paper, dark over the
  // machinery) and its own footer.
  if (path === "/") return <div className="paper"><Outlet /></div>
  return (
    <div className="paper paper-page flex min-h-screen flex-col overflow-x-clip">
      <PaperBackground />
      <header className="sticky top-0 z-40 bg-paper">
        <PaperGrain />
        <div className="relative mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <BrandLink />
          <span className="flex-1" />
          <nav className="flex items-center gap-1 text-[15px] font-medium">
            <ExploreDemoButton className="rounded-md px-3 py-2 opacity-75 transition hover:opacity-100" label="Demo" />
            <Link to="/about" className="hidden rounded-md px-3 py-2 opacity-75 transition hover:opacity-100 sm:block" activeProps={{ className: "opacity-100" }}>About</Link>
            <Link to="/login" className="rounded-md px-3 py-2 opacity-75 transition hover:opacity-100" activeProps={{ className: "opacity-100" }}>Sign in</Link>
          </nav>
        </div>
      </header>
      <main className="relative w-full flex-1"><Outlet /></main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <span className="font-semibold text-foreground">Mariia Chernenko</span>
          <a href="https://github.com/ria631/rievoree_ukazka" target="_blank" rel="noreferrer" className="hover:text-foreground">GitHub</a>
          <span className="ml-auto font-mono text-xs">Portfolio demo · fake data only</span>
        </div>
      </footer>
    </div>
  )
}

/** Sign in as the shared read-only viewer and open the dashboard. */
export function useExploreDemo() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  async function explore() {
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
    setBusy(false)
    if (!error) navigate({ to: "/dashboard" })
  }
  return { busy, explore }
}

function ExploreDemoButton({ className, label }: { className?: string; label: string }) {
  const { busy, explore } = useExploreDemo()
  return <button onClick={() => void explore()} disabled={busy} className={className}>{busy ? "Opening…" : label}</button>
}

/* ───────────────────────── the product: sidebar + torn sheet ───────────────────────── */

function AppLayout({ path, role, email, isDemo }: { path: string; role: string | null; email: string; isDemo: boolean }) {
  const isExploreTour = email === DEMO_EMAIL
  const [menuOpen, setMenuOpen] = useState(false)
  // The lean read-only viewer tour can't reach write/account routes — explain,
  // don't bounce silently. Role demos (manager@/admin@) MAY reach them (the DB
  // blocks their writes), so the tour can show Ingest.
  const blocked = isExploreTour && DEMO_BLOCKED.has(path)
  const side = <SidebarBody role={role} email={email} isDemo={isDemo} isExploreTour={isExploreTour} onNavigate={() => setMenuOpen(false)} />

  return (
    <div className="min-h-screen min-[900px]:grid min-[900px]:grid-cols-[var(--side-w)_minmax(0,1fr)]">
      {/* Phone / tablet: a lime bar, the sidebar slides in from the left. */}
      <div className="sticky top-0 z-40 flex items-center gap-3 bg-paper px-4 py-2.5 text-ink min-[900px]:hidden">
        <BrandLink className="text-xl" />
        <span className="flex-1" />
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <button aria-label="Open menu" className="grid size-10 place-items-center rounded-md hover:bg-ink/10">
              <Menu className="size-[22px]" strokeWidth={2.2} />
            </button>
          </SheetTrigger>
          <SheetContent side="left" aria-describedby={undefined} showCloseButton={false} data-mobile-menu
            className="w-[min(300px,86vw)] gap-0 border-r border-border bg-side px-3.5 py-[18px]">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            {side}
          </SheetContent>
        </Sheet>
      </div>

      <aside data-shell-side aria-label="Main"
        className="sticky top-0 hidden h-svh flex-col border-r border-border bg-side px-3.5 py-[18px] min-[900px]:flex">
        {side}
      </aside>

      <main className="app-main @container relative min-w-0 px-4 pb-32 min-[900px]:px-9">
        {blocked ? <DemoBlockedScreen path={path} /> : <Outlet />}
      </main>

      <XRayPanel />
      {/* Guided tour — auto-offers once to the read-only demo visitor, who is
          the one most likely to miss the machinery. */}
      <Tour autoOffer={isExploreTour} />
      {/* X-RAY CODE inspect mode + the full-screen IDE it (and the tour) opens. */}
      <InspectLayer />
    </div>
  )
}

function SidebarBody({ role, email, isDemo, isExploreTour, onNavigate }: {
  role: string | null; email: string; isDemo: boolean; isExploreTour: boolean; onNavigate: () => void
}) {
  const rank = RANK[role ?? "viewer"] ?? 0
  return (
    <>
      <BrandLink to="/dashboard" onClick={onNavigate} className="px-2 pb-[22px] pt-0.5 [@media(max-height:940px)]:pb-4" />
      <nav data-tour="main-nav" aria-label="Pages" className="-mx-1 flex min-h-0 flex-col gap-0.5 overflow-y-auto px-1">
        {NAV.map(({ group, items }, gi) => {
          // A demo identity has no account of its own to manage.
          const shown = items.filter((it) => !(isDemo && it.to === "/account"))
          if (!shown.length) return null
          return (
            <div key={group} className="flex flex-col gap-0.5">
              <div className={cn("mx-2.5 mb-1.5 text-xs text-cold", gi ? "mt-4 [@media(max-height:940px)]:mt-2.5" : "mt-0")}>{group}</div>
              {shown.map((it) => {
                const need = it.min ? RANK[it.min] : 0
                // The viewer tour can't open hands-on pages; show what role would.
                const lockedBy = rank < need ? it.min : isExploreTour && it.hands ? (it.min ?? "manager") : null
                return lockedBy
                  ? <LockedLink key={it.to} item={it} lockedBy={lockedBy} />
                  : <NavLink key={it.to} item={it} onNavigate={onNavigate} />
              })}
            </div>
          )
        })}
      </nav>

      <div className="mt-auto pt-4">
        <GuideButtons onPick={onNavigate} />
        <div className="border-t border-border pt-4">
          {isDemo ? <DemoRoleSwitch role={role} email={email} /> : <SignedIn role={role} email={email} />}
        </div>
      </div>
    </>
  )
}

/** The guided tour + the X-RAY CODE inspector — the two ways into the machinery
 *  besides the X-ray pill. */
function GuideButtons({ onPick }: { onPick: () => void }) {
  return (
    <div className="mb-4 grid gap-1.5">
      <button onClick={() => { onPick(); requestTourStart() }}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 font-mono text-[11.5px] font-bold uppercase tracking-wider text-accent-foreground transition hover:brightness-110">
        <ScanLine className="size-3.5" strokeWidth={2.25} /> Take the tour
      </button>
      <span onClick={onPick} className="contents">
        <CodeXrayButton className="justify-center rounded-md px-3 py-2 text-[11.5px] tracking-wider" />
      </span>
    </div>
  )
}

const linkBase = "group flex items-center gap-3 rounded-[7px] px-2.5 py-[9px] text-[15px] font-medium transition-colors [@media(max-height:940px)]:py-[6px]"

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const Icon = item.icon
  return (
    <Link to={item.to} onClick={onNavigate} data-tour={`nav-${item.to.slice(1)}`}
      className={linkBase}
      activeProps={{ className: "bg-card text-foreground shadow-[inset_3px_0_0_var(--accent)] [&_svg]:text-accent", "aria-current": "page" }}
      inactiveProps={{ className: "text-muted-foreground hover:bg-card hover:text-foreground" }}>
      <Icon className="size-[18px] shrink-0" strokeWidth={1.7} />
      {item.label}
    </Link>
  )
}

function LockedLink({ item, lockedBy }: { item: NavItem; lockedBy: string }) {
  const Icon = item.icon
  return (
    <span aria-disabled="true" data-tour={`nav-${item.to.slice(1)}`}
      title={`Needs the ${lockedBy} role — switch below to see it`}
      className={cn(linkBase, "cursor-not-allowed text-muted-foreground opacity-50")}>
      <Icon className="size-[18px] shrink-0" strokeWidth={1.7} />
      {item.label}
      <span className="ml-auto font-mono text-[10.5px] text-cold">{lockedBy}+</span>
    </span>
  )
}

function SignedIn({ role, email }: { role: string | null; email: string }) {
  return (
    <div className="px-1">
      <div className="text-xs text-cold">Signed in as</div>
      <div className="mt-1 truncate text-sm font-medium" title={email}>{email}</div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground ring-1 ring-border">
          <span className="size-1.5 rounded-full bg-signal" />{(role ?? "viewer").replace("_", " ")}
        </span>
        <button onClick={() => void supabase.auth.signOut()}
          className="rounded-md px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition hover:bg-secondary hover:text-foreground">
          Sign out
        </button>
      </div>
    </div>
  )
}

// Demo identities a visitor can switch between. All are DB-locked read-only;
// Manager additionally SEES the write side (Ingest, Connectors), Admin also the
// Users page. The demo admin is never platform staff (migration 43): it sees the
// four sample companies as a member, nobody else's data.
const DEMO_ROLES = [
  { email: DEMO_EMAIL, label: "Viewer", note: "Viewers read reports only." },
  { email: "manager@demo.local", label: "Manager", note: "Managers can also upload, review and connect sheets." },
  { email: "admin@demo.local", label: "Admin", note: "Admins can also manage users and roles." },
] as const

/** Switch the app's session to another shared demo identity (all read-only). */
function useDemoSwitch(email: string) {
  const [busy, setBusy] = useState<string | null>(null)
  const navigate = useNavigate()
  const path = useRouterState({ select: (s) => s.location.pathname })
  async function pick(target: string) {
    if (target === email || busy) return
    setBusy(target)
    await supabase.auth.signInWithPassword({ email: target, password: DEMO_PASSWORD })
    setBusy(null)
    // The read-only viewer tour can't open write pages — land on the dashboard.
    if (target === DEMO_EMAIL && DEMO_BLOCKED.has(path)) navigate({ to: "/dashboard" })
  }
  return { busy, pick }
}

/** "Acting as" — the segmented demo role switch at the foot of the sidebar. The
 *  guided tour clicks it too (data-tour anchors), so a visitor SEES the role
 *  change happen. */
function DemoRoleSwitch({ email }: { role: string | null; email: string }) {
  const { busy, pick } = useDemoSwitch(email)
  const current = DEMO_ROLES.find((r) => r.email === email) ?? DEMO_ROLES[0]
  return (
    <div data-tour="role-switch">
      <div className="mx-1 mb-2 text-xs text-cold">Acting as</div>
      <div role="group" aria-label="Acting as" data-tour="role-menu"
        className="grid grid-cols-3 gap-[3px] rounded-lg border border-border p-[3px]">
        {DEMO_ROLES.map((r) => {
          const on = r.email === email
          return (
            <button key={r.email} aria-pressed={on} data-tour={`role-${r.label.toLowerCase()}`} disabled={!!busy}
              onClick={() => void pick(r.email)}
              className={cn("rounded-md py-[7px] text-[13px] font-semibold transition-colors disabled:cursor-wait",
                on ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
                busy === r.email && "animate-pulse")}>
              {r.label}
            </button>
          )
        })}
      </div>
      <p data-tour="demo-banner" className="mx-1 mt-2.5 text-[12.5px] leading-snug text-muted-foreground">
        <b className="font-semibold text-foreground">Read-only demo.</b> {current.note}
      </p>
      <div className="mx-1 mt-3 flex items-center gap-2">
        <Link to="/register" className="rounded-md bg-accent px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-accent-foreground transition hover:brightness-110">
          Create account
        </Link>
        <ExitDemo />
      </div>
    </div>
  )
}

function ExitDemo() {
  const navigate = useNavigate()
  return (
    <button onClick={async () => {
      // scope local: the demo accounts are shared — a global sign-out would end
      // every visitor's session on them, not just this tab's.
      await supabase.auth.signOut({ scope: "local" })
      navigate({ to: "/" })
    }} className="rounded-md px-2 py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition hover:bg-secondary hover:text-foreground">
      Exit
    </button>
  )
}

/* ───────────────────────── notices ───────────────────────── */

// The demo tour is read-only; write/account routes need a real account. Shown
// instead of a silent redirect so the visitor knows why and what to do next.
function DemoBlockedScreen({ path }: { path: string }) {
  const feature = path.replace("/", "") || "that page"
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="grid size-12 place-items-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/30">
        <ScanLine className="size-6" />
      </span>
      <div>
        <h1 className="font-display text-3xl font-extrabold uppercase">That's a hands-on page</h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          You're the read-only viewer, so <span className="font-mono text-foreground">{feature}</span> (where
          you'd upload, approve or manage) is off. Switch to <b className="text-foreground">Manager</b> in the
          sidebar to look around it, or create a free account to try it for real.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link to="/register" className="rounded-md bg-accent px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-accent-foreground transition hover:brightness-110">
          Create account
        </Link>
        <Link to="/dashboard" className="rounded-md border border-line-hi px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground transition hover:border-signal">
          Back to the reports
        </Link>
      </div>
    </div>
  )
}

// Friendly 404 for a signed-in user who hits an unknown route.
function NotFoundScreen() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="font-display text-7xl font-extrabold text-accent">404</span>
      <div>
        <h1 className="font-display text-3xl font-extrabold uppercase">Page not found</h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          That route doesn't exist. Head back to the dashboard.
        </p>
      </div>
      <Link to="/dashboard" className="rounded-md bg-accent px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-accent-foreground transition hover:brightness-110">
        Go to dashboard
      </Link>
    </div>
  )
}

export { NotFoundScreen }

function DeactivatedScreen({ email }: { email: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="grid size-12 place-items-center rounded-xl bg-destructive/15 text-destructive ring-1 ring-destructive/30">
        <ScanLine className="size-6" />
      </span>
      <div>
        <h1 className="font-display text-3xl font-extrabold uppercase">Account deactivated</h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          Access for <span className="text-foreground">{email}</span> has been turned off by an
          administrator. Contact your admin if you think this is a mistake.
        </p>
      </div>
      <button onClick={() => void supabase.auth.signOut()}
        className="rounded-md border border-line-hi px-5 py-2.5 font-mono text-xs uppercase tracking-wider transition hover:border-signal">
        Sign out
      </button>
    </div>
  )
}
