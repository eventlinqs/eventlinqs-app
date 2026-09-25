/**
 * WHERE AN ORGANISER CAME FROM, carried on the link that brought them.
 *
 * Close-out OL1 step 3: every button on /organisers carries `src=organisers`
 * into the signup path, and AN1 keeps it on the account. Nobody can currently
 * say how MKL Studios found EventLinqs, and a platform that cannot answer that
 * cannot spend a dollar on advertising honestly.
 *
 * ONE FUNCTION RATHER THAN A STRING TYPED AT EACH BUTTON. There are four
 * entry points on that page and they were four separate hrefs; four copies of
 * a query parameter is three chances to forget it, and a forgotten one is
 * invisible (the button still works, the attribution is simply absent). The
 * guard reads this module, so the parameter has one spelling.
 *
 * PURE, and no 'server-only': the closing CTA and the founding band are server
 * components today, but the parameter is part of an href rather than a lookup
 * and must stay usable wherever a button is rendered.
 */
export const ORGANISER_SIGNUP_SOURCE = 'organisers'

/** The signup path every /organisers button points at. */
export const ORGANISER_SIGNUP_PATH = '/organisers/signup'

/**
 * Appends the source to a path, preserving anything already on it.
 *
 * Never overwrites an existing `src`: a more specific source (a share link, a
 * confirmation page) is closer to where the person actually came from, and the
 * page they landed on is the coarser answer.
 */
export function withSignupSource(href: string, source: string = ORGANISER_SIGNUP_SOURCE): string {
  const [path, query = ''] = href.split('?')
  const params = new URLSearchParams(query)
  if (!params.get('src')) params.set('src', source)
  return `${path}?${params.toString()}`
}
