import { useMemo, useState, type ReactNode } from "react"
import { motion } from "motion/react"
import { CheckCircle2, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { useEntities } from "@/lib/data/useEntities"
import { SimpleSelect } from "@/components/ui/select"
import { Sparkline } from "@/components/charts/FinancialCharts"
import { CountUp } from "@/components/CountUp"
import { useTourControl } from "@/lib/tourBus"

/** Shared building blocks of the reporting pages — one look, one vocabulary. */

export const eur = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })
/** Accounting format — negatives in parentheses, never "-€0". */
export const money = (n: number) => (Math.round(n) === 0 ? eur.format(0) : n < 0 ? `(${eur.format(Math.abs(n))})` : eur.format(n))
export const num = new Intl.NumberFormat("en-IE", { maximumFractionDigits: 0 })
export const pct = (n: number, d = 1) => `${(Math.round(n * 10 ** d) / 10 ** d || 0).toFixed(d)}%`

export function PageIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <motion.header initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: "easeOut" }} className="pb-8">
      <span className="font-mono text-xs font-semibold uppercase tracking-widest text-accent">{eyebrow}</span>
      <h1 className="mt-3 text-5xl font-semibold tracking-tight md:text-6xl">{title}</h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">{children}</p>
    </motion.header>
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
    <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
      {label}
      {children}
    </label>
  )
}

export function EntitySelect({ value, onChange, names }: { value: string; onChange: (v: string) => void; names: Map<string, string> }) {
  if (names.size < 2) return null
  return (
    <FilterLabel label="Property">
      <SimpleSelect aria-label="Property filter" value={value} onValueChange={onChange}
        options={[{ value: "all", label: `All (${names.size})` }, ...[...names.entries()].map(([id, name]) => ({ value: id, label: name.replace(/ s\.r\.o\.$/, "") }))]} />
    </FilterLabel>
  )
}

/** Segmented control (AR/AP, scenario, view mode). */
export function Segmented<T extends string>({ options, value, onChange, tour }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; tour?: string
}) {
  return (
    <div data-tour={tour} className="inline-flex overflow-hidden rounded-lg border border-border">
      {options.map((o) => (
        <button key={o.value} data-tour={tour ? `${tour}-${o.value}` : undefined} onClick={() => onChange(o.value)}
          className={cn("px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors",
            value === o.value ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** KPI tile: label, big number (counts up), optional delta chip + sparkline + one-line meaning. */
export function KpiTile({ label, value, format, hint, delta, goodUp = true, spark, color, tone, i = 0 }: {
  label: string; value: number; format: (n: number) => string; hint?: string
  delta?: number | null; goodUp?: boolean; spark?: number[]; color?: string; tone?: "good" | "bad"; i?: number
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: i * 0.05, ease: "easeOut" }}
      data-live={`${label} ${format(value)}`}
      className="rounded-2xl bg-card p-5 shadow-soft ring-1 ring-border">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
        {delta != null && <DeltaChip delta={delta} goodUp={goodUp} />}
      </div>
      <div className={cn("mt-2 text-2xl font-semibold tabular-nums lg:text-[1.7rem]",
        tone === "good" && "text-accent", tone === "bad" && "text-destructive")}>
        <CountUp value={value} format={format} delay={i * 0.05} />
      </div>
      {spark && spark.length > 1 && <div className="mt-1.5 h-9"><Sparkline data={spark} color={color} /></div>}
      {hint && <div className="mt-1 font-mono text-[10px] leading-snug text-muted-foreground/80">{hint}</div>}
    </motion.div>
  )
}

function DeltaChip({ delta, goodUp }: { delta: number; goodUp: boolean }) {
  if (Math.abs(delta) < 0.05) return <span className="font-mono text-[10px] tabular-nums text-muted-foreground">— 0.0%</span>
  const up = delta >= 0
  const good = goodUp ? up : !up
  return (
    <span className={cn("font-mono text-[10px] tabular-nums", good ? "text-accent" : "text-destructive")}>
      {up ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
    </span>
  )
}

/** A reconciliation proof: two numbers that must agree, and whether they do. */
export function TieOut({ tour, label, left, right, leftLabel, rightLabel }: {
  tour?: string; label: string; left: number; right: number; leftLabel: string; rightLabel: string
}) {
  const ok = Math.abs(left - right) < 0.5
  return (
    <div data-tour={tour} data-live={`${label}: ${ok ? "reconciled" : "difference " + money(left - right)}`}
      className={cn("flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl px-5 py-3.5 ring-1",
        ok ? "bg-accent/[0.06] ring-accent/25" : "bg-destructive/5 ring-destructive/30")}>
      <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest">
        {ok ? <CheckCircle2 className="size-4 text-accent" /> : <AlertTriangle className="size-4 text-destructive" />}
        <span className={ok ? "text-accent" : "text-destructive"}>{label}</span>
      </span>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {leftLabel} <span className="text-foreground">{money(left)}</span>
        <span className="mx-2 text-muted-foreground/60">{ok ? "=" : "≠"}</span>
        {rightLabel} <span className="text-foreground">{money(right)}</span>
      </span>
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
        {ok ? "reconciled" : `difference ${money(left - right)}`}
      </span>
    </div>
  )
}

/** Small status chip. */
export function Chip({ tone, children }: { tone: "good" | "warn" | "bad" | "muted"; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ring-1",
      tone === "good" && "bg-accent/10 text-accent ring-accent/25",
      tone === "warn" && "bg-[#d6b53f]/10 text-[#e3c35a] ring-[#d6b53f]/30",
      tone === "bad" && "bg-destructive/10 text-destructive ring-destructive/30",
      tone === "muted" && "bg-white/[0.04] text-muted-foreground ring-border")}>
      {children}
    </span>
  )
}

/** Card shell for tables. */
export function TableCard({ tour, title, hint, children, className }: { tour?: string; title: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div data-tour={tour} className={cn("overflow-hidden rounded-[1.5rem] bg-card shadow-soft ring-1 ring-border", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-5 py-3.5">
        <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{title}</h3>
        {hint && <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">{hint}</span>}
      </div>
      {children}
    </div>
  )
}
