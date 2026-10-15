// ============================================================================
// Edge function: notify-review
//
// The outbound end of the pg_net round-trip. Invoked by the database (NOT a
// browser): when detect_anomalies stamps a batch as review-ready, the
// private.notify_review() trigger POSTs here via pg_net. This is the honest
// "DB reached out to a service" demonstration — and the visible proof, on the
// X-ray timeline, that the round-trip actually executed.
//
// Today it is a STUB: it structured-logs "batch X awaiting review, N anomalies"
// (where a real Slack/email/webhook integration will later go) and emits a
// pipeline_events `review_notified` row so the X-ray panel shows the delivery
// (mirrors the cron's mv_refreshed). The trigger already emitted
// review_notify_requested; together they read request → delivered.
//
// Auth: verify_jwt is on (see config.toml), exactly like ingest-submit. The
// platform rejects anything without a valid project JWT before this code runs;
// pg_net sends the service_role JWT as the bearer, which passes. We then use a
// service-role client purely to insert the event (service_role is an intended
// writer of pipeline_events — see migration 13).
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Constant-time string compare — the bearer must be the service-role key.
// verify_jwt only proves the token is a VALID project JWT (the anon key is one
// too), so without this anyone holding the public anon key could POST here and
// forge pipeline_events. pg_net presents the service-role key, so we require it.
const enc = new TextEncoder()
function timingSafeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  let diff = ab.length ^ bb.length
  const n = Math.max(ab.length, bb.length)
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0)
  return diff === 0
}

const CORS = {
  // Called server-to-server by pg_net (no browser, no cookies); a wildcard
  // origin is harmless here and keeps a manual curl test simple.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function log(level: "info" | "warn" | "error", msg: string, extra?: unknown) {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level,
    component: "notify-review",
    msg,
    ...(extra ? { extra } : {}),
  }))
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json(405, { error: "method not allowed" })

  // Only the database (pg_net, bearing the service-role key) may call this.
  // A valid-but-non-service JWT (e.g. the public anon key) is rejected, so
  // pipeline_events can't be forged through this endpoint.
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (!bearer || !timingSafeEqual(bearer, SERVICE_ROLE_KEY)) {
    return json(401, { error: "service role required" })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return json(400, { error: "invalid json body" })
  }
  const {
    batch_id: batchId,
    entity_id: entityId,
    period,
    status,
    flagged_accounts: flaggedRaw,
    rows_total: rowsTotal,
    rows_invalid: rowsInvalid,
  } = body as Record<string, unknown>

  if (typeof batchId !== "string" || !UUID_RE.test(batchId)) {
    return json(400, { error: "batch_id must be a uuid" })
  }
  if (typeof entityId !== "string" || !UUID_RE.test(entityId)) {
    return json(400, { error: "entity_id must be a uuid" })
  }
  const flagged = typeof flaggedRaw === "number" ? flaggedRaw : 0

  // STUB: this is where a real Slack/email/webhook send goes. For now the
  // structured log line IS the notification — "batch X awaiting review, N
  // anomalies" — greppable in `supabase functions logs` / MCP get_logs.
  log("info", `batch ${batchId} awaiting review, ${flagged} anomalies`, {
    batchId, entityId, period, status,
    flaggedAccounts: flagged, rowsTotal, rowsInvalid,
  })

  // Emit review_notified so the X-ray panel shows the round-trip completed.
  // service_role bypasses RLS and is an intended writer of pipeline_events
  // (migration 13). entity_id is NOT NULL — carried straight from the payload.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await admin.from("pipeline_events").insert({
    entity_id: entityId,
    batch_id: batchId,
    stage: "review_notified",
    detail: {
      flagged_accounts: flagged,
      channel: "stub-log", // real channel (slack/email) later
      delivered_via: "pg_net",
    },
  })
  if (error) {
    // Don't 500 the caller into a pg_net retry loop over a logging-side failure;
    // the notification itself (the log above) already happened. Surface it.
    log("error", "could not emit review_notified", {
      batchId, entityId, error: error.message,
    })
    return json(200, { status: "notified", event_emitted: false })
  }

  return json(200, { status: "notified", event_emitted: true })
})
