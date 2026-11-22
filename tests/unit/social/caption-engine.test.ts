import { describe, expect, it } from 'vitest'
import { captionFor, experiencesOf, hookFor, momentSaysOnNow, nightTimes, type MomentKind } from '@/lib/social/lifecycle'
import { ON_NOW } from '@/lib/social/piece-quality'

/*
 * THE CAPTION ENGINE (the PM's 05:02 of 22 November 2026; Lawal, 04:50: "could it be any better ... a human would do this
 * ... professional"). The first line is a specific hook from the night's own listing words, never a generic 'Opening
 * today'; the time is always stated; the facts keep their four markers. Colours of Asia's last night, as its listing reads.
 */
const COA = 'A free festival in Alexandra Gardens with Asian street food, lantern gardens, music, dance, art and artisan markets.'
const ZONE = 'Australia/Melbourne'

describe('the night in its own words', () => {
  it("takes up to three of the listing's own experiences, in its order, never a phrase it does not say", () => {
    expect(experiencesOf(COA, 'Colours of Asia: Garden of Wonders')).toEqual(['street food', 'lantern gardens', 'music'])
    expect(experiencesOf('Live music and DJs all night.', 'Club Night')).toEqual(['live music', 'DJs'])
    expect(experiencesOf('An evening of conversation.', 'Book launch')).toEqual([])
  })

  it("Colours of Asia's last night opens on what you will find there: 'and still on' inside its doors, plain before them", () => {
    expect(hookFor('final_day', experiencesOf(COA, 'Colours of Asia'), 'Alexandra Gardens', { startedByBand: true })).toBe(
      'Last day today for street food, lantern gardens and music at Alexandra Gardens, and still on.',
    )
    expect(hookFor('final_day', experiencesOf(COA, 'Colours of Asia'), 'Alexandra Gardens')).toBe(
      'Last day today for street food, lantern gardens and music at Alexandra Gardens.',
    )
    expect(hookFor('final_day', [], 'Alexandra Gardens')).toBeNull()
  })

  it("every hook keeps the publish gate's rule: its words say on now exactly when its moment does", () => {
    const kinds: MomentKind[] = ['announce', 'build', 'final_push', 'tomorrow', 'first_day', 'running', 'final_day']
    for (const kind of kinds) {
      for (const started of [false, true]) {
        const line = hookFor(kind, ['music'], 'The Venue', { startedByBand: started }) as string
        expect(ON_NOW.test(line), `${kind} ${started}: ${line}`).toBe(momentSaysOnNow(kind, started))
      }
    }
    expect(ON_NOW.test(hookFor('running', ['music'], 'The Venue', { repeatDay: true }) as string)).toBe(false)
    expect(ON_NOW.test(hookFor('running', ['music'], 'The Venue', { repeatDay: true, startedByBand: true }) as string)).toBe(true)
  })
})

describe('the time, always stated', () => {
  it("states a night's hours in its own zone, a long row's start, and nothing for a date-only listing", () => {
    expect(nightTimes('2026-11-22T00:00:00Z', '2026-11-22T11:00:00Z', ZONE)).toBe('11am to 10pm')
    expect(nightTimes('2026-11-24T08:30:00Z', '2026-11-24T11:00:00Z', ZONE)).toBe('7:30pm to 10pm')
    expect(nightTimes('2026-11-20T09:00:00Z', '2026-11-22T11:00:00Z', ZONE)).toBe('from 8pm')
    expect(nightTimes('2026-11-21T13:00:00Z', null, ZONE)).toBeNull()
  })

  it('the facts line carries the date and the hours, with the same four markers', () => {
    const caption = captionFor({
      platform: 'instagram',
      firstLine: 'Last day today for street food, lantern gardens and music at Alexandra Gardens, and still on.',
      facts: { title: 'Colours of Asia: Garden of Wonders', place: 'Alexandra Gardens', dateLabel: 'Sun 22 Nov', times: '11am to 10pm', priceLine: 'Free', summary: COA, names: ['Colours of Asia: Garden of Wonders'] },
      link: 'https://www.eventlinqs.com.au/go/x?via=instagram',
    })
    expect(caption).toContain('\u{1F4C5} Sun 22 Nov, 11am to 10pm')
    const markers = caption.match(/\p{Extended_Pictographic}/gu) ?? []
    expect(new Set(markers)).toEqual(new Set(['\u{1F4CD}', '\u{1F4C5}', '\u{1F4B2}', '\u{1F39F}']))
    expect(markers.length).toBeLessThanOrEqual(4)
  })
})
