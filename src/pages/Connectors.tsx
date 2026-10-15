import { useMemo, useState } from "react"
import { motion } from "motion/react"
import { Link } from "@tanstack/react-router"
import {
  Cable, FileSpreadsheet, Webhook, Plus, RefreshCw, Play, Pause, Trash2, Pencil, Check, X,
  Copy, KeyRound, Link2, AlertTriangle, Download, ExternalLink, Lock, ArrowRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { SimpleSelect } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { LoadingNote, ErrorNote, EmptyNote } from "@/components/StateNote"
import { useAuth } from "@/lib/auth/useAuth"
import { useEntities } from "@/lib/data/useEntities"
import {
  useConnectors, useCreateConnector, useRenameConnector, useDeleteConnector,
  useSetConnectorStatus, useRotateSecret, useSheetSync, webhookUrl, SAMPLE_SHEET_URL,
  type Connector, type ConnectorKind, type SheetSyncResult,
} from "@/lib/data/useConnectors"

function canManage(role: string | null) {
  return role === "manager" || role === "admin" || role === "super_admin"
}

const STATUS_TONE: Record<string, string> = {
  active: "bg-signal text-signal-foreground",
  pending_auth: "bg-cold/15 text-cold ring-1 ring-cold/30",
  paused: "bg-secondary text-muted-foreground ring-1 ring-border",
  error: "bg-destructive text-destructive-foreground",
}
const STATUS_LABEL: Record<string, string> = {
  active: "Active", pending_auth: "Needs connect", paused: "Paused", error: "Error",
}
const KIND_LABEL: Record<ConnectorKind, string> = {
  url: "Spreadsheet link", webhook: "HMAC webhook", gdrive: "Google Drive (retired)",
}

const isShowcase = (c: Connector) => c.config?.showcase === "true"

export function Connectors() {
  const { role, isDemo } = useAuth()
  const { data: entities } = useEntities()
  const connectors = useConnectors()
  const names = useMemo(() => new Map((entities ?? []).map((e) => [e.id, e.name])), [entities])
  // The shared showcase sheet first — it's the one a visitor can sync.
  const list = useMemo(
    () => [...(connectors.data ?? [])].sort((a, b) => Number(isShowcase(b)) - Number(isShowcase(a))),
    [connectors.data],
  )

  return (
    <div className="relative">
      <motion.header
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: "easeOut" }}
        className="pb-10">
        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-accent">Connectors</span>
        <h1 className="mt-3 text-5xl font-semibold tracking-tight md:text-6xl lg:text-7xl">Auto-ingest</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          Point the pipeline at a spreadsheet — a Google Sheet, or any public CSV link — and
          the database reads it every hour. Or expose an HMAC-signed webhook. New rows flow
          through the same validate → z-score → review path as a manual upload.
        </p>
      </motion.header>

      {!canManage(role) ? (
        <div className="rounded-2xl bg-card px-6 py-6 font-mono text-xs leading-relaxed text-muted-foreground shadow-soft ring-1 ring-border">
          Your role is read-only — connectors are managed by managers and admins.
          The server enforces this regardless of the UI.
        </div>
      ) : (
        <CreateConnector entities={entities ?? []} readOnly={isDemo} />
      )}

      <section className="mt-12">
        <h2 className="mb-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {isDemo ? "Connectors" : "Your connectors"} <span className="text-accent">· live</span>
        </h2>
        {connectors.isLoading ? (
          <LoadingNote label="loading connectors…" />
        ) : connectors.error ? (
          <ErrorNote message={connectors.error.message} />
        ) : list.length === 0 ? (
          <EmptyNote title="No connectors yet"
            hint={canManage(role) ? "Add one above — “Use the sample sheet” gets you a working link in one click." : "Your role doesn't manage connectors."} />
        ) : (
          <div className="grid gap-4">
            {list.map((c, i) => (
              <ConnectorCard key={c.id} connector={c} entityName={names.get(c.entity_id)}
                readOnly={isDemo} showcase={i === 0 && isShowcase(c)} />
            ))}
          </div>
        )}
      </section>

      <HowItWorks />
    </div>
  )
}

