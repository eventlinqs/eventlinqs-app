import { getSiteUrl } from '@/lib/site-url'

/**
 * The origin every emailed auth link is built against.
 *
 * Pinned to `NEXT_PUBLIC_SITE_URL` first so a forged Host or Origin header on a
 * direct POST to an auth endpoint cannot smuggle a confirmation or reset link
 * to an attacker-controlled host.
 *
 * Extracted from `/api/auth/signup`, which had this logic inline. Three more
 * endpoints now mint emailed links, and four private copies of an
 * open-redirect guard is three too many.
 *
 * WHY A DEPLOYMENT NEVER READS THE REQUEST HEADERS (2026-08-05). This function
 * originally fell straight from `NEXT_PUBLIC_SITE_URL` to the Origin and Host
 * headers, on the assumption that an unset site URL meant local development.
 * That assumption is false against the environment manifest this branch was
 * rebased onto, which declares `NEXT_PUBLIC_SITE_URL` OPTIONAL on production
 * and states plainly that the platform is correct with it unset, because
 * `getSiteUrl()` resolves a branded origin without it. On a production
 * deployment with the variable unset, every confirmation, reset and magic link
 * would therefore have been built from the request Host header, which is the
 * exact vector the first paragraph exists to close, and it would also mint
 * links on whichever branded host the visitor happened to arrive on. Three of
 * those four hosts answer 301, and src/lib/site-url.ts records why that
 * matters: Stripe and some email clients do not follow redirects, and auth
 * cookies and sessions live on the canonical host only.
 *
 * So a DEPLOYMENT resolves through `getSiteUrl()`, the platform's canonical
 * origin resolver, whose chain is deploy-safe and can never reach localhost or
 * a request-controlled value. The headers are consulted only when there is no
 * deployment signal at all, which is a developer's own machine, where
 * `getSiteUrl()` would otherwise hand back the production origin and email a
 * local signup a link into production.
 */
export function safeAuthOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured) return configured.replace(/\/$/, '')

  // VERCEL_ENV is set in the runtime environment of every Vercel deployment.
  // The same signal already distinguishes a deployment from a local run in
  // src/lib/email/send.ts and src/lib/site-url.ts.
  if (process.env.VERCEL_ENV) return getSiteUrl().replace(/\/$/, '')

  const origin = request.headers.get('origin')
  if (origin) return origin.replace(/\/$/, '')

  const host = request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  return host ? `${proto}://${host}` : 'http://localhost:3000'
}
