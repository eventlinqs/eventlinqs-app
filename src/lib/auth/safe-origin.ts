/**
 * The origin every emailed auth link is built against.
 *
 * Pinned to `NEXT_PUBLIC_SITE_URL` first so a forged Host or Origin header on a
 * direct POST to an auth endpoint cannot smuggle a confirmation or reset link
 * to an attacker-controlled host. The request headers are consulted only when
 * no site URL is configured, which is local development.
 *
 * Extracted from `/api/auth/signup`, which had this logic inline. Three more
 * endpoints now mint emailed links, and four private copies of an
 * open-redirect guard is three too many.
 */
export function safeAuthOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured) return configured.replace(/\/$/, '')

  const origin = request.headers.get('origin')
  if (origin) return origin.replace(/\/$/, '')

  const host = request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  return host ? `${proto}://${host}` : 'http://localhost:3000'
}
