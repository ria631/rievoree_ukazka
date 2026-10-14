import { useEffect, useRef, useState } from "react"
import { Link, Navigate, Outlet, useNavigate, useRouterState } from "@tanstack/react-router"
import { ChevronDown, Menu, ScanLine } from "lucide-react"
import { XRayPanel } from "@/components/xray/XRayPanel"
import { XrayPanelProvider } from "@/components/xray/XrayPanelContext"
import { CodeOverlay } from "@/components/xray/CodeOverlay"
import { InspectLayer } from "@/components/xray/CodeInspect"
import { Tour } from "@/components/Tour"
import { OrbsBackground } from "@/components/OrbsBackground"
import { PaperBackground, PaperGrain } from "@/components/PaperBackground"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useAuth } from "@/lib/auth/useAuth"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const navLinkBase = "rounded-full px-3 py-2 font-mono text-xs uppercase tracking-widest transition-colors"
// Compact variant for the 11-item signed-in product nav, so the whole row fits
// the bar without forcing a horizontal page scroll.
const navLinkCompact = "rounded-full px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wide transition-colors"
const navLinkActive = "bg-accent/12 text-accent"
const navLinkIdle = "text-muted-foreground hover:bg-secondary hover:text-foreground"

const DEMO_EMAIL = "demo@demo.local"

// Full product nav — only for a real signed-in account (not the demo tour).
// `roles` (when present) restricts a link to those roles; absent = everyone.
const MANAGER_ROLES = ["manager", "admin", "super_admin"]
const ADMIN_ROLES = ["admin", "super_admin"]
const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/pl", label: "P&L" },
  { to: "/balance", label: "Balance" },
  { to: "/pivot", label: "Pivot" },
  { to: "/variance", label: "Variance" },
  { to: "/aging", label: "Aging" },
  { to: "/reports", label: "Reports" },
  { to: "/ingest", label: "Ingest" },
  { to: "/connectors", label: "Connectors", roles: MANAGER_ROLES },
  { to: "/users", label: "Users", roles: ADMIN_ROLES },
  { to: "/account", label: "Account" },
] as const

// The nav a given role may see (Connectors → managers+, Users → admins). A demo
// identity has no account of its own to manage, so it never gets "Account".
function navFor(role: string | null, demo = false) {
  return NAV.filter((item) =>
    (!("roles" in item) || (item.roles as readonly string[]).includes(role ?? "")) && !(demo && item.to === "/account"))
}

// Demo "tour" nav — read-only analytics only. NO Ingest / Users / Account.
const SHOWCASE = [
  { to: "/dashboard", label: "Overview" },
  { to: "/pl", label: "P&L" },
  { to: "/balance", label: "Balance" },
  { to: "/pivot", label: "Pivot" },
  { to: "/variance", label: "Variance" },
  { to: "/aging", label: "Aging" },
  { to: "/reports", label: "Reports" },
] as const

// Routes the demo tour must not reach (write / account features → sign in first).
const DEMO_BLOCKED = new Set(["/ingest", "/users", "/connectors", "/account"])

const PUBLIC = new Set(["/", "/login", "/register", "/about", "/reset-password"])
const PAPER_ROUTES = new Set(["/", "/login", "/register", "/about", "/reset-password"])

