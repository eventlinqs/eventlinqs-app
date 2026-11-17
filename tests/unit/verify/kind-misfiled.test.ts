import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { kindMisfiled, NEVER_UNDER } from '../../../scripts/verify/kind-misfiled.mjs'
import { nightKind, type CampaignNight } from '@/lib/social/campaign'

/*
 * THE KIND CHECK READS THE KIND READER'S OWN WORDS (the PM's 04:38 of 18 November 2026). acceptance-live's
 * kind-matches-category holds every published night the kind reader calls a talk under Music or Arts, and every stage
 * production under Arts. The rows below are the ones read on production at 06:35 that day (q/kind-filed.json), and the
 * check must agree with nightKind on each, so the two can never drift apart.
 */
const SRC = readFileSync('src/lib/social/campaign.ts', 'utf8')
type Row = { title: string; summary: string | null; category: string; venue: string }
const rows: Row[] = [
  { title: 'An Evening with Alastair Campbell', summary: 'An event on a Sunday morning, tickets through Melbourne Recital Centre.', category: 'music', venue: 'Melbourne Recital Centre' },
  { title: 'Cosi: Geelong Repertory Theatre Company', summary: 'A performance at Woodbin Theatre, Geelong Arts Centre.', category: 'arts-community', venue: 'Woodbin Theatre' },
  { title: 'Witness for the Prosecution', summary: "Agatha Christie's courtroom drama staged in the Old Eaglehawk Court House.", category: 'arts-community', venue: 'Old Eaglehawk Court House' },
  { title: "Bell Shakespeare's Mackenzie", summary: 'A stage show at Ulumbarra Theatre, Bendigo.', category: 'arts-community', venue: 'Ulumbarra Theatre' },
  { title: 'Timor-Leste - Ita Nia Lian, Ita Nia Istoria - Our Voices, Our Stories', summary: 'An event on a Friday evening, tickets through Melbourne Recital Centre.', category: 'music', venue: 'Melbourne Recital Centre' },
  { title: 'An Evening with Cat Power: The Greatest', summary: 'A performance at Costa Hall, Geelong Arts Centre.', category: 'arts-community', venue: 'Costa Hall' },
  { title: 'Ian Moss and Troy Cassar-Daley: Together Alone Tour', summary: 'Rock guitarist Ian Moss and country singer Troy Cassar-Daley share songs and stories, acoustic guitars in hand.', category: 'music', venue: "Her Majesty's Theatre Ballarat" },
  { title: 'The Teskey Brothers', summary: 'A live concert on a Wednesday evening, tickets through Ticketmaster.', category: 'music', venue: 'Rod Laver Arena' },
]
const asNight = (r: Row) =>
  ({ eventId: r.title, title: r.title, sourceTitle: r.title, summary: r.summary, categorySlug: r.category, venueName: r.venue, host: r.venue, startDate: '2026-11-20T09:00:00Z', timezone: 'Australia/Melbourne' }) as unknown as CampaignNight

describe("acceptance-live's kind-matches-category", () => {
  it('holds the talk filed as music and the plays filed as arts, and nothing else of these rows', () => {
    const held = (kindMisfiled(rows, SRC) as Row[]).map((r) => r.title)
    expect(held).toEqual(['An Evening with Alastair Campbell', 'Cosi: Geelong Repertory Theatre Company', 'Witness for the Prosecution', "Bell Shakespeare's Mackenzie"])
  })
  it('agrees with the kind reader on every row', () => {
    for (const r of rows) {
      const kind = nightKind(asNight(r))
      const held = (kindMisfiled([r], SRC) as Row[]).length === 1
      const shouldHold = (kind === 'talk' || kind === 'theatre') && (NEVER_UNDER[kind] as string[]).includes(r.category)
      expect({ title: r.title, held }).toEqual({ title: r.title, held: shouldHold })
    }
  })
  it('refuses to run when the reader no longer declares a word list it reads', () => {
    expect(() => kindMisfiled(rows, SRC.replace('const SOFT_TALK_WORDS', 'const SOFT_WORDS'))).toThrow(/SOFT_TALK_WORDS is not declared/)
  })
  it('the live acceptance run carries the check', () => {
    const live = readFileSync('scripts/verify/acceptance-live.mjs', 'utf8')
    expect(live).toMatch(/record\('kind-matches-category'/)
    expect(live).toMatch(/kindMisfiled\(filed, readFileSync\(join\(process\.cwd\(\), 'src', 'lib', 'social', 'campaign\.ts'\)/)
  })
})
