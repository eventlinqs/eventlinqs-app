/**
 * THE BASIS TOOL'S OWN READING, AS PURE RULES (window 6's scripts/ops/outreach-basis.mjs of 28 October 2026 and its role
 * rule scripts/lib/outreach-basis-role.mjs of 29 October, ported for the twenty's nightly pool; Lawal's 10:42 of
 * 13 November 2026: every engine runs by itself).
 *
 * Spam Act 2003 Schedule 2 clause 4 and ACMA's June 2024 expectation, as migration 20261028201001 records them: a
 * conspicuously published business address is a basis only when (1) it is conspicuously published, (2) the publication
 * carries no statement that they do not want messages, and (3) the message relates to their role. So an address is
 * taken only when it appears ON one of the organiser's own pages (written out or as a mailto link), at their own domain,
 * in the role an invitation to list relates to, on a page with no statement against messages. The statement check is a
 * filter here; the check the law relies on is Lawal's own, recorded on the page itself before any message leaves held
 * (migration 20261031053501, src/lib/outreach/crm.ts confirmPageChecked). Pure.
 */

/** Statements against receiving messages, as publications word them. A hit leaves the address without a basis. */
export const AGAINST: readonly RegExp[] = [
  /\b(no|not for|do not send|don'?t send)\s+(unsolicited|marketing|commercial|promotional|sales)\b/i,
  /\bunsolicited\s+(commercial\s+)?(e-?mails?|messages?|marketing|solicitations?)\b/i,
  /\bnot\s+(to\s+be\s+)?used\s+for\s+(marketing|commercial|promotional|unsolicited)\b/i,
  /\bno\s+(sales|marketing|cold)\s+(calls?|e-?mails?|enquiries|inquiries|pitches)\b/i,
  /\b(we\s+do\s+not|we\s+don'?t)\s+(accept|want|welcome)\s+(solicitations|marketing|sales)\b/i,
]

/** The organiser's own pages read, after its home page. */
export const BASIS_PATHS = ['', '/contact', '/contact-us', '/about', '/about-us'] as const

/** The visible words of a page. Pure. */
export function words(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Every address a page publishes, written out or as a mailto link, lower case; never an image name or a vendor's. Pure. */
export function addressesOn(html: string): string[] {
  const found = new Set<string>()
  for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) {
    try {
      found.add(decodeURIComponent(m[1]).toLowerCase())
    } catch {
      found.add(m[1].toLowerCase())
    }
  }
  for (const m of words(html).matchAll(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi)) found.add(m[0].toLowerCase())
  return [...found].filter((a) => !/\.(png|jpe?g|gif|webp|svg)$/i.test(a) && !/(sentry|wixpress|example\.com|domain\.com)/i.test(a))
}

/** The host of an address, lower case, without www; null when it is not one. Pure. */
export function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

const STOP = new Set(['and', 'of', 'the', 'at', 'for', 'with', 'inc', 'club', 'co'])
const NOT_EVENTS = /^(careers?|jobs?|hr|recruit\w*|accounts?|payroll|invoices?|billing|helpdesk|privacy|steakhouse|restaurant|kitchen)$/

/**
 * Whether this address is the organiser's own in the role an invitation to list relates to (scripts/lib/outreach-basis-
 * role.mjs, the same rule): null when it may be taken, else the reason. textBefore is the page's words just before the
 * address, where a page says what the inbox is for. Pure.
 */
export function roleRefusal(address: string, organiserName: string, textBefore = ''): string | null {
  const [local, domain = ''] = address.toLowerCase().split('@')
  const sentence = textBefore.slice(-200).split(/[.!?]\s/).pop() ?? ''
  if (/\b(resume|résumé|cv|employment|job applications?|apply for)\b/i.test(sentence)) return 'published for job applications'
  if (NOT_EVENTS.test(local)) return `a ${local} inbox (a restaurant, jobs or administration), not their events`
  if (/\.gov\.au$/.test(domain)) {
    const ws = organiserName.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean)
    const initials = ws.filter((w) => !STOP.has(w)).map((w) => w[0]).join('')
    const named = local === initials || ws.some((w) => w.length >= 4 && !STOP.has(w) && local === w)
    if (!named) return `a shared government domain (${domain}): only the organiser's own named inbox is taken there`
  }
  return null
}

export type BasisFind = { address: string; pageUrl: string }
export type BasisRefusal = { address: string; pageUrl: string; why: string }

/**
 * The addresses one organiser's own pages publish that may be recorded with a basis, and those refused with their
 * reason: at its own domain, in its events role, on a page with no statement against messages. `known` are the
 * addresses the CRM already holds for it (never recorded twice). Pure.
 */
export function basisFinds(
  organiser: { name: string; website: string },
  pages: readonly { url: string; html: string }[],
  known: readonly string[],
): { finds: BasisFind[]; refused: BasisRefusal[] } {
  const site = domainOf(organiser.website)
  const finds: BasisFind[] = []
  const refused: BasisRefusal[] = []
  if (!site) return { finds, refused }
  const seen = new Set<string>(known.map((k) => k.toLowerCase()))
  for (const page of pages) {
    const pageWords = words(page.html)
    const against = AGAINST.find((re) => re.test(pageWords))
    for (const a of addressesOn(page.html)) {
      if (seen.has(a)) continue
      const d = a.split('@')[1] ?? ''
      if (!(d === site || d.endsWith(`.${site}`))) continue
      seen.add(a)
      if (against) {
        refused.push({ address: a, pageUrl: page.url, why: `a statement against messages on the page (${(pageWords.match(against) ?? [''])[0]})` })
        continue
      }
      const at = pageWords.toLowerCase().indexOf(a)
      const why = roleRefusal(a, organiser.name, at >= 0 ? pageWords.slice(0, at) : '')
      if (why) refused.push({ address: a, pageUrl: page.url, why: `not their role (${why})` })
      else finds.push({ address: a, pageUrl: page.url })
    }
  }
  return { finds, refused }
}
