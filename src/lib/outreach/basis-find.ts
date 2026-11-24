/**
 * THE BASIS TOOL'S OWN READING, AS PURE RULES (window 6's scripts/ops/outreach-basis.mjs of 28 October 2026 and its role
 * rule scripts/lib/outreach-basis-role.mjs of 29 October, ported for the twenty's nightly pool; Lawal's 10:42 of
 * 13 November 2026: every engine runs by itself).
 *
 * Spam Act 2003 Schedule 2 clause 4 and ACMA's June 2024 expectation, as migration 20261028201001 records them: a
 * conspicuously published business address is a basis only when (1) it is conspicuously published, (2) the publication
 * carries no statement that they do not want messages, and (3) the message relates to their role. So an address is
 * taken only when it appears ON one of the organiser's own pages (written out or as a mailto link), published there by
 * the organiser for contact, in the role an invitation to list relates to, on a page with no statement against messages.
 *
 * THE DOMAIN RULE WIDENED (the PM's 10:30 of 22 November 2026, item (c); Lawal's outreach engine rebuild of 10:31,
 * section 1: "Remove the requirement that organiser email addresses must match their business domain ... Gmail and
 * other personal-domain addresses publicly used for organiser business"): the night before, 8 of the pool's 12 reads
 * found 'no address at its own domain on its own pages'. An address the organiser's own site publishes counts at its own
 * domain OR at a free mail provider (FREE_MAIL), on the same three tests, with its page and the words quoted. An address
 * at ANOTHER organisation's domain printed on their site (a ticket seller's support desk, a venue's office) is refused
 * with that reason: it is not theirs. Never an address read on a third party's page. The statement check is a
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

/** Free mail providers whose addresses a small organiser publishes as its own (Lawal's 10:31, section 1). */
export const FREE_MAIL: ReadonlySet<string> = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'outlook.com.au', 'hotmail.com', 'hotmail.com.au', 'live.com', 'live.com.au',
  'msn.com', 'yahoo.com', 'yahoo.com.au', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'bigpond.com', 'bigpond.net.au',
  'bigpond.com.au', 'optusnet.com.au', 'iinet.net.au', 'internode.on.net', 'tpg.com.au', 'protonmail.com', 'proton.me',
  'aol.com', 'fastmail.com', 'zoho.com',
])

/** Whose domain an address is at, judged against the organiser's own site: its own, a free mail provider's, or another's. Pure. */
export function addressKind(address: string, site: string): 'own domain' | 'free mail' | 'another domain' {
  const d = (address.split('@')[1] ?? '').toLowerCase()
  if (d === site || d.endsWith(`.${site}`)) return 'own domain'
  if (FREE_MAIL.has(d)) return 'free mail'
  return 'another domain'
}

/** The words around an address on its page, quoted as the basis records them; a mailto link only says so. Pure. */
export function quoteFor(pageWords: string, address: string): string {
  const at = pageWords.toLowerCase().indexOf(address.toLowerCase())
  if (at < 0) return `a mailto link to ${address}`
  return pageWords.slice(Math.max(0, at - 100), Math.min(pageWords.length, at + address.length + 40)).trim()
}

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
// A hotel's rooms and its restaurant are not its events (Novotel Geelong's reservations@ and dining@, 25 November 2026).
const NOT_EVENTS = /^(careers?|jobs?|hr|recruit\w*|accounts?|payroll|invoices?|billing|helpdesk|privacy|steakhouse|restaurant|kitchen|dining|reservations?|rooms|stay|accommodation)$/

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

/**
 * A DIRECTORY PAGE TAKES ONLY ITS EVENTS OR OFFICE INBOX (WINDOW 5C, 25 November 2026, the contact discovery of the PM's
 * 06:59 item 2): the Basilica of St Mary of the Angels' contact page lists twelve people, priests, staff in other roles
 * and four volunteers' own Gmail and Yahoo addresses, and every one passed the three tests. An invitation to list their
 * events relates to the role of the inbox that handles them, never to a volunteer's own mail or a priest's. So on a page
 * that publishes more than DIRECTORY_SIZE addresses, an address is taken only when its own name is an events or office
 * inbox (DIRECTORY_INBOX), or the words just before it name that role (DIRECTORY_ROLE); a free mail address there is
 * never taken. A page with few addresses keeps the rule as it was.
 */
export const DIRECTORY_SIZE = 4
const DIRECTORY_INBOX = /^(info|hello|events?|bookings?|enquiries|inquiries|contact|office|admin|reception|functions|hire|venues?|tickets?|programming|parish(office)?|secretary)$/
const DIRECTORY_ROLE = /\b(events?|bookings?|functions?|venue hire|hire|programming|office|secretary|administrator|reception)\b[^.@]{0,40}$/i

/** Why an address on a directory page is not taken, or null when it is. Pure. */
export function directoryRefusal(address: string, kind: 'own domain' | 'free mail', textBefore: string): string | null {
  if (kind === 'free mail') return "a person's own mail on a page listing many people"
  const local = address.toLowerCase().split('@')[0] ?? ''
  if (DIRECTORY_INBOX.test(local)) return null
  const lead = textBefore.slice(-80).replace(/\S+@\S+/g, ' ')
  return DIRECTORY_ROLE.test(lead) ? null : "a person's address on a page listing many people, not the inbox for their events"
}

export type BasisFind = { address: string; pageUrl: string; kind: 'own domain' | 'free mail'; quote: string }
export type BasisRefusal = { address: string; pageUrl: string; why: string }

/**
 * The addresses one organiser's own pages publish that may be recorded with a basis, and those refused with their
 * reason: at its own domain or a free mail provider, in its events role, on a page with no statement against messages,
 * each with the words that publish it. `known` are the addresses the CRM already holds for it (never recorded twice).
 * Pure.
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
    const onPage = addressesOn(page.html)
    const directory = onPage.length > DIRECTORY_SIZE
    for (const a of onPage) {
      if (seen.has(a)) continue
      const kind = addressKind(a, site)
      seen.add(a)
      if (kind === 'another domain') {
        refused.push({ address: a, pageUrl: page.url, why: `another organisation's domain (${a.split('@')[1] ?? ''}), not theirs` })
        continue
      }
      if (against) {
        refused.push({ address: a, pageUrl: page.url, why: `a statement against messages on the page (${(pageWords.match(against) ?? [''])[0]})` })
        continue
      }
      const at = pageWords.toLowerCase().indexOf(a)
      const before = at >= 0 ? pageWords.slice(0, at) : ''
      const why = roleRefusal(a, organiser.name, before) ?? (directory ? directoryRefusal(a, kind, before) : null)
      if (why) refused.push({ address: a, pageUrl: page.url, why: `not their role (${why})` })
      else finds.push({ address: a, pageUrl: page.url, kind, quote: quoteFor(pageWords, a) })
    }
  }
  return { finds, refused }
}
