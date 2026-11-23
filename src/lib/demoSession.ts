import { supabase } from "@/lib/supabase"

/**
 * The shared demo, without a password anywhere in the browser.
 *
 * Every demo session comes from the `demo-session` edge function: a new
 * visitor trades an e-mail for a session (kept as a lead), and a demo session
 * trades its own token for another demo identity (the role switch, the tour,
 * the X-ray RLS tab). The demo accounts' passwords are random; the plain
 * sign-in form can't open them.
 */

const URL_ = import.meta.env.VITE_SUPABASE_URL as string
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const ENDPOINT = `${URL_}/functions/v1/demo-session`

export const DEMO_GUEST = "demo@demo.local"
const REMEMBER = "xray-demo-email"

export type DemoTokens = { access_token: string; refresh_token: string; email: string }

export class DemoSessionError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

async function request(body: Record<string, unknown>, bearer: string, fetchImpl: typeof fetch = fetch): Promise<DemoTokens> {
  let res: Response
  try {
    res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { apikey: KEY, Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch {
    throw new DemoSessionError("Couldn't reach the demo — check your connection and try again.", 0)
  }
  const data = await res.json().catch(() => ({})) as Partial<DemoTokens> & { error?: string }
  if (!res.ok || !data.access_token || !data.refresh_token) {
    throw new DemoSessionError(data.error ?? `The demo could not open (${res.status}).`, res.status)
  }
  return data as DemoTokens
}

async function adopt(t: DemoTokens) {
  const { error } = await supabase.auth.setSession({ access_token: t.access_token, refresh_token: t.refresh_token })
  if (error) throw new DemoSessionError(error.message, 500)
}

/** A new visitor: leave an e-mail, get the guest demo session. */
export async function enterDemo(email: string): Promise<void> {
  const t = await request({ email: email.trim() }, KEY)
  rememberDemoEmail(email.trim())
  await adopt(t)
}

/** Tokens for another demo identity, asked for with the current demo session. */
export async function demoTokensFor(as: string, fetchImpl?: typeof fetch): Promise<DemoTokens> {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  if (!token) throw new DemoSessionError("The demo session has ended — open the demo again.", 401)
  return request({ as }, token, fetchImpl)
}

/** Switch the app's session to another demo identity. */
export async function switchDemoIdentity(as: string): Promise<void> {
  await adopt(await demoTokensFor(as))
}

export function rememberedDemoEmail(): string {
  try { return localStorage.getItem(REMEMBER) ?? "" } catch { return "" }
}
function rememberDemoEmail(email: string) {
  try { localStorage.setItem(REMEMBER, email) } catch { /* private mode: fine */ }
}

/* ── opening the gate from anywhere (landing buttons, login, 404) ── */

const OPEN = "xray:open-demo-gate"
export function openDemoGate() { window.dispatchEvent(new Event(OPEN)) }
export function onOpenDemoGate(fn: () => void) {
  window.addEventListener(OPEN, fn)
  return () => window.removeEventListener(OPEN, fn)
}
