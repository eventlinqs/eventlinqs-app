/**
 * WHO PRESENTS A NIGHT, WHERE ITS OWN PAGE SAYS SO (the PM's 09:05 (3) of 13 November 2026: "each captured night carries
 * its organiser; the outreach pool grows from those organisers"; Lawal's 06:55). Read on 13 November 2026 through the
 * polite reader, one upcoming event page per live source (C:\dev\EVIDENCE\EL-13NOV\engines\organiser-signals.txt): none
 * of 15 carries a schema.org organizer, and two state the presenter as a line of its own: Geelong Arts Centre a span
 * after the title ('Presented by Ocean Grove Calisthenic College'), Melbourne Recital Centre a line above it ('Presented
 * by Melbourne Recital Centre'). The arena and stadium pages name no promoter, so nothing is guessed for them.
 *
 * Only an element whose whole text is 'Presented by <name>' counts: a sentence that merely mentions a presenter, a
 * script's data and a style are never read. The name is a fact about the night (who puts it on), kept like its title.
 * Pure.
 */

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#039': "'", '#x27': "'", '#8217': '\u2019' }

function decode(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => {
    const known = ENTITIES[name.toLowerCase()]
    if (known !== undefined) return known
    if (/^#x[0-9a-f]+$/i.test(name)) return String.fromCodePoint(parseInt(name.slice(2), 16))
    if (/^#\d+$/.test(name)) return String.fromCodePoint(Number(name.slice(1)))
    return whole
  })
}

/** The shortest and longest presenter name kept: a name, never a stray word or a paragraph. */
export const PRESENTER_MIN = 2
export const PRESENTER_MAX = 120

/** The presenter a page names in an element of its own ('Presented by <name>'), or null when it names none. */
export function presenterIn(html: string): string | null {
  const body = html.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  for (const m of body.matchAll(/>([^<>]{3,200})</g)) {
    const text = decode(m[1]).replace(/\s+/g, ' ').trim()
    const named = /^presented by\s+(.+)$/i.exec(text)
    if (!named) continue
    const name = named[1].replace(/[\s.,;:]+$/, '').trim()
    if (name.length >= PRESENTER_MIN && name.length <= PRESENTER_MAX) return name
  }
  return null
}
