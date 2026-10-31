import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
} from "@tanstack/react-router"
import { AppShell, NotFoundScreen } from "./AppShell"
// Public / auth pages load eagerly — they're the entry point and lightweight
// (no charts), so the first paint of the landing stays instant.
import { Landing } from "@/pages/Landing"
import { Login } from "@/pages/Login"
import { Register } from "@/pages/Register"
import { ResetPassword } from "@/pages/ResetPassword"
import { About } from "@/pages/About"

/**
 * Code-based route tree (no codegen): every page under one shell.
 *
 * Performance: the product pages pull the heavy libraries (recharts, nivo,
 * tanstack-table). They're lazy-loaded per route via `lazyRouteComponent`, so a
 * visitor landing on `/` (or any auth page) never downloads chart code until
 * they actually open the app. This keeps the initial bundle — and the first
 * impression — small and fast.
 */
const lazy = (loader: () => Promise<Record<string, unknown>>, name: string) =>
  lazyRouteComponent(loader as never, name as never)

const rootRoute = createRootRoute({ component: AppShell, notFoundComponent: NotFoundScreen })

const routes = [
  createRoute({ getParentRoute: () => rootRoute, path: "/", component: Landing }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/login",
    component: Login,
    validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
      redirect: typeof search.redirect === "string" ? search.redirect : undefined,
    }),
  }),
  createRoute({ getParentRoute: () => rootRoute, path: "/register", component: Register }),
  createRoute({ getParentRoute: () => rootRoute, path: "/reset-password", component: ResetPassword }),
  createRoute({ getParentRoute: () => rootRoute, path: "/about", component: About }),
  createRoute({ getParentRoute: () => rootRoute, path: "/dashboard", component: lazy(() => import("@/pages/Dashboard"), "Dashboard") }),
  createRoute({ getParentRoute: () => rootRoute, path: "/ingest", component: lazy(() => import("@/pages/Ingest"), "Ingest") }),
  createRoute({ getParentRoute: () => rootRoute, path: "/pl", component: lazy(() => import("@/pages/Pl"), "Pl") }),
  createRoute({ getParentRoute: () => rootRoute, path: "/rent-roll", component: lazy(() => import("@/pages/RentRoll"), "RentRoll") }),
  createRoute({ getParentRoute: () => rootRoute, path: "/receivables", component: lazy(() => import("@/pages/Receivables"), "Receivables") }),
  createRoute({ getParentRoute: () => rootRoute, path: "/budget-flow", component: lazy(() => import("@/pages/BudgetFlow"), "BudgetFlow") }),
  createRoute({ getParentRoute: () => rootRoute, path: "/forecast", component: lazy(() => import("@/pages/Forecast"), "Forecast") }),
  createRoute({ getParentRoute: () => rootRoute, path: "/journal", component: lazy(() => import("@/pages/Journal"), "Journal") }),
  // Old report URLs (pre real-estate model) land on their successors.
  ...([["/reports", "/receivables"], ["/balance", "/budget-flow"], ["/pivot", "/forecast"], ["/variance", "/journal"], ["/aging", "/rent-roll"]] as const)
    .map(([from, to]) => createRoute({ getParentRoute: () => rootRoute, path: from, beforeLoad: () => { throw redirect({ to }) } })),
  createRoute({ getParentRoute: () => rootRoute, path: "/connectors", component: lazy(() => import("@/pages/Connectors"), "Connectors") }),
  createRoute({ getParentRoute: () => rootRoute, path: "/users", component: lazy(() => import("@/pages/Users"), "Users") }),
  createRoute({ getParentRoute: () => rootRoute, path: "/account", component: lazy(() => import("@/pages/Account"), "Account") }),
]

export const router = createRouter({
  routeTree: rootRoute.addChildren(routes),
  defaultPreload: "intent",          // prefetch a route's chunk on hover/focus
  defaultPendingComponent: RouteLoading,
  defaultPendingMs: 150,
})

/** Tiny loader shown only if a lazy route's chunk takes >150ms to arrive. */
function RouteLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <span className="inline-flex items-center gap-2.5 rounded-full bg-card px-5 py-3 font-mono text-xs uppercase tracking-widest text-muted-foreground ring-1 ring-border">
        <span className="size-1.5 animate-pulse rounded-full bg-accent" /> loading…
      </span>
    </div>
  )
}

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
