import { motion } from "motion/react"
import { Link } from "@tanstack/react-router"
import { AUTHOR, EVIDENCE, contactLinks, repoUrl } from "@/lib/author"

const STACK = ["React 19", "TypeScript", "Vite", "Tailwind v4", "TanStack", "recharts", "Supabase", "Postgres", "Edge / Deno", "Docker", "pg_cron", "pg_net", "RLS"]

// Real demo figures (same provenance as the landing — the Journal page's totals).
const FIGURES: [string, string][] = [
  ["€120.0M", "posted · debit side"],
  ["4,708", "documents · all balanced"],
  ["4", "companies · RLS-scoped"],
  ["24", "monthly periods"],
]

const LAYERS = [
  ["Browser", "React 19 reaches Postgres through one instrumented fetch — the seam the X-ray panel taps."],
  ["Edge / Deno", "Validated ingest and review notifications run as Deno edge functions."],
  ["Postgres", "Row-level security, trigger chains, scheduled refresh and HTTP callbacks live in the database."],
  ["Docker worker", "A containerised Deno service drains the ingest queue with atomic, skip-locked claims — in the local stack (docker compose); the hosted demo parses CSV in the browser."],
]

export function About() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20 md:py-28">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }}>
        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-accent">About</span>
        <h1 className="poster mt-3 text-[clamp(2rem,7.5vw,4.6rem)] leading-[0.88] text-foreground">
          A real backend, made visible.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          X-Ray is a financial reporting engine built backend-first: messy spreadsheets in,
          validated and anomaly-screened reports out — with row-level security, a real ETL
          pipeline, scheduled jobs, and a live X-ray of every layer. This site is the demo:
          explore it read-only, or create an account and land in a sample workspace.
        </p>
      </motion.div>

      <div className="mt-10 flex flex-wrap gap-2">
        {STACK.map((s, i) => (
          <motion.span key={s}
            initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.3, delay: i * 0.03 }}
            className="rounded-full border border-border px-3 py-1.5 font-mono text-xs text-foreground/75">
            {s}
          </motion.span>
        ))}
      </div>

      <div className="mt-12 grid grid-cols-2 gap-px border-t border-border pt-10 md:grid-cols-4">
        {FIGURES.map(([n, l]) => (
          <div key={l} className="py-2 pr-4">
            <div className="display text-4xl text-foreground md:text-5xl">{n}</div>
            <div className="mt-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{l}</div>
          </div>
        ))}
      </div>

      <div className="mt-14">
        <h2 className="poster text-[clamp(1.4rem,4vw,2.2rem)] text-foreground">Four layers, each doing real work.</h2>
        <div className="mt-6 space-y-3">
          {LAYERS.map(([layer, detail], i) => (
            <motion.div key={layer}
              initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="flex flex-col gap-2 rounded-2xl border border-border p-5 md:flex-row md:items-center md:gap-6">
              <span className="flex items-center gap-3 md:w-52 md:shrink-0">
                <span className="font-mono text-sm text-foreground/55">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-lg font-semibold">{layer}</span>
              </span>
              <p className="flex-1 text-sm leading-relaxed text-muted-foreground">{detail}</p>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="mt-16 border-t border-border pt-12">
        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-accent">Who built it</span>
        <h2 className="poster mt-3 text-[clamp(1.6rem,5vw,2.8rem)] leading-[0.92] text-foreground">{AUTHOR.name}</h2>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          Built end to end as a portfolio project: the data model and its security, the ETL and the
          anomaly screen, the scheduled jobs, the edge functions, the React app and the X-ray that shows
          them working. Each claim below links to the code behind it.
        </p>
        <dl className="mt-8 divide-y divide-border border-y border-border">
          {EVIDENCE.map((e) => (
            <div key={e.area} className="grid gap-2 py-5 md:grid-cols-[12rem_1fr] md:gap-6">
              <dt className="font-display text-lg font-extrabold uppercase leading-tight">{e.area}</dt>
              <dd>
                <p className="text-sm leading-relaxed text-muted-foreground">{e.claim}</p>
                <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
                  {e.where.map((w) => (
                    <a key={w.path} href={repoUrl(w.path)} target="_blank" rel="noreferrer" className="font-semibold text-foreground underline-offset-4 hover:underline">{w.label} ↗</a>
                  ))}
                </p>
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-8 flex flex-wrap gap-3">
          {contactLinks().map((c) => (
            <a key={c.href} href={c.href} {...(c.external ? { target: "_blank", rel: "noreferrer" } : {})}
              className="rounded-md bg-primary px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-primary-foreground transition hover:brightness-125">
              {c.label}
            </a>
          ))}
          <Link to="/" className="rounded-md border-[1.5px] border-foreground px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-foreground transition hover:bg-foreground/10">
            Back to the demo
          </Link>
        </div>
      </div>
    </section>
  )
}
