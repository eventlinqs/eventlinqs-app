import { describe, expect, it } from 'vitest'
import { composeFromText } from '@/lib/launch/compose'
import { buildDraftContext } from '@/lib/launch/draft-artefacts'
import { toCaptionInput } from '@/lib/broadcast/kit-artefacts'
import { buildCaptions } from '@/lib/broadcast/captions'

/**
 * THE REPETITION GATE.
 *
 * This exists because 1,768 passing tests did not catch the most obvious
 * problem in the finished product, and only reading a rendered kit did.
 *
 * The composer handed buildSummaryFallback the RAW title, which for the way
 * people actually type is the entire sentence. The summary therefore restated
 * the whole input, and every caption printed the date and price again
 * underneath it: the Instagram caption said the date twice, Facebook said it
 * three times. A promoter notices that instantly and deletes it, which makes
 * the caption worthless and the kit unimpressive.
 *
 * The assertions are deliberately about the OUTPUT A HUMAN READS, not about
 * which function was called.
 */

const TAXONOMY = {
  categoryNames: ['Nightlife', 'Comedy', 'Arts & Community', 'Family', 'Food & Drink'],
  communitySlugs: ['african', 'indian', 'italian'],
  nowIso: '2026-08-09T00:00:00.000Z',
}

const ARRIVALS: [string, string][] = [
  ['dj', 'Warehouse party at the Barwon Club, Marlo Reyes b2b Kita, Sat 20th September, doors 10pm, $25 presale'],
  ['comedian', 'Comedy night at the Prince, first Tuesday every month, 5 comics, $15 on the door'],
  ['market', 'Geelong makers market, third Sunday, 40 stalls, free entry, 9am to 2pm at Johnstone Park'],
  ['workshop', 'Pottery workshop, 6 places, $85, Saturday 27th September 10am, my studio in Newtown'],
  ['charity', 'Trivia night for Geelong Animal Rescue, Sat 12th September, $30 a head, tables of 8, at the RSL'],
  ['birthday', "Ruby's 16th, Saturday 20th September, 6pm at our place in Belmont, about 40 kids, no charge"],
]

function kitFor(text: string) {
  const result = composeFromText({ text, ...TAXONOMY })
  const context = buildDraftContext({
    payload: result.payload,
    code: 'abcdefghjkmn',
    origin: 'https://example.com',
    organiserName: '',
  })
  return { payload: result.payload, captions: buildCaptions(toCaptionInput(context)) }
}

/** Every "Sunday 20 September"-shaped date phrase in a block of copy. */
function datePhrases(text: string): string[] {
  return (
    text.match(
      /\b(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\s+\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)/gi,
    ) ?? []
  ).map(s => s.toLowerCase())
}

describe('the summary does not swallow the organiser sentence', () => {
  it.each(ARRIVALS)('%s: the summary is not just the raw input back', (_name, text) => {
    const { payload } = kitFor(text)
    // The exact defect: the summary containing the whole typed sentence.
    expect(payload.summary.toLowerCase()).not.toContain(text.toLowerCase())
  })

  it.each(ARRIVALS)('%s: the summary stays a summary, under 200 characters', (_name, text) => {
    const { payload } = kitFor(text)
    expect(payload.summary.length).toBeLessThanOrEqual(200)
  })

  it('the DJ summary no longer carries the price twice over', () => {
    const { payload } = kitFor(ARRIVALS[0][1])
    const priceMentions = (payload.summary.match(/\$25/g) ?? []).length
    expect(priceMentions).toBeLessThanOrEqual(1)
  })
})

describe('no caption says the date more than once', () => {
  it.each(ARRIVALS)('%s', (_name, text) => {
    const { captions } = kitFor(text)
    const offenders = captions
      .map(c => {
        const full = c.subject ? `${c.subject}\n${c.text}` : c.text
        const dates = datePhrases(full)
        const repeated = dates.filter((d, i) => dates.indexOf(d) !== i)
        return repeated.length > 0 ? `${c.platform}: ${repeated.join(', ')}` : null
      })
      .filter(Boolean)

    expect(offenders).toEqual([])
  })
})

describe('a held-back address never reaches a caption or a card', () => {
  it.each([ARRIVALS[3], ARRIVALS[5]])('%s keeps the venue out of the copy', (_name, text) => {
    const { payload, captions } = kitFor(text)
    expect(payload.addressHeldBack).toBe(true)

    // "our place" / "my studio" is the private venue wording. It must not be
    // printed anywhere a stranger reads.
    for (const caption of captions) {
      const full = `${caption.subject ?? ''} ${caption.text}`.toLowerCase()
      expect(full).not.toMatch(/\b(our|my)\s+(place|house|home|studio|backyard|garage)\b/)
    }
    expect(payload.summary.toLowerCase()).not.toMatch(
      /\b(our|my)\s+(place|house|home|studio|backyard|garage)\b/,
    )
  })
})
