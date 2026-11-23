import { describe, expect, it } from 'vitest'
import { firstLineFor, lifecycleWindow, momentSaysOnNow, nightOnDay, postableBand, sessionAt, sessionOfDay, sessionsOf } from '@/lib/social/lifecycle'
import { momentWindowOf, planMoments, scheduleWindowOf, withStartingCalendar, type CadenceRule } from '@/lib/social/cadence'
import { ON_NOW, pieceQuality, type QualityNight } from '@/lib/social/piece-quality'
import type { Slide } from '@/lib/social/campaign'

/*
 * TODAY'S DAY OF THE RUN, NEVER THE SEASON'S FIRST DAY (the PM's 09:10 of 22 November 2026, a hotfix; Lawal, 09:05: "Teach
 * it to the engine right now so that it can continue the same process"). AMCF is one row from 11am on 20 November to 8pm
 * on 22 November; the publish gate judged its 20 November start, so its final day feed was held at the 08:40 run, quoted:
 * 'it has started (2026-11-20T00:00:00+00:00); a piece never posts once its night has started'. A row that runs a full day
 * or more is open each day from its start's clock to its end's: on its last day it may post from the morning with words
 * true before the doors open ('Last day today ... from 11am'), 'still on' only once they are open, and nothing once it
 * has ended. Colours of Asia, one row a day, posts as it did.
 */
const ZONE = 'Australia/Melbourne'
const amcf: QualityNight = {
  eventId: '5d664060-a175-4b07-9c07-5e3c4a934c69',
  title: 'African Music and Cultural Festival 2026',
  summary: 'Three days of African music, food and culture in the heart of Melbourne. A free, family-friendly event open to all.',
  venueName: 'Fed Square',
  host: 'AMCF',
  categorySlug: 'festivals',
  startDate: '2026-11-20T00:00:00+00:00',
  endDate: '2026-11-22T09:00:00+00:00',
  timezone: ZONE,
}
const coa: QualityNight = {
  eventId: '8a1a1b49-3f23-489e-950f-4d7d7e24197c',
  title: 'Colours of Asia: Garden of Wonders',
  summary: 'A free festival in Alexandra Gardens with Asian street food, lantern gardens, music, dance, art and artisan markets.',
  venueName: 'Alexandra Gardens',
  host: 'Asia Oasis',
  categorySlug: 'festivals',
  startDate: '2026-11-22T00:00:00+00:00',
  endDate: '2026-11-22T11:00:00+00:00',
  timezone: ZONE,
}
const photo = (n: QualityNight): Slide => ({ t: 'photo', composition: 'photo_whole', eventId: n.eventId, photo: `https://x/${n.eventId}.jpg`, credit: null, width: 1100, height: 733, line: null }) as unknown as Slide
// As the publish run asks it: the piece goes at this minute (goesAt), so its words are judged against that day's doors.
const nightFaults = (n: QualityNight, caption: string, now: string) =>
  pieceQuality({ slides: [photo(n)], caption, madeAt: '2026-11-21T19:00:00Z', nights: new Map([[n.eventId, n]]), now: new Date(now), goesAt: new Date(now) }).filter((r) => r.startsWith('[night]'))

const BEFORE_DOORS = 'Last day today for African music, food and culture at Federation Square, from 11am.'
const STILL_ON = 'Last day today for African music, food and culture at Federation Square, and still on.'

