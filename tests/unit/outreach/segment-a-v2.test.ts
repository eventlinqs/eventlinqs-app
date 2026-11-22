import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderTemplate } from '@/lib/outreach/rules'
import { SEGMENT_A_FIRST, segmentAFields, type SegmentAFacts } from '@/lib/outreach/segment-a-letter'
import { readVoicePolicy, wordsProblems } from '@/lib/outreach/voice-gate'

/*
 * SEGMENT_A_FIRST VERSION 2 IS TODAY-V2, WORD FOR WORD (the PM's 20:40 of 19 November 2026, item 1; Lawal's APPROVE PERM
 * of 18 November 2026, 13:46, which names 'Event Photo Permissions v2 (today-v2)'). Each of the 14 approved letters is
 * drawn from version 2 with only the facts its own words show (its event, day and link, one or many listed, booked or
 * not, show or event) and must match its approved body exactly. The photo upload and unsubscribe links are placeholders
 * on both sides (capability links; this repository is public).
 */
type Row = {
  file: string
  organiserName: string
  greeting: string
  subject: string
  title: string
  startDate: string
  timezone: string | null
  category: string | null
  summary: string | null
  venueName: string | null
  slug: string
  listedNow: number
  listedWithBooking: number
  kind: 'show' | 'event'
  hasBooking: boolean
  body: string
}
const LETTERS = JSON.parse(readFileSync(join(process.cwd(), 'tests/unit/outreach/today-v2-letters.fixture.json'), 'utf8')) as Row[]
const ORIGIN = 'https://www.eventlinqs.com.au'
const UNSUB = `${ORIGIN}/unsubscribe/outreach?t=UNSUBSCRIBE`

/*
 * THE ONE WORD THAT DIFFERS, AND WHY. today-v2's letter 01 (Torquay Dance Academy: Showtime) says 'your next event'. The
 * 14 were drawn at 08:06 on 18 November 2026 by the pack's own script (C:\dev\EVIDENCE\EL-18NOV\pack\letters\
 * make-letters-today.py, line 94: kind = 'show' if r['next_category'] in SHOW else 'event'), which read the raw category
 * (arts-community); the PM's 04:38 of that morning had already ruled the kind is read by the one kind reader the posts
 * use, never the raw category, and that reader (campaign.ts nightKind, DANCE_WORDS 'dance academy'; 'show' for a dance
 * night, the PM's 03:10 class 14) reads this night as a dance show. So version 2 draws 'show'. Every other word of all
 * 14 is matched exactly. Named to the PM in WINDOW 5A's line of 19 November 2026.
 */
const KIND_READ_BY_THE_ONE_READER: Readonly<Record<string, readonly [string, string]>> = {
  'letter-01.json': ['one image of your next event', 'one image of your next show'],
}

function factsOf(r: Row): SegmentAFacts {
  return {
    organiserName: r.organiserName,
    personName: null,
    night: {
      title: r.title,
      slug: r.slug,
      startDate: r.startDate,
      // The night's own facts as production holds them, which the one kind reader (campaign.ts nightKind) reads.
      timezone: r.timezone,
      categorySlug: r.category,
      summary: r.summary,
      venueName: r.venueName,
      hasPhoto: true,
      hasBooking: r.hasBooking,
    },
    listedNow: r.listedNow,
    listedWithBooking: r.listedWithBooking,
    openers: 0,
    nightOpeners: 0,
    photoLink: `${ORIGIN}/photos/PHOTO-LINK`,
    origin: ORIGIN,
  } as SegmentAFacts
}

describe('segment_a_first version 2 is today-v2, word for word', () => {
  it('the fixture holds the 14 approved letters', () => {
    expect(LETTERS).toHaveLength(14)
  })

  // VERSION 3, THE COMMUNICATION STANDARD (Lawal, 20:45 of 22 November 2026, adopting COMMS-STANDARD-REVIEW-22NOV.md:
  // "change everything, even the greetings"; the PM's 20:47, item 1): each approved letter word for word with only its
  // stock pleasantry taken out. The fixture stays the record of what he approved on 18 November.
  const STOCK = "I hope you're well.\n\n"
  it.each(LETTERS.map((r) => [r.file, r] as const))('%s is drawn from version 3: the approved letter with only the pleasantry taken out', (_file, r) => {
    const rendered = renderTemplate(SEGMENT_A_FIRST, segmentAFields(factsOf(r)), UNSUB)
    expect(rendered.subject).toBe(r.subject)
    const swap = KIND_READ_BY_THE_ONE_READER[r.file]
    if (swap) expect(r.body.split(swap[0])).toHaveLength(2)
    const approved = swap ? r.body.replace(swap[0], swap[1]) : r.body
    expect(approved.split(STOCK)).toHaveLength(2)
    expect(rendered.body).toBe(approved.replace(STOCK, ''))
    expect(wordsProblems(rendered.body, readVoicePolicy())).toEqual([])
  })

  it('the drill: version 1 words, the founder sentence, are refused at send time', () => {
    const r = LETTERS[0]
    const v1 = r.body.replace("We'd love to help more people discover", "I'm Lawal Adams, and I'm building EventLinqs, a new Australian platform that builds a community around every event it lists. I'd love to help more people find")
    expect(wordsProblems(v1, readVoicePolicy()).some((p) => p.startsWith('the founder sentence is out of every message'))).toBe(true)
  })
})
