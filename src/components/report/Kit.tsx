import { useMemo, useState, type ReactNode } from "react"
import { motion } from "motion/react"
import { CheckCircle2, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { useEntities } from "@/lib/data/useEntities"
import { SimpleSelect } from "@/components/ui/select"
import { Sparkline } from "@/components/charts/FinancialCharts"
import { CountUp } from "@/components/CountUp"
import { useTourControl } from "@/lib/tourBus"
import { useRouterState } from "@tanstack/react-router"
import { useAuth } from "@/lib/auth/useAuth"
import { navGroupOf } from "@/app/nav"

/** Shared building blocks of the reporting pages — one look, one vocabulary. */

export const eur = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })
/** Accounting format — negatives in parentheses, never "-€0". */
export const money = (n: number) => (Math.round(n) === 0 ? eur.format(0) : n < 0 ? `(${eur.format(Math.abs(n))})` : eur.format(n))
export const num = new Intl.NumberFormat("en-IE", { maximumFractionDigits: 0 })
export const pct = (n: number, d = 1) => `${(Math.round(n * 10 ** d) / 10 ** d || 0).toFixed(d)}%`

/**
 * The page header: printed on the lime sheet and torn along its bottom edge —
 * everything under it is the machinery. Crumbs (nav group / page), an optional
 * status pill, the signed-in role, the title, one line of meaning, and the
 * page's main controls on the right.
 */