describe('the publish gate judges today’s day of the run', () => {
  it("AMCF's last day at the 08:40 run, words true before its doors open: passes (red on main: judged by 20 November)", () => {
    expect(nightFaults(amcf, BEFORE_DOORS, '2026-11-21T21:40:00Z')).toEqual([])
  })

  it("AMCF's last day at the 08:40 run saying 'still on' before 11am: refused, the words are not true yet", () => {
    expect(nightFaults(amcf, STILL_ON, '2026-11-21T21:40:00Z').join(' ')).toMatch(/opens at 11:00 am/)
  })

  it("approval and the morning preflight at 8.30 am: a 'still on' piece meant for the evening is not refused, it has not gone yet", () => {
    const atApproval = pieceQuality({ slides: [photo(amcf)], caption: STILL_ON, madeAt: '2026-11-21T19:00:00Z', nights: new Map([[amcf.eventId, amcf]]), now: new Date('2026-11-21T21:30:00Z') })
    expect(atApproval.filter((r) => r.startsWith('[night]'))).toEqual([])
  })

  it("AMCF's last day at the 11:40 run, 'still on' while its doors are open: passes", () => {
    expect(nightFaults(amcf, STILL_ON, '2026-11-22T00:40:00Z')).toEqual([])
  })

  it('AMCF at 21:00 on its last day: refused, it has ended', () => {
    expect(nightFaults(amcf, STILL_ON, '2026-11-22T10:00:00Z').join(' ')).toMatch(/^\[night\] African Music and Cultural Festival 2026: it has started/)
  })

  it('AMCF between its days (21:00 on its first day), words for the next morning: passes', () => {
    expect(nightFaults(amcf, 'Day two tomorrow at Federation Square, from 11am.', '2026-11-20T10:00:00Z')).toEqual([])
  })

  it("Colours of Asia's last day, one row a day: passes before its doors with true words, and while on with 'still on'", () => {
    expect(nightFaults(coa, 'Last day today for street food and lantern gardens at Alexandra Gardens, from 11am.', '2026-11-21T21:40:00Z')).toEqual([])
    expect(nightFaults(coa, 'Last day today for street food and lantern gardens at Alexandra Gardens, and still on.', '2026-11-22T02:40:00Z')).toEqual([])
  })
})

describe('the planner draws a later day for a band its words are true at', () => {
  const night = { title: amcf.title, startDate: amcf.startDate, endDate: amcf.endDate ?? null }
  const run0640 = new Date('2026-11-21T19:40:00Z') // 06:40 on 22 November in Melbourne

  it("AMCF's final day feed at the 06:40 run: the 09:00 band, its words not 'still on' (red on main: 'still on' at 9am)", () => {
    const band = postableBand({ kind: 'final_day', format: 'feed', night, day: '2026-11-22', zone: ZONE, now: run0640 })
    expect('at' in band && band.at.toISOString()).toBe('2026-11-21T22:00:00.000Z')
    expect('at' in band && band.onNow).toBe(false)
  })

  it("AMCF's final day story: the 18:00 band, open then, so 'still on'", () => {
    const band = postableBand({ kind: 'final_day', format: 'story', night, day: '2026-11-22', zone: ZONE, now: run0640 })
    expect('at' in band && band.at.toISOString()).toBe('2026-11-22T07:00:00.000Z')
    expect('at' in band && band.onNow).toBe(true)
  })

  it("AMCF's middle day feed at the 06:40 run: the 09:00 band, before its doors, not 'still on'", () => {
    const band = postableBand({ kind: 'running', format: 'feed', night, day: '2026-11-21', zone: ZONE, now: new Date('2026-11-20T19:40:00Z') })
    expect('at' in band && band.onNow).toBe(false)
  })

  it('a running or final day line says on now exactly when its band is inside the doors', () => {
    for (const kind of ['running', 'final_day'] as const) {
      for (const startedByBand of [false, true]) {
        const line = firstLineFor(kind, true, new Set(), 0, startedByBand)
        expect(ON_NOW.test(line ?? '')).toBe(startedByBand)
        expect(momentSaysOnNow(kind, startedByBand)).toBe(startedByBand)
      }
    }
  })
})

