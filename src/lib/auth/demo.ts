/** Is this one of the shared demo identities? Any *@demo.local account is.
 *  Known from the session at once — before the profile (and its is_demo flag)
 *  has loaded — so demo-only screens never flash real ones first. */
export function isDemoEmail(email: string | null | undefined) {
  return (email ?? "").toLowerCase().endsWith("@demo.local")
}