/** For visitors: how to hook up a real Google Sheet, and how it's built. */
function HowItWorks() {
  return (
    <section data-tour="connectors-how" className="mt-16 grid gap-4 lg:grid-cols-2">
      <div className="rounded-[1.5rem] border border-accent/20 bg-accent/[0.05] p-6 md:p-7">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="size-4 text-accent" />
          <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Connect your own Google Sheet</h3>
        </div>
        <ol className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
          {[
            <>In Google Sheets: <span className="text-foreground">Share → General access → Anyone with the link</span> (Viewer).</>,
            <>Copy the link and paste it above. The app turns it into the sheet's CSV export — or use
              <span className="text-foreground"> File → Share → Publish to web → CSV</span>. Dropbox, OneDrive and any
              public <code className="rounded bg-secondary px-1 text-foreground">https://…csv</code> work too.</>,
            <>First row is the header: <span className="text-foreground">Account, Date, Debit, Credit</span> (+ Description,
              Currency). Slovak works too — Účet, Dátum, MD, Dal; <code className="rounded bg-secondary px-1 text-foreground">;</code> separators,
              decimal commas and 02.10.2026 dates are fine.</>,
            <><span className="text-foreground">Sync now</span> — or just leave it: the database re-reads the link every hour,
              and a sheet that hasn't changed is skipped.</>,
          ].map((t, i) => (
            <li key={i} className="flex gap-3">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent/15 font-mono text-[10px] font-bold text-accent">{i + 1}</span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
        <a href="/samples/facility-costs-sheet.csv" download
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-background/60 px-3 py-2 font-mono text-[11px] text-foreground ring-1 ring-border transition hover:ring-accent/40">
          <Download className="size-3.5 text-accent" /> Sample sheet (CSV) — import it into Google Sheets to start
        </a>
      </div>

      <div className="rounded-[1.5rem] bg-card p-6 shadow-soft ring-1 ring-border md:p-7">
        <div className="flex items-center gap-2">
          <Cable className="size-4 text-accent" />
          <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">How this is built</h3>
        </div>
        <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-muted-foreground">
          {[
            ["The database fetches it", "pg_net makes the HTTP request from Postgres itself — no edge function, no API keys, nothing to approve."],
            ["CSV parsed in SQL", "header names in English or Slovak, comma or semicolon separators, quoted fields, decimal commas, three date styles; formula cells are defused."],
            ["Same pipeline", "staging → transform (rules + account resolution) → z-score anomaly scan → awaiting review."],
            ["Hourly + idempotent", "pg_cron re-reads each link hourly; content already taken in (same SHA-256) is never imported twice."],
            ["Safe by default", "public https hosts only, every redirect re-checked, 2 MB / 5,000-row cap; the shared demo only previews."],
            ["HMAC webhook", "for systems that push: a constant-time signature check, then the same path."],
          ].map(([t, d]) => (
            <li key={t} className="flex gap-2.5">
              <Check className="mt-0.5 size-3.5 shrink-0 text-accent" />
              <span><span className="text-foreground">{t}</span> — {d}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50"

function CreateConnector({ entities, readOnly }: { entities: { id: string; name: string }[]; readOnly: boolean }) {
  const create = useCreateConnector()
  const [entityId, setEntityId] = useState("")
  const [kind, setKind] = useState<ConnectorKind>("url")
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [created, setCreated] = useState<{ id: string; kind: ConnectorKind; secret: string | null } | null>(null)

  const ready = !!entityId && !!name.trim() && (kind !== "url" || /^https:\/\/\S+$/.test(url.trim()))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || readOnly) return
    create.mutate(
      { entityId, kind, name: name.trim(), config: kind === "url" ? { url: url.trim() } : {} },
      {
        onSuccess: (r) => {
          setCreated({ id: r.id, kind: r.kind, secret: r.webhook_secret })
          setName(""); setUrl("")
        },
      },
    )
  }

  function fillSample() {
    setKind("url")
    setUrl(SAMPLE_SHEET_URL)
    if (!name.trim()) setName("Facility costs (sample sheet)")
    if (!entityId && entities.length === 1) setEntityId(entities[0].id)
  }

  return (
    <section data-tour="connectors-add" className="rounded-[1.5rem] bg-card p-6 shadow-soft ring-1 ring-border md:p-7">
      <div className="flex flex-wrap items-center gap-2">
        <Cable className="size-4 text-accent" />
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Add a connector</h2>
        {readOnly && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground ring-1 ring-border">
            <Lock className="size-3" /> shared demo · read-only
          </span>
        )}
      </div>

      <form onSubmit={submit} className="mt-5 grid gap-4 md:grid-cols-4 md:items-end">
        <div className="space-y-1.5">
          <Label className="font-mono text-[10px] uppercase tracking-widest">Entity</Label>
          <SimpleSelect size="default" className="w-full" aria-label="Entity" placeholder="select…"
            value={entityId} onValueChange={setEntityId}
            options={entities.map((e) => ({ value: e.id, label: e.name }))} />
        </div>
        <div className="space-y-1.5">
          <Label className="font-mono text-[10px] uppercase tracking-widest">Type</Label>
          <SimpleSelect size="default" className="w-full" aria-label="Connector type"
            value={kind} onValueChange={(v) => setKind(v as ConnectorKind)}
            options={[{ value: "url", label: "Spreadsheet link" }, { value: "webhook", label: "HMAC webhook" }]} />
        </div>
        <div className="space-y-1.5">
          <Label className="font-mono text-[10px] uppercase tracking-widest">Name</Label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Monthly costs sheet" className={cn(inputClass, "w-full")} />
        </div>
        {readOnly ? (
          <Link to="/register"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-accent px-4 font-mono text-xs font-semibold text-accent-foreground transition hover:brightness-110">
            Register to add <ArrowRight className="size-3.5" />
          </Link>
        ) : (
          <Button type="submit" className="font-mono" disabled={create.isPending || !ready}>
            <Plus className="size-4" /> {create.isPending ? "Adding…" : "Add"}
          </Button>
        )}

        {kind === "url" && (
          <div className="space-y-1.5 md:col-span-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Label className="font-mono text-[10px] uppercase tracking-widest">Link to the sheet</Label>
              <button type="button" onClick={fillSample}
                className="font-mono text-[10px] uppercase tracking-widest text-accent underline-offset-4 hover:underline">
                Use the sample sheet
              </button>
            </div>
            <input value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" spellCheck={false}
              placeholder="https://docs.google.com/spreadsheets/d/…  — or any public https link to a .csv"
              className={cn(inputClass, "w-full")} />
            <p className="font-mono text-[11px] text-muted-foreground">
              Google Sheet shared as “anyone with the link”, a sheet published to the web as CSV, Dropbox / OneDrive share link, or any public CSV.
            </p>
          </div>
        )}
      </form>

      {readOnly && (
        <p className="mt-4 text-sm text-muted-foreground">
          The shared demo can't add connectors — but you can press <span className="text-foreground">Sync now</span> on
          the shared spreadsheet below and watch the database fetch and read it live.
        </p>
      )}
      {create.isError && (
        <p role="alert" className="mt-3 font-mono text-xs text-destructive">{(create.error as Error).message}</p>
      )}

      {/* One-time secret reveal for a freshly created webhook connector. */}
      {created?.kind === "webhook" && created.secret && (
        <SecretReveal connectorId={created.id} secret={created.secret} onDone={() => setCreated(null)} />
      )}
      {created?.kind === "url" && (
        <p className="mt-4 rounded-xl bg-accent/[0.07] px-4 py-3 font-mono text-xs text-foreground ring-1 ring-accent/20">
          Link saved — press <span className="text-accent">Sync now</span> on it below for the first import. After that it re-syncs every hour.
        </p>
      )}
    </section>
  )
}

/** Shows a webhook secret exactly once (the server never returns it again). */
function SecretReveal({ connectorId, secret, onDone }: { connectorId: string; secret: string; onDone: () => void }) {
  const url = webhookUrl(connectorId)
  return (
    <div className="mt-4 rounded-xl border border-accent/30 bg-accent/[0.06] p-4">
      <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-accent">
        <KeyRound className="size-3.5" /> Signing secret — shown only once
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Store this now. Sign each request body with HMAC-SHA256 and send it as the <code className="rounded bg-secondary px-1">x-signature</code> header.
      </p>
      <CopyRow label="Secret" value={secret} mono />
      <CopyRow label="Endpoint" value={url} mono />
      <details className="mt-3">
        <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Example (curl)</summary>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-background p-3 font-mono text-[11px] leading-relaxed text-foreground/80">{curlExample(url, secret)}</pre>
      </details>
      <Button size="xs" variant="ghost" className="mt-3 font-mono text-[10px] uppercase tracking-wider" onClick={onDone}>Done</Button>
    </div>
  )
}

function curlExample(url: string, secret: string): string {
  return [
    `BODY='account_code,txn_date,debit,credit,currency`,
    `4000,2026-06-20,0,13000,EUR'`,
    `SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "${secret}" | awk '{print $2}')`,
    `curl -X POST "${url}" \\`,
    `  -H "content-type: text/csv" \\`,
    `  -H "x-signature: sha256=$SIG" \\`,
    `  --data-binary "$BODY"`,
  ].join("\n")
}

function ConnectorCard({ connector: c, entityName, readOnly, showcase }: {
  connector: Connector; entityName?: string; readOnly: boolean; showcase: boolean
}) {
  const rename = useRenameConnector()
  const remove = useDeleteConnector()
  const setStatus = useSetConnectorStatus()
  const rotate = useRotateSecret()
  const sync = useSheetSync()

  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(c.name)
  const [confirmDel, setConfirmDel] = useState(false)
  const [rotated, setRotated] = useState<string | null>(null)
  const [showWebhook, setShowWebhook] = useState(false)

  const Icon = c.kind === "webhook" ? Webhook : FileSpreadsheet
  const isUrl = c.kind === "url"
  const retired = c.kind === "gdrive"
  const link = typeof c.config?.url === "string" ? c.config.url : null
  const writable = !readOnly

  return (
    <div data-tour={showcase ? "connectors-showcase" : undefined}
      className="min-w-0 rounded-[1.25rem] bg-card p-5 shadow-soft ring-1 ring-border">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-foreground ring-1 ring-border">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-2">
              <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} className={cn(inputClass, "flex-1")} />
              <button onClick={() => { if (editName.trim()) rename.mutate({ id: c.id, name: editName.trim() }); setEditing(false) }}
                aria-label="Save" className="rounded-md p-1.5 text-accent hover:bg-accent/10"><Check className="size-4" /></button>
              <button onClick={() => setEditing(false)} aria-label="Cancel" className="rounded-md p-1.5 text-muted-foreground hover:bg-foreground/[0.05]"><X className="size-4" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold">{c.name}</span>
              {writable && !retired && (
                <button onClick={() => { setEditName(c.name); setEditing(true) }} aria-label="Rename"
                  className="rounded-md p-1 text-muted-foreground transition hover:bg-foreground/[0.05] hover:text-foreground"><Pencil className="size-3.5" /></button>
              )}
            </div>
          )}
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {KIND_LABEL[c.kind] ?? c.kind} · {entityName ?? c.entity_id.slice(0, 8)}
            {isUrl && c.status === "active" && !showcase && <> · syncs hourly</>}
            {c.last_sync_at && <> · last sync {new Date(c.last_sync_at).toLocaleString()}</>}
          </p>
        </div>
        <Badge className={cn("rounded-full font-mono text-[10px] uppercase tracking-wider", STATUS_TONE[c.status])}>
          {STATUS_LABEL[c.status] ?? c.status}
        </Badge>
      </div>

      {isUrl && link && (
        <div className="mt-3 flex min-w-0 items-center gap-2 rounded-lg bg-background/50 px-3 py-2 ring-1 ring-border">
          <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
          <a href={link} target="_blank" rel="noreferrer noopener"
            className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/80 hover:text-accent">{link}</a>
          <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
        </div>
      )}

      {c.last_error && (
        <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 font-mono text-[11px] text-destructive">{c.last_error}</p>
      )}

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {isUrl && c.status === "active" && (
          <Button size="xs" className="font-mono text-[10px]" disabled={sync.isPending}
            data-tour={showcase ? "connectors-sync" : undefined}
            onClick={() => sync.mutate(c.id)}>
            <RefreshCw className={cn("size-3.5", sync.isPending && "animate-spin")} /> {sync.isPending ? "Fetching…" : "Sync now"}
          </Button>
        )}
        {c.kind === "webhook" && (
          <Button size="xs" variant="secondary" className="font-mono text-[10px]" onClick={() => setShowWebhook((v) => !v)}>
            <Link2 className="size-3.5" /> {showWebhook ? "Hide endpoint" : "Show endpoint"}
          </Button>
        )}
        {writable && !retired && (c.status === "active" || c.status === "paused") && (
          <Button size="xs" variant="ghost" className="font-mono text-[10px]"
            disabled={setStatus.isPending}
            onClick={() => setStatus.mutate({ id: c.id, status: c.status === "active" ? "paused" : "active" })}>
            {c.status === "active" ? <><Pause className="size-3.5" /> Pause</> : <><Play className="size-3.5" /> Resume</>}
          </Button>
        )}
        {writable && c.kind === "webhook" && (
          <Button size="xs" variant="ghost" className="font-mono text-[10px]" disabled={rotate.isPending}
            onClick={() => rotate.mutate(c.id, { onSuccess: (s) => setRotated(s) })}>
            <KeyRound className="size-3.5" /> Rotate secret
          </Button>
        )}
        {writable && (confirmDel ? (
          <button onClick={() => { remove.mutate(c.id); setConfirmDel(false) }}
            className="ml-auto rounded-md bg-destructive/15 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-destructive">
            Confirm delete
          </button>
        ) : (
          <button onClick={() => setConfirmDel(true)} aria-label="Delete connector"
            className="ml-auto rounded-md p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" /></button>
        ))}
      </div>

      {isUrl && (sync.isPending || sync.data || sync.isError) && (
        <SyncResult pending={sync.isPending} result={sync.data ?? null}
          error={sync.isError ? (sync.error as Error).message : null} />
      )}

      {showWebhook && c.kind === "webhook" && (
        <div className="mt-3 rounded-xl border border-border bg-background/40 p-4">
          <CopyRow label="Endpoint" value={webhookUrl(c.id)} mono />
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">
            POST a CSV body signed with HMAC-SHA256 (header <code className="rounded bg-secondary px-1">x-signature: sha256=…</code>).
            The signing secret is shown only when created or rotated.
          </p>
        </div>
      )}
      {rotated && (
        <div className="mt-3 rounded-xl border border-accent/30 bg-accent/[0.06] p-4">
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-accent">
            <KeyRound className="size-3.5" /> New secret — shown only once
          </p>
          <CopyRow label="Secret" value={rotated} mono />
          <Button size="xs" variant="ghost" className="mt-2 font-mono text-[10px]" onClick={() => setRotated(null)}>Done</Button>
        </div>
      )}
    </div>
  )
}

const money = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = (v: string | number | null | undefined) => (v == null || v === "" || Number(v) === 0 ? "" : money.format(Number(v)))

/** Fetch → parse → ingest, lit as it happens, then what the sheet contained. */
function SyncResult({ pending, result, error }: { pending: boolean; result: SheetSyncResult | null; error: string | null }) {
  const failed = !!error || result?.status === "error"
  const done = !pending && !failed
  const stages = [
    { label: "Database fetches the link", on: true },
    { label: "CSV parsed in SQL", on: done },
    { label: result?.status === "preview" ? "Preview (demo: no write)" : "Validate → review", on: done },
  ]
  const balanced = result?.debit != null && result.credit != null && Math.abs(result.debit - result.credit) < 0.005

  return (
    <div className="mt-4 rounded-xl border border-border bg-background/40 p-4">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5 font-mono text-[10px] uppercase tracking-widest">
        {stages.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2">
            {i > 0 && <ArrowRight className="size-3 text-muted-foreground/60" />}
            <span className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-1 ring-1",
              failed && i === 0 ? "bg-destructive/10 text-destructive ring-destructive/30"
                : s.on ? "bg-accent/10 text-accent ring-accent/30"
                : "text-muted-foreground ring-border",
            )}>
              {pending && i === 0 ? <span className="size-1.5 animate-pulse rounded-full bg-accent" />
                : s.on && !failed ? <Check className="size-3" /> : null}
              {s.label}
            </span>
          </li>
        ))}
      </ol>

      {failed && (
        <p className="mt-3 flex items-start gap-2 font-mono text-[11px] text-destructive">
          <AlertTriangle className="mt-px size-3.5 shrink-0" /> {error ?? result?.message}
        </p>
      )}

      {done && result && (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            {result.status === "preview" && <>Read <span className="text-foreground">{result.rows} rows</span> for {result.period ?? "—"}. The shared demo stops here — on your own account this becomes a batch waiting for review.</>}
            {result.status === "created" && <>Imported <span className="text-foreground">{result.rows} rows</span> for {result.period ?? "—"} — the batch is waiting for review on <Link to="/ingest" className="text-accent underline-offset-4 hover:underline">Ingest</Link>.</>}
            {result.status === "duplicate" && <>This exact content was already imported for this company — nothing new.</>}
            {result.status === "unchanged" && <>No change since the last sync{result.message ? ` (${result.message})` : ""} — nothing imported twice.</>}
          </p>
          {result.rows != null && (
            <div className="mt-3 flex flex-wrap gap-2 font-mono text-[11px]">
              <span className="rounded-md bg-secondary px-2 py-1">debit {money.format(result.debit ?? 0)}</span>
              <span className="rounded-md bg-secondary px-2 py-1">credit {money.format(result.credit ?? 0)}</span>
              <span className={cn("rounded-md px-2 py-1", balanced ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive")}>
                {balanced ? "balanced ✓" : "debits ≠ credits"}
              </span>
              {(result.unknown_accounts?.length ?? 0) > 0 && (
                <span className="rounded-md bg-destructive/10 px-2 py-1 text-destructive">
                  unknown accounts: {result.unknown_accounts!.join(", ")}
                </span>
              )}
              {(result.missing_dates ?? 0) > 0 && (
                <span className="rounded-md bg-destructive/10 px-2 py-1 text-destructive">{result.missing_dates} rows without a date</span>
              )}
            </div>
          )}
          {(result.sample?.length ?? 0) > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[34rem] whitespace-nowrap font-mono text-[11px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                    <th className="py-1.5 pr-3 font-normal">Date</th>
                    <th className="py-1.5 pr-3 font-normal">Account</th>
                    <th className="py-1.5 pr-3 font-normal">Description</th>
                    <th className="py-1.5 pr-3 text-right font-normal">Debit</th>
                    <th className="py-1.5 text-right font-normal">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {result.sample!.map((r, i) => (
                    <tr key={i} className="border-t border-border/60">
                      <td className="py-1.5 pr-3 tabular-nums">{r.txn_date ?? "—"}</td>
                      <td className="py-1.5 pr-3">{r.account_code ?? "—"}</td>
                      <td className="max-w-[18rem] truncate py-1.5 pr-3 text-foreground/80">{r.description ?? ""}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{num(r.debit)}</td>
                      <td className="py-1.5 text-right tabular-nums">{num(r.credit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(result.rows ?? 0) > (result.sample?.length ?? 0) && (
                <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">first {result.sample!.length} of {result.rows} rows</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CopyRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  }
  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <code className={cn("min-w-0 flex-1 truncate rounded-md bg-background px-2 py-1.5 text-xs", mono && "font-mono")}>{value}</code>
      <button onClick={copy} aria-label={`Copy ${label}`} className="rounded-md p-1.5 text-muted-foreground transition hover:bg-foreground/[0.05] hover:text-foreground">
        {copied ? <Check className="size-3.5 text-accent" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  )
}