describe("a row's own days (sessionsOf)", () => {
  it('AMCF: three days, each 11am to 8pm in Melbourne', () => {
    expect(sessionsOf({ startDate: amcf.startDate, endDate: amcf.endDate ?? null }, ZONE)).toEqual([
      { start: '2026-11-20T00:00:00.000Z', end: '2026-11-20T09:00:00.000Z' },
      { start: '2026-11-21T00:00:00.000Z', end: '2026-11-21T09:00:00.000Z' },
      { start: '2026-11-22T00:00:00.000Z', end: '2026-11-22T09:00:00.000Z' },
    ])
    expect(sessionAt({ startDate: amcf.startDate, endDate: amcf.endDate ?? null }, ZONE, new Date('2026-11-21T21:40:00Z')).start).toBe('2026-11-22T00:00:00.000Z')
    expect(sessionOfDay({ startDate: amcf.startDate, endDate: amcf.endDate ?? null }, ZONE, '2026-11-21').end).toBe('2026-11-21T09:00:00.000Z')
  })

  it('a festival from 11pm to 10pm two days on: each day closes the next, the last at its end', () => {
    expect(sessionsOf({ startDate: '2026-12-05T12:00:00Z', endDate: '2026-12-07T11:00:00Z' }, ZONE)).toEqual([
      { start: '2026-12-05T12:00:00.000Z', end: '2026-12-06T11:00:00.000Z' },
      { start: '2026-12-06T12:00:00.000Z', end: '2026-12-07T11:00:00.000Z' },
    ])
  })

  it('a night of under a day is its own one session, exactly as written', () => {
    expect(sessionsOf({ startDate: coa.startDate, endDate: coa.endDate ?? null }, ZONE)).toEqual([{ start: coa.startDate, end: coa.endDate }])
    expect(sessionsOf({ startDate: '2026-12-05T12:00:00Z', endDate: null }, ZONE)).toEqual([{ start: '2026-12-05T12:00:00Z', end: '2026-12-05T12:00:00Z' }])
  })
})

describe("the scheduler places a later day's piece on that day's own doors", () => {
  const rule = (format: 'feed' | 'story'): CadenceRule =>
    withStartingCalendar({ version: 1, gapHours: format === 'feed' ? 12 : 2, slots: [], basis: 'starting', learnedFrom: 0, floorPosts: 0, settleHours: 0, setAt: new Date('2026-11-01T00:00:00Z') }, format)
  const amcfNight = { title: amcf.title, startDate: amcf.startDate, endDate: amcf.endDate ?? null, zone: ZONE }
  const approved = new Date('2026-11-21T19:40:00Z') // the 06:40 run on 22 November
  const place = (format: 'feed' | 'story', w: { notBefore: Date; latestUseful: Date }) =>
    planMoments([{ id: 'p', format, approvedAt: approved, latestUseful: w.latestUseful, notBefore: w.notBefore, days: null }], { feed: rule('feed'), story: rule('story') }, { feed: [], story: [] }, approved)

  it("main's window read AMCF's 20 November start, so its last day's feed was late; that day's own window places it at 9 am", () => {
    const onMain = momentWindowOf('2026-11-22', scheduleWindowOf('feed', [{ title: amcf.title, start: Date.parse(amcf.startDate), end: Date.parse(amcf.endDate as string) }]))
    expect(place('feed', onMain).moments.get('p')).toBeUndefined()
    const w = lifecycleWindow('feed', '2026-11-22', false, [nightOnDay(amcfNight, '2026-11-22')])
    expect(w.latestUseful.toISOString()).toBe('2026-11-22T00:00:00.000Z') // 11am, its doors that day
    expect(place('feed', w).moments.get('p')?.toISOString()).toBe('2026-11-21T22:00:00.000Z') // 9 am in Melbourne
  })

  it("its 'still on' story never goes before that day's doors, and is placed at 6 pm while it is open", () => {
    const w = lifecycleWindow('story', '2026-11-22', true, [nightOnDay(amcfNight, '2026-11-22')])
    expect(w.notBefore.toISOString()).toBe('2026-11-22T00:00:00.000Z') // 11am
    expect(w.latestUseful.toISOString()).toBe('2026-11-22T09:00:00.000Z') // 8pm, its close
    expect(place('story', w).moments.get('p')?.toISOString()).toBe('2026-11-22T07:00:00.000Z') // 6 pm
  })
})