export function AppShell() {
  const { session, role, active, loading } = useAuth()
  const navigate = useNavigate()
  const path = useRouterState({ select: (s) => s.location.pathname })
  const onPaper = PAPER_ROUTES.has(path)
  const scrolled = useScrolled()
  // ANY *@demo.local account is a demo identity (the "Explore the demo" viewer,
  // and the viewer@/manager@/admin@ role accounts the tour signs in as). The UI
  // frames all of them as "exploring the demo as <role> · read-only" — never as a
  // real login — because every write is blocked server-side. isExploreTour is the
  // lean read-only viewer tour (demo@) specifically.
  const isDemo = !!session && (session.user.email ?? "").toLowerCase().endsWith("@demo.local")
  const isExploreTour = !!session && session.user.email === DEMO_EMAIL

  async function exploreDemo() {
    const { error } = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: "demo123456" })
    if (!error) navigate({ to: "/dashboard" })
  }
  async function exitDemo() {
    await supabase.auth.signOut()
    navigate({ to: "/" })
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="inline-flex items-center gap-2.5 rounded-full bg-card px-5 py-3 font-mono text-xs uppercase tracking-widest text-muted-foreground shadow-soft ring-1 ring-border">
          <span className="size-1.5 animate-pulse rounded-full bg-accent" /> loading…
        </span>
      </div>
    )
  }

  // Guard: anon on a protected route → login.
  if (!session && !PUBLIC.has(path)) {
    return <Navigate to="/login" search={{ redirect: path }} />
  }
  // Guard: a deactivated account sees nothing but a notice (RLS also cuts all
  // data server-side; this is the human-facing half).
  if (session && !isDemo && active === false) {
    return <DeactivatedScreen email={session.user.email ?? ""} />
  }
  // Guard: the lean "explore demo" viewer tour cannot reach write/account routes
  // — explain, don't bounce silently. Role-demos (manager@/admin@) MAY reach them
  // (read-only; the DB blocks their writes), so the tour can show Ingest.
  if (isExploreTour && DEMO_BLOCKED.has(path)) {
    return <DemoBlockedScreen path={path} />
  }

  // A truly registered account (full chrome: Sign out, acting-as).
  const realUser = !!session && !isDemo
  // Who sees the full product nav: real users, and role-demos (so manager@ sees
  // Ingest/Connectors). The lean SHOWCASE nav is only the read-only viewer tour.
  const showProductNav = realUser || (isDemo && !isExploreTour)

  // The product nav has up to 11 items, so its bar needs more room and a higher
  // "collapse to menu" breakpoint than the lean tour/anon navs.
  const headerMax = showProductNav ? "max-w-7xl" : "max-w-6xl"

  return (
    // XrayPanelProvider: the X-ray panel's open/tab state is shared so the
    // guided tour can drive it. overflow-x-clip: a hard guarantee the page
    // never scrolls sideways (clip doesn't create a scroll container, so the
    // sticky header still works).
    <XrayPanelProvider>
    <div className={cn("flex min-h-screen flex-col overflow-x-clip", onPaper && "paper")}>
      {onPaper ? <PaperBackground /> : <OrbsBackground subtle />}

      <header className={onPaper
        // Solid lime block (same paper + grain as the page) so content scrolling
        // underneath never shows through the logo/menu. Looks identical at the top.
        ? cn("sticky top-0 z-40 bg-[#A3E635] transition-shadow", scrolled && "shadow-[0_1px_0_oklch(0.2_0.035_150/0.14)]")
        : "sticky top-0 z-40 border-b border-border bg-background/75 shadow-soft backdrop-blur-lg"}>
        {onPaper && <PaperGrain />}
        <div className={cn("relative mx-auto flex h-16 items-center justify-between gap-4 px-6", headerMax)}>
          <Link to="/" className="shrink-0 whitespace-nowrap text-xl font-semibold tracking-tight">
            X-RAY<span className={onPaper ? "text-accent" : "bg-gradient-to-r from-accent to-signal bg-clip-text text-transparent"}>/</span>
          </Link>

          {showProductNav ? (
            <nav data-tour="main-nav" className="hidden items-center gap-0.5 xl:flex">
              {navFor(role, isDemo).map((item) => (
                <Link key={item.to} to={item.to} data-tour={`nav-${item.to.slice(1)}`} className={navLinkCompact}
                  activeProps={{ className: navLinkActive }} inactiveProps={{ className: navLinkIdle }}>
                  {item.label}
                </Link>
              ))}
            </nav>
          ) : isExploreTour ? (
            <nav className="hidden items-center gap-1 lg:flex">
              {SHOWCASE.map((item) => (
                <Link key={item.to} to={item.to} className={navLinkBase}
                  activeProps={{ className: navLinkActive }} inactiveProps={{ className: navLinkIdle }}>
                  {item.label}
                </Link>
              ))}
            </nav>
          ) : (
            <nav className="hidden items-center gap-1 md:flex">
              <button onClick={exploreDemo} className={`${navLinkBase} ${navLinkIdle}`}>Demo</button>
              <Link to="/about" className={navLinkBase}
                activeProps={{ className: navLinkActive }} inactiveProps={{ className: navLinkIdle }}>O nás</Link>
              <Link to="/login" className={`${navLinkBase} ${navLinkIdle}`}>Prihlásiť</Link>
            </nav>
          )}

          <div className="flex items-center gap-2.5">
            <XRayPanel />
            {realUser && <div className="hidden xl:block"><ActingAs label={role ?? session.user.email ?? "signed in"} /></div>}
            {isDemo && (
              <div className={cn("hidden shrink-0 items-center gap-2 whitespace-nowrap", showProductNav ? "xl:flex" : "lg:flex")}>
                <DemoRoleSwitch role={role} email={session.user.email ?? ""} />
                {/* With the full product nav the bar is tight; the demo banner right
                    below carries the same CTA, so the header skips it. */}
                {!showProductNav && (
                  <Link to="/register" className="whitespace-nowrap rounded-full bg-accent px-4 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-accent-foreground transition hover:brightness-110">
                    Create account
                  </Link>
                )}
                <button onClick={exitDemo} className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">Exit</button>
              </div>
            )}
            <div className={realUser ? "xl:hidden" : isDemo && showProductNav ? "xl:hidden" : isDemo ? "lg:hidden" : "md:hidden"}>
              <MobileNav mode={realUser ? "user" : isDemo ? "demo" : "anon"}
                navItems={isExploreTour ? SHOWCASE : navFor(role, isDemo)}
                identity={isDemo ? `${role ?? "demo"} · demo` : (role ?? session?.user.email ?? "signed in")}
                onDemo={exploreDemo} onExitDemo={exitDemo} />
            </div>
          </div>
        </div>
      </header>

      {/* Demo banner — makes the read-only state unmistakable + nudges sign-up. */}
      {isDemo && !onPaper && (
        <div data-tour="demo-banner" className="border-b border-accent/20 bg-accent/[0.07]">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-6 py-2.5 text-sm">
            <span className="font-medium text-foreground">
              You're exploring the demo{role ? <> as <span className="uppercase">{role}</span></> : null} — read-only.
            </span>
            <span className="text-muted-foreground">Create an account to upload your own data and use the write tools.</span>
            <span className="ml-auto flex items-center gap-2">
              <Link to="/register" className="rounded-full bg-accent px-4 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-accent-foreground transition hover:brightness-110">Create account</Link>
              <Link to="/login" className="rounded-full border border-border px-4 py-1.5 font-mono text-[10px] uppercase tracking-widest text-foreground transition hover:border-accent">Sign in</Link>
            </span>
          </div>
        </div>
      )}

      <main className={onPaper ? "relative w-full flex-1" : "relative mx-auto w-full max-w-6xl flex-1 px-6 py-16"}>
        <Outlet />
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center gap-2.5 px-6 py-8">
          <span className={`size-1.5 rounded-full ${onPaper ? "bg-foreground" : "bg-signal"}`} />
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Portfolio demo — fake data only</p>
        </div>
      </footer>

      {/* Guided tour — only inside the app (not the public paper pages). It
          auto-offers once to the read-only demo visitor, who is the one most
          likely to miss the machinery. */}
      {session && !onPaper && <Tour autoOffer={isExploreTour} />}

      {/* X-RAY CODE inspect mode + the full-screen IDE it (and the tour) opens. */}
      {session && !onPaper && <InspectLayer />}
      <CodeOverlay />
    </div>
    </XrayPanelProvider>
  )
}

