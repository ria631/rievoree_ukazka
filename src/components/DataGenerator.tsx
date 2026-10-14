import { useMemo, useState } from "react"
import { Dice5, Download } from "lucide-react"

/**
 * Client-side demo-data generator. Produces a realistic month of double-entry
 * accounting rows in the exact CSV shape the ingest pipeline expects
 * (account_code,txn_date,debit,credit,currency,description) — including ONE
 * planted anomaly (a utilities spike) so, once uploaded, the z-score screen has
 * something to catch. Everything happens in the browser: no DB write, nothing
 * saved. It's the "try it with data like yours" hook that leads into sign-up.
 */
const ACCOUNTS: { code: string; name: string; side: "debit" | "credit"; base: number }[] = [
  { code: "4000", name: "Product sales", side: "credit", base: 42000 },
  { code: "4100", name: "Service revenue", side: "credit", base: 16000 },
  { code: "5000", name: "Cost of goods sold", side: "debit", base: 23000 },
  { code: "6000", name: "Salaries", side: "debit", base: 18000 },
  { code: "6100", name: "Rent", side: "debit", base: 4200 },
  { code: "6200", name: "Utilities", side: "debit", base: 1600 },
  { code: "6300", name: "Marketing", side: "debit", base: 3800 },
]

const MONTHS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]

function jitter(base: number): number {
  // ±12% noise, rounded to whole euros.
  return Math.round(base * (0.88 + Math.random() * 0.24))
}

function buildCsv(): { csv: string; rows: number; anomaly: string } {
  const year = 2026
  const month = MONTHS[Math.floor(Math.random() * 8)] // Jan–Aug, keeps it plausible
  const lines = ["account_code,txn_date,debit,credit,currency,description"]
  // Pick one expense account to spike ~10× — the planted anomaly.
  const spikeIdx = 5 // Utilities
  ACCOUNTS.forEach((a, i) => {
    const day = String(2 + Math.floor(Math.random() * 25)).padStart(2, "0")
    const date = `${year}-${month}-${day}`
    let amount = jitter(a.base)
    let desc = a.name
    if (i === spikeIdx) { amount = amount * 10; desc = `${a.name} (billing error?)` }
    const debit = a.side === "debit" ? amount : 0
    const credit = a.side === "credit" ? amount : 0
    lines.push(`${a.code},${date},${debit},${credit},EUR,${desc}`)
  })
  // A couple of extra cash movements for texture.
  for (let k = 0; k < 2; k++) {
    const day = String(5 + k * 10).padStart(2, "0")
    lines.push(`1000,${year}-${month}-${day},${jitter(9000)},0,EUR,Customer payment`)
  }
  return { csv: lines.join("\n") + "\n", rows: lines.length - 1, anomaly: `${year}-${month} · Utilities ~10× its usual — the z-score screen flags it` }
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
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">A month of books in the exact upload format, with one planted anomaly.</p>
      ) : (
        <>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            A month of books in the exact format the pipeline reads — with one planted
            anomaly. Download it, then upload it as a real account to watch it get
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
