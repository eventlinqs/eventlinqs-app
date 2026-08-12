'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ACTIVE_ORGANISATION_COOKIE, isUuid, resolveOrganisationScope } from './scope'

/**
 * Switch which business the dashboard is showing.
 *
 * WHY A SERVER ACTION RATHER THAN A LINK. The switcher has to do two things at once:
 * put the chosen business in the URL, so a tab is pinned to it and a bookmark keeps
 * working, AND remember it, so the sidebar links do not drop the organiser back onto
 * their first business on the next click. Next.js only permits a cookie to be
 * written from a Server Function or a Route Handler, never during a Server Component
 * render ("HTTP does not allow setting cookies after streaming starts, so you must
 * use .set in a Server Function or Route Handler",
 * node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md, Next
 * 16.3.0 as installed). A link cannot do it; a form posting to this can.
 *
 * OWNERSHIP IS RE-VERIFIED HERE. The form is client-supplied input, so the id is
 * checked against the caller's own organisations before it is written anywhere. A
 * uuid belonging to somebody else never reaches the cookie, and the redirect refuses
 * rather than guessing.
 *
 * The redirect target is constrained to a dashboard path so this cannot be turned
 * into an open redirect by a crafted form post.
 */
export async function switchOrganisation(formData: FormData): Promise<void> {
  const organisationId = String(formData.get('organisationId') ?? '')
  const rawReturnTo = String(formData.get('returnTo') ?? '/dashboard')

  // Same-origin dashboard paths only. `//evil.example` is a protocol-relative URL
  // that a browser treats as another origin, so a leading-slash check alone is not
  // enough and both are required.
  const returnTo =
    rawReturnTo.startsWith('/dashboard') && !rawReturnTo.startsWith('//')
      ? rawReturnTo.split('?')[0]
      : '/dashboard'

  if (!isUuid(organisationId)) redirect(returnTo)

  const scope = await resolveOrganisationScope(organisationId, { useCookie: false })
  if (!scope.ok) {
    // 403 for somebody else's id, 404 for none at all. Either way the organiser is
    // returned to their dashboard rather than shown an error page, because the only
    // way to reach this is a stale form or a crafted post.
    redirect(returnTo)
  }

  const store = await cookies()
  store.set(ACTIVE_ORGANISATION_COOKIE, scope.active.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // A year. This is a preference, not a credential: it names which of the
    // caller's own businesses to show, and ownership is re-verified on every read,
    // so a stale value can only ever cost one redirect to the default.
    maxAge: 60 * 60 * 24 * 365,
  })

  redirect(`${returnTo}?org=${encodeURIComponent(scope.active.id)}`)
}
