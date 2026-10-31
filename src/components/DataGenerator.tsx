import { useMemo, useState } from "react"
import { Dice5, Download } from "lucide-react"

/**
 * Client-side demo-data generator. Produces a realistic month of a building's
 * books in the exact CSV shape the ingest pipeline expects
 * (account_code,txn_date,debit,credit,currency,description) — rent billed to
 * tenants, the month's running costs, and their receivable/payable sides, so
 * the batch balances — with ONE planted anomaly (a utilities bill ~8× normal)
 * for the z-score screen to catch. Everything happens in the browser: no DB
 * write, nothing saved. It's the "try it with data like yours" hook.
 */
const LINES: { code: string; name: string; side: "debit" | "credit"; base: number }[] = [
  { code: "4000", name: "Rental income", side: "credit", base: 124000 },
  { code: "4100", name: "Service charge income", side: "credit", base: 30000 },
  { code: "5000", name: "Utilities", side: "debit", base: 15000 },
  { code: "5100", name: "Repairs & maintenance", side: "debit", base: 6500 },
  { code: "5200", name: "Property management", side: "debit", base: 4700 },
  { code: "5600", name: "Cleaning & security", side: "debit", base: 9600 },
]
const SPIKE = "5000" // Utilities

function jitter(base: number): number {
  // ±8% noise, rounded to whole euros.
  return Math.round(base * (0.92 + Math.random() * 0.16))
}

function buildCsv(): { csv: string; rows: number; anomaly: string } {
  // The current month: the books are closed to last month, so this is "new".
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const lastDay = Math.max(2, Math.min(25, now.getDate()))
  const day = () => String(1 + Math.floor(Math.random() * lastDay)).padStart(2, "0")
  const lines = ["account_code,txn_date,debit,credit,currency,description"]
  let billed = 0, costs = 0
  for (const a of LINES) {
    let amount = jitter(a.base)
    let desc = a.name
    if (a.code === SPIKE) { amount *= 8; desc = `${a.name} (billing error?)` }
    if (a.side === "credit") billed += amount; else costs += amount
    lines.push(`${a.code},${year}-${month}-${day()},${a.side === "debit" ? amount : 0},${a.side === "credit" ? amount : 0},EUR,${desc}`)
  }
  // The other side of each entry, so the batch balances (debits = credits).
  lines.push(`1100,${year}-${month}-01,${billed},0,EUR,Rent invoices to tenants`)
  lines.push(`2000,${year}-${month}-${day()},0,${costs},EUR,Supplier invoices`)
  return { csv: lines.join("\n") + "\n", rows: lines.length - 1, anomaly: `${year}-${month} · Utilities ~8× the usual bill — the z-score screen flags it` }
}

/** `compact` (inside the tour card): no CSV preview, one-line intro. */
export function DataGenerator({ compact = false }: { compact?: boolean } = {}) {
  const [gen, setGen] = useState(() => buildCsv())
  const preview = useMemo(() => gen.csv.split("\n").slice(0, 5).join("\n"), [gen])

  function download() {
    const blob = new Blob([gen.csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "my-demo-books.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <div className="flex items-center gap-2">
        <Dice5 className="size-4 text-accent" />
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Generate data like yours
        </span>
      </div>
      {compact ? (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">A month of a building’s books in the exact upload format, balanced, with one planted anomaly.</p>
      ) : (
        <>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            A month of a building’s books in the exact format the pipeline reads —
            balanced, with one planted anomaly. Download it, then upload it as a real account to watch it get
            validated, flagged and loaded.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-background p-3 font-mono text-[10px] leading-relaxed text-foreground/75">{preview}
…</pre>
        </>
      )}
      <p className="mt-1.5 font-mono text-[10px] text-accent">⚠ {gen.anomaly}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={download}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-accent-foreground transition hover:brightness-110">
          <Download className="size-3.5" /> Download CSV
        </button>
        <button onClick={() => setGen(buildCsv())}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-foreground transition hover:border-accent">
          <Dice5 className="size-3.5" /> Regenerate
        </button>
      </div>
    </div>
  )
}
