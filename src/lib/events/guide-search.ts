import type { DirectoryRow } from './whats-on-directory'

/**
 * WHAT A VISITOR'S WORDS FIND ON A CITY GUIDE (WINDOW 5C, 21 November 2026; Lawal, 09:02: "Every function works to
 * completion"). The production journey (tests/e2e/production-journeys/c-buyer.journey.ts) typed what people ask for into
 * Melbourne's guide at 390: 'AMCF', the short name the festival goes by on every poster and post (its title spells the
 * name out in full),
 * found nothing, because the guide matched only the title, venue, category and suburb; and 'free' found almost nothing,
 * because no free night carries the word in its title. Ticketmaster and Eventbrite answer both.
 *
 * Every word must match (as before), and a word now matches:
 *   - the title, venue, category or suburb, as before;
 *   - the event's own address (/events/amcf-2026), which organisers often write as the short name;
 *   - the title's initials, for a word of three letters or more ('amcf' from the festival's own four word title;
 *     'and', 'of', 'the' and numbers are skipped, as people skip them when they shorten a name);
 *   - 'free' also matches every free night.
 */
const SKIPPED = new Set(['and', 'of', 'the', 'a', 'an', 'at', 'in', 'on', 'for', 'with', 'to'])

export function titleInitials(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w !== '' && !SKIPPED.has(w) && !/^\d+$/.test(w))
    .map((w) => w[0])
    .join('')
}

export function guideSearchWords(q: string): string[] {
  return q.trim().toLowerCase().split(/\s+/).filter(Boolean)
}

export type GuideSearchRow = Pick<DirectoryRow, 'title' | 'venue' | 'category' | 'suburb' | 'href' | 'free'>

export function matchesGuideSearch(r: GuideSearchRow, words: readonly string[]): boolean {
  if (words.length === 0) return true
  const text = `${r.title} ${r.venue ?? ''} ${r.category ?? ''} ${r.suburb ?? ''} ${r.href.replace(/[/-]/g, ' ')}`.toLowerCase()
  const initials = titleInitials(r.title)
  return words.every((w) => {
    if (w === 'free' && r.free) return true
    if (text.includes(w)) return true
    return w.length >= 3 && initials.startsWith(w)
  })
}
