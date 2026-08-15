import { notFound } from 'next/navigation'

/**
 * INTERNAL PREVIEW ROUTES ARE NOT PRODUCTION SURFACES.
 *
 * Four routes exist purely so the founder and the design work can look at
 * components in isolation: `/design/cards`, `/dev/logo-preview`,
 * `/dev/shell-preview` and the Connect onboarding preview. Every one of them
 * shipped to production, reachable by anyone who guessed the URL.
 *
 * WHY THAT MATTERS RATHER THAN BEING TIDY-UP. `/design/cards` renders its
 * previews from `picsum.photos`, a third-party placeholder image service, and
 * links a sample card at a hardcoded event slug. So the live site carried a page
 * of placeholder imagery pulled from a host we do not control, with a link that
 * resolves to nothing. `robots: { index: false }` was doing the only guarding,
 * and noindex stops a crawler, not a person: Law 1 bans placeholder surfaces and
 * Law 5 bans dead links, and neither has an exemption for pages we assume nobody
 * will find.
 *
 * The routes are KEPT, because they are genuinely useful for design review, and
 * closed on production instead of deleted. Preview and local development still
 * serve them, which is the only place they were ever meant to be seen.
 *
 * `VERCEL_ENV` is Vercel's own environment marker and is `production` only on a
 * production deployment
 * (https://vercel.com/docs/environment-variables/system-environment-variables,
 * fetched 15 August 2026). It FAILS CLOSED: an unset variable is treated as
 * production, so a runtime that does not set it hides these pages rather than
 * publishing them. That is the opposite polarity to the Lighthouse crawlability
 * fallback in `next.config.ts`, and deliberately so: there, failing open keeps a
 * gate green; here, failing open would publish a placeholder page.
 */
export function assertPreviewRouteAllowed(): void {
  if (process.env.VERCEL_ENV !== 'preview' && process.env.NODE_ENV === 'production') {
    notFound()
  }
}