export function PageIntro({ eyebrow, title, children, actions, status }: {
  eyebrow: string; title: string; children?: ReactNode; actions?: ReactNode; status?: ReactNode
}) {
  const path = useRouterState({ select: (s) => s.location.pathname })
  const { role, session } = useAuth()
  return (
    <header className="paper torn-sheet -mx-4 mb-6 px-4 pb-[54px] pt-3 text-ink min-[900px]:-mx-9 min-[900px]:px-9 min-[900px]:pt-[26px]">
      <div className="flex min-h-[34px] items-center gap-3.5 text-sm text-ink-soft">
        <nav aria-label="Breadcrumb" className="hidden items-center gap-2 sm:flex">
          <span>{navGroupOf(path)}</span><span aria-hidden>/</span><span className="font-semibold text-ink">{eyebrow}</span>
        </nav>
        <span className="flex-1" />
        {status && (
          <span className="inline-flex h-[34px] items-center gap-2 rounded-full border-[1.5px] border-ink px-3 text-[13px] font-semibold text-ink">
            <span className="size-2 rounded-full bg-ink" />{status}
          </span>
        )}
        {session && (
          <span title={`Signed in as ${session.user.email ?? ""} (${role ?? "viewer"})`}
            className="hidden size-[34px] place-items-center rounded-full bg-ink font-display text-[15px] font-extrabold text-paper sm:grid">
            {(role ?? "v").charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-4 min-[900px]:mt-[22px]">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }} className="min-w-0">
          <h1 className="font-display text-[clamp(2.4rem,5vw,4.4rem)] font-extrabold uppercase leading-[0.86] tracking-[-0.005em]">{title}</h1>
          {children && <p className="mt-2.5 max-w-[62ch] text-base leading-relaxed text-ink-soft [&_.text-foreground]:font-semibold [&_.text-foreground]:text-ink">{children}</p>}
        </motion.div>
        {actions && <div className="flex flex-wrap items-center gap-2.5 min-[900px]:ml-auto">{actions}</div>}
      </div>
    </header>
  )
}

/** Entity (SPV / building) scope shared by every page; the tour can drive it. */
export function useEntityScope() {
  const { data: entities } = useEntities()
  const [entityId, setEntityId] = useState("all")
  const names = useMemo(() => new Map((entities ?? []).map((e) => [e.id, e.name])), [entities])
  useTourControl("entity", (v) => setEntityId(v === "@first" ? ([...names.keys()][0] ?? "all") : v))
  const include = useMemo(() => (id: string) => entityId === "all" || id === entityId, [entityId])
  return { entityId, setEntityId, names, include }
}

export function FilterLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
      {label}
      {children}
    </label>
  )
}

/** Company (SPV / building) filter. `sheet` = the ink-on-lime variant that sits
 *  in the page header; otherwise a labelled control in a filter row. */
export function EntitySelect({ value, onChange, names, sheet }: { value: string; onChange: (v: string) => void; names: Map<string, string>; sheet?: boolean }) {
  if (names.size < 2) return null
  const options = [{ value: "all", label: `All companies (${names.size})` }, ...[...names.entries()].map(([id, name]) => ({ value: id, label: name.replace(/ s\.r\.o\.$/, "") }))]
  if (sheet) return (
    <SimpleSelect aria-label="Company" value={value} onValueChange={onChange} options={options} size="default"
      className="h-[42px] min-w-[13rem] rounded-md border-[1.5px] border-ink bg-transparent px-3.5 font-sans text-sm font-semibold text-ink hover:border-ink hover:bg-ink/5 [&_svg]:opacity-90" />
  )
  return (
    <FilterLabel label="Company">
      <SimpleSelect aria-label="Company filter" value={value} onValueChange={onChange} options={options} />
    </FilterLabel>
  )
}

/** Segmented control (AR/AP, scenario, view mode). */
export function Segmented<T extends string>({ options, value, onChange, tour }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; tour?: string
}) {
  return (
    <div data-tour={tour} role="group" className="inline-flex gap-[3px] rounded-lg border border-border bg-card p-[3px]">
      {options.map((o) => (
        <button key={o.value} data-tour={tour ? `${tour}-${o.value}` : undefined} aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          className={cn("rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors",
            value === o.value ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** KPI tile: label, big number (counts up), sparkline beside it, then a delta
 *  chip and one line of meaning. */
export function KpiTile({ label, value, format, hint, delta, goodUp = true, spark, color, tone, i = 0 }: {
  label: string; value: number; format: (n: number) => string; hint?: string
  delta?: number | null; goodUp?: boolean; spark?: number[]; color?: string; tone?: "good" | "bad"; i?: number
}) {
  const hasSpark = !!spark && spark.length > 1
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: i * 0.05, ease: "easeOut" }}
      data-live={`${label} ${format(value)}`}
      className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-0.5 rounded-xl border border-border bg-card px-4 pb-3.5 pt-4 sm:px-[18px]">
      <span className="col-span-2 text-[13.5px] text-muted-foreground">{label}</span>
      <div className={cn("min-w-0 font-display text-[clamp(1.5rem,2.4vw,2.25rem)] font-bold leading-[1.1] tabular-nums",
        tone === "good" && "text-signal", tone === "bad" && "text-destructive")}>
        <CountUp value={value} format={format} delay={i * 0.05} />
      </div>
      {hasSpark ? <div className="h-8 w-[84px] self-end max-sm:hidden"><Sparkline data={spark} color={color} /></div> : <span />}
      {(delta != null || hint) && (
        <div className="col-span-2 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] leading-snug text-muted-foreground">
          {delta != null && <DeltaChip delta={delta} goodUp={goodUp} />}
          {hint && <span>{hint}</span>}
        </div>
      )}
    </motion.div>
  )
}

function DeltaChip({ delta, goodUp }: { delta: number; goodUp: boolean }) {
  if (Math.abs(delta) < 0.05) return <span className="whitespace-nowrap rounded bg-white/5 px-1.5 py-0.5 font-mono text-[11.5px] tabular-nums">0.0%</span>
  const up = delta >= 0
  const good = goodUp ? up : !up
  return (
    <span className={cn("whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[11.5px] font-medium tabular-nums",
      good ? "bg-signal/[0.13] text-signal" : "bg-destructive/[0.13] text-destructive")}>
      {up ? "+" : "−"}{Math.abs(delta).toFixed(1)}%
    </span>
  )
}

/** Health ratio with its target: value, verdict, a meter with the limit marked. */
export function RatioTile({ label, value, hint, good, verdict, fill, mark }: {
  label: string; value: string; hint: string; good: boolean; verdict?: string
  /** 0–1: how far the meter is filled. */
  fill?: number
  /** 0–1: where the target / covenant tick sits. */
  mark?: number
}) {
  return (
    <div data-live={`${label} ${value}`} className="flex min-w-0 flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3.5 sm:px-[18px]">
      <div className="flex items-center gap-2 text-[13.5px] text-muted-foreground">
        <span className="min-w-0 truncate">{label}</span>
        <span className={cn("ml-auto whitespace-nowrap font-mono text-[11px]", good ? "text-signal" : "text-gold")}>{verdict ?? (good ? "healthy" : "watch")}</span>
      </div>
      <div className="font-display text-[26px] font-bold leading-[1.1] tabular-nums">{value}</div>
      <div className="text-[12.5px] leading-snug text-cold">{hint}</div>
      {fill != null && (
        <div className="relative mt-1.5 h-1 rounded-sm bg-border">
          <i className={cn("absolute inset-y-0 left-0 rounded-sm", good ? "bg-signal" : "bg-gold")} style={{ width: `${Math.max(0, Math.min(1, fill)) * 100}%` }} />
          {mark != null && <b className="absolute -top-1 h-3 w-0.5 bg-foreground/60" style={{ left: `${Math.max(0, Math.min(1, mark)) * 100}%` }} />}
        </div>
      )}
    </div>
  )
}

/** A reconciliation proof: two numbers that must agree, and whether they do. */
export function TieOut({ tour, label, left, right, leftLabel, rightLabel }: {
  tour?: string; label: string; left: number; right: number; leftLabel: string; rightLabel: string
}) {
  const ok = Math.abs(left - right) < 0.5
  return (
    <div data-tour={tour} data-live={`${label}: ${ok ? "reconciled" : "difference " + money(left - right)}`}
      className={cn("flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border px-4 py-3",
        ok ? "border-line-hi bg-secondary" : "border-destructive/40 bg-destructive/[0.08]")}>
      <span className="flex items-center gap-2 text-sm font-semibold">
        {ok ? <CheckCircle2 className="size-[18px] text-signal" /> : <AlertTriangle className="size-[18px] text-destructive" />}
        <span className="text-foreground">{label}</span>
      </span>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {leftLabel} <span className="text-foreground">{money(left)}</span>
        <span className="mx-2 text-muted-foreground/60">{ok ? "=" : "≠"}</span>
        {rightLabel} <span className="text-foreground">{money(right)}</span>
      </span>
      <span className={cn("font-mono text-[11px]", ok ? "text-signal" : "text-destructive")}>
        {ok ? "reconciled" : `difference ${money(left - right)}`}
      </span>
    </div>
  )
}

/** Small status badge: a dot and a word, coloured by meaning. */
export function Chip({ tone, children }: { tone: "good" | "warn" | "bad" | "muted"; children: ReactNode }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold",
      "before:size-1.5 before:shrink-0 before:rounded-full before:bg-current",
      tone === "good" && "bg-signal/[0.13] text-signal",
      tone === "warn" && "bg-gold/[0.13] text-gold",
      tone === "bad" && "bg-destructive/[0.13] text-destructive",
      tone === "muted" && "bg-white/[0.05] text-muted-foreground")}>
      {children}
    </span>
  )
}

/** Card shell for tables. */
export function TableCard({ tour, title, hint, children, className }: { tour?: string; title: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div data-tour={tour} className={cn("min-w-0 overflow-hidden rounded-xl border border-border bg-card", className)}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 pb-3 pt-4 sm:px-[18px]">
        <h3 className="font-display text-[19px] font-bold uppercase leading-tight tracking-[0.01em]">{title}</h3>
        {hint && <span className="text-[13px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  )
}
