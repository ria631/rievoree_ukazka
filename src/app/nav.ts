import type { ComponentType } from "react"
import {
  ArrowLeftRight, BarChart3, BookText, Download, Home, LayoutGrid, LineChart, Link2, TrendingUp,
  User, Users as UsersIcon,
} from "lucide-react"

/** The product nav — shared by the sidebar and the page-header crumbs. */
export type Role = "viewer" | "manager" | "admin" | "super_admin"
export const RANK: Record<string, number> = { viewer: 0, manager: 1, admin: 2, super_admin: 3 }

export interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string; strokeWidth?: number }>
  /** Lowest role that may open it; absent = everyone. */
  min?: Exclude<Role, "viewer" | "super_admin">
  /** Write / account pages the shared read-only viewer tour can't open. */
  hands?: boolean
}

// The product nav, grouped the way an accountant reads it: what the books say,
// where they come from, who may touch them.
export const NAV: { group: string; items: NavItem[] }[] = [
  { group: "Reports", items: [
    { to: "/dashboard", label: "Overview", icon: LayoutGrid },
    { to: "/pl", label: "P&L", icon: BarChart3 },
    { to: "/rent-roll", label: "Rent roll", icon: Home },
    { to: "/receivables", label: "AR / AP", icon: ArrowLeftRight },
    { to: "/budget-flow", label: "Budget flow", icon: TrendingUp },
    { to: "/forecast", label: "Forecast", icon: LineChart },
  ] },
  { group: "Ledger", items: [
    { to: "/journal", label: "Journal", icon: BookText },
    { to: "/ingest", label: "Ingest", icon: Download, hands: true },
    { to: "/connectors", label: "Connectors", icon: Link2, min: "manager", hands: true },
  ] },
  { group: "Settings", items: [
    { to: "/users", label: "Users", icon: UsersIcon, min: "admin", hands: true },
    { to: "/account", label: "Account", icon: User, hands: true },
  ] },
]

/** Group label for a route — the first crumb of every page header. */
export function navGroupOf(path: string) {
  return NAV.find((g) => g.items.some((i) => i.to === path))?.group ?? "X-Ray"
}
