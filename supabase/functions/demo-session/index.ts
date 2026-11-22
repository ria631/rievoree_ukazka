// ============================================================================
// Edge function: demo-session   (verify_jwt = false — it's the public way in)
//
// The only way into the shared demo. No password is involved anywhere: the
// demo accounts' passwords are random and unknown; a session is minted here
// with the service role (an admin magic link, verified on the spot — no e-mail
// is sent).
//
//   POST { email, as? }                      a new visitor. The e-mail is kept
//                                            as a lead (public.leads, source
//                                            'demo'); `as` defaults to the
//                                            guest viewer.
//   POST { as }  + Authorization: Bearer <a demo session's JWT>
//                                            an existing demo session changing
//                                            identity (role switch, the tour,
//                                            the X-ray RLS tab). No e-mail.
//
//   → 200 { access_token, refresh_token, expires_in, email }
//   → 400 bad e-mail / unknown identity · 403 not a demo session ·
//     429 too many from this address (public.demo_session_gate decides)
//
// Only the four demo identities can ever be issued; a real account's JWT gets
// 403, and the gate rate-limits per address (hashed with a server secret, so
// the raw IP is never stored).
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2"
import { CORS, json, log } from "../_shared/connectors.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const COMPONENT = "demo-session"

/** The identities this function may issue — never super@demo.local, never a real account. */
const DEMO_IDENTITIES = new Set(["demo@demo.local", "viewer@demo.local", "manager@demo.local", "admin@demo.local"])
const GUEST = "demo@demo.local"
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const noSession = { auth: { persistSession: false, autoRefreshToken: false } }

/** The caller's address, hashed with a server secret — enough to rate-limit, useless to anyone else. */
async function addressHash(req: Request): Promise<string> {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim()
    || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown"
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ip}|${SERVICE_ROLE_KEY}`))
  return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("")
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json(405, { error: "method not allowed" })

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const as = typeof body?.as === "string" ? body.as.trim().toLowerCase() : GUEST
  if (!DEMO_IDENTITIES.has(as)) return json(400, { error: "unknown demo identity" })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, noSession)

  // Who's asking: a demo session switching identity, or a new visitor.
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
  let caller: { email?: string } | null = null
  if (bearer && bearer !== ANON_KEY) {
    const { data } = await admin.auth.getUser(bearer)
    caller = data.user
  }

  let kind: "enter" | "switch"
  let email: string | null = null
  if (caller) {
    if (!(caller.email ?? "").toLowerCase().endsWith("@demo.local")) {
      return json(403, { error: "only a demo session can switch demo identities" })
    }
    kind = "switch"
  } else {
    email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
    if (!EMAIL_RE.test(email) || email.length > 254 || email.endsWith("@demo.local")) {
      return json(400, { error: "Enter a valid e-mail address." })
    }
    kind = "enter"
  }

  try {
    const { data: verdict, error: gateErr } = await admin.rpc("demo_session_gate", {
      p_kind: kind, p_ip_hash: await addressHash(req), p_email: email,
    })
    if (gateErr) throw new Error(`gate: ${gateErr.message}`)
    if (verdict === "rate_limited") return json(429, { error: "Too many demo sessions from here — try again in a few minutes." })
    if (verdict !== "ok") return json(400, { error: "Enter a valid e-mail address." })

    // Mint the session: an admin magic link (nothing is e-mailed), verified at once.
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: as })
    const tokenHash = link?.properties?.hashed_token
    if (linkErr || !tokenHash) throw new Error(`link: ${linkErr?.message ?? "no token"}`)
    const anon = createClient(SUPABASE_URL, ANON_KEY, noSession)
    const { data: verified, error: otpErr } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash })
    const session = verified?.session
    if (otpErr || !session) throw new Error(`verify: ${otpErr?.message ?? "no session"}`)

    log(COMPONENT, "info", kind, { as })
    return json(200, {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      email: as,
    })
  } catch (e) {
    log(COMPONENT, "error", "failed", { kind, as, error: e instanceof Error ? e.message : String(e) })
    return json(502, { error: "The demo could not open right now — please try again." })
  }
})