function useScrolled() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8)
    on()
    window.addEventListener("scroll", on, { passive: true })
    return () => window.removeEventListener("scroll", on)
  }, [])
  return scrolled
}

// Demo identities a visitor can switch between. Both are DB-locked read-only;
// the Manager one additionally SEES the write side (Ingest, Connectors).
const DEMO_ROLES = [
  { email: DEMO_EMAIL, label: "Viewer", hint: "reads reports only" },
  { email: "manager@demo.local", label: "Manager", hint: "+ upload, review, connectors" },
] as const

/** The "<role> · demo" chip — click it to switch demo identity. The guided tour
 *  clicks it too (data-tour anchors), so a visitor SEES the role change happen. */
function DemoRoleSwitch({ role, email }: { role: string | null; email: string }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const path = useRouterState({ select: (s) => s.location.pathname })

  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener("mousedown", off)
    return () => window.removeEventListener("mousedown", off)
  }, [open])

  async function pick(target: string) {
    setOpen(false)
    if (target === email) return
    setBusy(true)
    await supabase.auth.signInWithPassword({ email: target, password: "demo123456" })
    setBusy(false)
    // The read-only viewer tour can't open write pages — land on the dashboard.
    if (target === DEMO_EMAIL && DEMO_BLOCKED.has(path)) navigate({ to: "/dashboard" })
  }

  return (
    <div ref={ref} className="relative">
      <button data-tour="role-switch" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-secondary px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground ring-1 ring-border transition hover:text-foreground hover:ring-accent/50">
        <ScanLine className="size-3" strokeWidth={2.25} /> {busy ? "switching…" : `${role ?? "demo"} · demo`}
        <ChevronDown className="size-3 opacity-60" />
      </button>
      {open && (
        <div role="menu" data-tour="role-menu" className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl bg-card p-1 shadow-soft ring-1 ring-border">
          <p className="px-3 pb-1 pt-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">View the demo as</p>
          {DEMO_ROLES.map((r) => (
            <button key={r.email} role="menuitem" data-tour={`role-${r.label.toLowerCase()}`} onClick={() => pick(r.email)}
              className={cn("flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-secondary",
                r.email === email && "bg-accent/10")}>
              <span className="font-mono text-xs uppercase tracking-wider">{r.label}</span>
              <span className="text-[10px] text-muted-foreground">{r.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function MobileNav({ mode, navItems, identity, onDemo, onExitDemo }: { mode: "user" | "demo" | "anon"; navItems: readonly { to: string; label: string }[]; identity: string; onDemo: () => void; onExitDemo: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open menu" className="rounded-full">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" aria-describedby={undefined} className="w-72 gap-0">
        <SheetHeader>
          <SheetTitle className="text-lg">
            X-RAY<span className="bg-gradient-to-r from-accent to-signal bg-clip-text text-transparent">/</span>
          </SheetTitle>
        </SheetHeader>
        <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
          {mode === "user" && navItems.map((item) => (
            <Link key={item.to} to={item.to} onClick={() => setOpen(false)}
              className="rounded-xl px-4 py-3 font-mono text-sm uppercase tracking-widest transition-colors"
              activeProps={{ className: navLinkActive }} inactiveProps={{ className: navLinkIdle }}>
              {item.label}
            </Link>
          ))}
          {mode === "demo" && (
            <>
              {navItems.map((item) => (
                <Link key={item.to} to={item.to} onClick={() => setOpen(false)}
                  className="rounded-xl px-4 py-3 font-mono text-sm uppercase tracking-widest transition-colors"
                  activeProps={{ className: navLinkActive }} inactiveProps={{ className: navLinkIdle }}>
                  {item.label}
                </Link>
              ))}
              <Link to="/register" onClick={() => setOpen(false)} className={`rounded-xl px-4 py-3 font-mono text-sm uppercase tracking-widest ${navLinkIdle}`}>Create account</Link>
              <Link to="/login" onClick={() => setOpen(false)} className={`rounded-xl px-4 py-3 font-mono text-sm uppercase tracking-widest ${navLinkIdle}`}>Sign in</Link>
            </>
          )}
          {mode === "anon" && (
            <>
              <button onClick={() => { setOpen(false); onDemo() }} className={`rounded-xl px-4 py-3 text-left font-mono text-sm uppercase tracking-widest ${navLinkIdle}`}>Demo</button>
              <Link to="/about" onClick={() => setOpen(false)} className={`rounded-xl px-4 py-3 font-mono text-sm uppercase tracking-widest ${navLinkIdle}`}>O nás</Link>
              <Link to="/login" onClick={() => setOpen(false)} className={`rounded-xl px-4 py-3 font-mono text-sm uppercase tracking-widest ${navLinkIdle}`}>Prihlásiť</Link>
            </>
          )}
        </nav>
        {mode === "user" && (
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-border px-4 py-4">
            <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
              <span className="size-1.5 rounded-full bg-signal" /> {identity}
            </span>
            <Button variant="ghost" size="xs" className="font-mono text-[10px] uppercase tracking-wider"
              onClick={() => { setOpen(false); void supabase.auth.signOut() }}>Sign out</Button>
          </div>
        )}
        {mode === "demo" && (
          <div className="mt-auto border-t border-border px-4 py-4">
            <Button variant="ghost" size="xs" className="font-mono text-[10px] uppercase tracking-wider"
              onClick={() => { setOpen(false); onExitDemo() }}>Exit demo</Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

// The demo tour is read-only; write/account routes need a real account. Shown
// instead of a silent redirect so the visitor knows why and what to do next.
function DemoBlockedScreen({ path }: { path: string }) {
  const feature = path.replace("/", "") || "that page"
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-accent/15 text-accent ring-1 ring-accent/30">
        <ScanLine className="size-6" />
      </span>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">That's a hands-on page</h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          You're in the read-only demo, so <span className="font-mono text-foreground">{feature}</span> (where
          you'd upload, approve or manage) is off. Create a free account to get a private sandbox and try it for real —
          or keep exploring the read-only reports.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link to="/register" className="rounded-full bg-accent px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-accent-foreground transition hover:brightness-110">
          Create account
        </Link>
        <Link to="/dashboard" className="rounded-full border border-border px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground transition hover:border-accent">
          Back to the demo
        </Link>
      </div>
    </div>
  )
}

// Friendly 404 for a signed-in user who hits an unknown route (reported: a bare
// "Not Found" with no way back).
function NotFoundScreen() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="font-mono text-6xl font-bold text-accent">404</span>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          That route doesn't exist. Head back to the dashboard.
        </p>
      </div>
      <Link to="/dashboard" className="rounded-full bg-accent px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-accent-foreground transition hover:brightness-110">
        Go to dashboard
      </Link>
    </div>
  )
}

export { NotFoundScreen }

function DeactivatedScreen({ email }: { email: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-destructive/15 text-destructive ring-1 ring-destructive/30">
        <ScanLine className="size-6" />
      </span>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account deactivated</h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          Access for <span className="text-foreground">{email}</span> has been turned off by an
          administrator. Contact your admin if you think this is a mistake.
        </p>
      </div>
      <Button variant="outline" className="font-mono text-xs uppercase tracking-wider"
        onClick={() => void supabase.auth.signOut()}>Sign out</Button>
    </div>
  )
}

function ActingAs({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-card py-1 pr-1 pl-3 ring-1 ring-border">
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className="size-1.5 rounded-full bg-signal" />
        {label}
      </span>
      <Button variant="ghost" size="xs" className="rounded-full font-mono text-[10px] uppercase tracking-wider"
        onClick={() => void supabase.auth.signOut()}>Sign out</Button>
    </div>
  )
}
