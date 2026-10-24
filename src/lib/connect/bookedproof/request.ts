/**
 * THE BODY OF BOOKEDPROOF'S ORGANISER READ (E51, the contract's section 3 as
 * reconciled at 10:05): {"emails": [1 to 100], "pages": [0 to 50 public listing
 * addresses], "since": ISO or null}. Anything else is refused with its reason,
 * never guessed at.
 *
 * Addresses are trimmed and lower-cased, and duplicates collapse to the first.
 * The address pattern is deliberately narrow (letters, digits and . _ + - on
 * the left, no %), so no address can reach a database pattern as a wildcard
 * that matches everyone; the read still compares every candidate exactly.
 * A page is a listing's own public address, https://<host>/events/<slug>; only
 * its slug is used.
 */

export const MAX_EMAILS = 100
export const MAX_PAGES = 50

export type OrganiserReadRequest = {
  emails: string[]
  /** The pages as sent, each with the slug read from it, in the order sent. */
  pages: Array<{ page: string; slug: string }>
  since: Date | null
}

export type ParsedRequest = { ok: true; value: OrganiserReadRequest } | { ok: false; reason: string }

const EMAIL = /^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function slugOfPage(page: string): string | null {
  let url: URL
  try {
    url = new URL(page)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  const m = /^\/events\/([^/]+)\/?$/.exec(url.pathname)
  return m && SLUG.test(m[1]) ? m[1] : null
}

export function parseOrganiserReadRequest(rawBody: string): ParsedRequest {
  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return { ok: false, reason: 'the body is not JSON' }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, reason: 'the body is not an object' }
  const keys = Object.keys(body)
  const unknown = keys.filter((k) => !['emails', 'pages', 'since'].includes(k))
  if (unknown.length > 0) return { ok: false, reason: `unknown field(s): ${unknown.join(', ')}` }
  const b = body as { emails?: unknown; pages?: unknown; since?: unknown }

  if (!Array.isArray(b.emails) || b.emails.length < 1 || b.emails.length > MAX_EMAILS) {
    return { ok: false, reason: `emails must be an array of 1 to ${MAX_EMAILS} addresses` }
  }
  const emails: string[] = []
  for (const e of b.emails) {
    if (typeof e !== 'string') return { ok: false, reason: 'every email must be a string' }
    const clean = e.trim().toLowerCase()
    if (!EMAIL.test(clean)) return { ok: false, reason: `not an address: ${JSON.stringify(e).slice(0, 80)}` }
    if (!emails.includes(clean)) emails.push(clean)
  }

  const pagesIn = b.pages === undefined ? [] : b.pages
  if (!Array.isArray(pagesIn) || pagesIn.length > MAX_PAGES) {
    return { ok: false, reason: `pages must be an array of 0 to ${MAX_PAGES} listing addresses` }
  }
  const pages: Array<{ page: string; slug: string }> = []
  for (const p of pagesIn) {
    if (typeof p !== 'string') return { ok: false, reason: 'every page must be a string' }
    const slug = slugOfPage(p.trim())
    if (!slug) return { ok: false, reason: `not a public listing address: ${JSON.stringify(p).slice(0, 120)}` }
    pages.push({ page: p, slug })
  }

  let since: Date | null = null
  if (b.since !== undefined && b.since !== null) {
    if (typeof b.since !== 'string' || Number.isNaN(Date.parse(b.since))) return { ok: false, reason: 'since must be an ISO moment or null' }
    since = new Date(b.since)
  }
  return { ok: true, value: { emails, pages, since } }
}
