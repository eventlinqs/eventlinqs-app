import { describe, expect, it } from 'vitest'
import { captionMarkFaults } from '@/lib/social/caption-marks'
import { carriesBannedWord } from '@/lib/social/words'
import {
  captionFor,
  cleanHandle,
  collabWorthIt,
  collaboratorsFor,
  firstLineFor,
  momentsDue,
  rankPhotos,
  runsOf,
  selectToday,
  stageOf,
  storyLine,
  type CollabOrganiser,
  type LifecycleNight,
  type PhotoAsset,
  type RunHistory,
} from '@/lib/social/lifecycle'

// Law 37 (l) and law 40 (Lawal, 20 November 2026): each rule of the lifecycle planner, driven by its own case. The
// PM's 14:10 item 5 names the cases: multi day, launch day, final day, image ranking, duplicate prevention, previously
// promoted, expired, missing permission; law 40 adds the Collab rules.

const night = (over: Partial<LifecycleNight> = {}): LifecycleNight => ({
  eventId: 'e1',
  seriesId: null,
  title: 'Night Market',
  venueKey: 'v1',
  startDate: '2026-11-28T08:00:00Z', // 7pm in Melbourne (AEDT, UTC+11)
  endDate: '2026-11-28T12:00:00Z',
  timezone: 'Australia/Melbourne',
  listedAt: '2026-11-01T00:00:00Z',
  cancelled: false,
  salesOpen: true,
  ticketedHere: false,
  tier: 2,
  ...over,
})
const none: RunHistory = { feedDays: [], storyDays: [], had: [] }
// Noon in Melbourne on a given day: the instant 01:00 UTC.
const melb = (day: string) => new Date(`${day}T01:00:00Z`)

describe('runs: a festival listed a row a day, or in one row, is one run', () => {
  it('groups three consecutive rows of one title and venue, and keeps a later run apart', () => {
    const rows = ['2026-11-20', '2026-11-21', '2026-11-22', '2026-12-10'].map((d, i) =>
      night({ eventId: `d${i}`, startDate: `${d}T00:00:00Z`, endDate: `${d}T11:00:00Z` }),
    )
    const runs = runsOf(rows)
    expect(runs.map((r) => r.days)).toEqual([['2026-11-20', '2026-11-21', '2026-11-22'], ['2026-12-10']])
  })
  it('reads a three day row as three days, and an overnight show as one', () => {
    const fest = runsOf([night({ startDate: '2026-11-20T00:00:00Z', endDate: '2026-11-22T11:00:00Z' })])[0]
    expect(fest.days).toEqual(['2026-11-20', '2026-11-21', '2026-11-22'])
    const late = runsOf([night({ startDate: '2026-11-20T10:00:00Z', endDate: '2026-11-20T15:00:00Z' })])[0]
    expect(late.days).toEqual(['2026-11-20'])
  })
})

describe('stages and moments', () => {
  const fest = runsOf(['2026-11-20', '2026-11-21', '2026-11-22'].map((d, i) => night({ eventId: `d${i}`, startDate: `${d}T00:00:00Z`, endDate: `${d}T11:00:00Z` })))[0]
  it('multi day: first day, running, final day, each with its own moments', () => {
    expect(stageOf(fest, melb('2026-11-20'))).toBe('first_day')
    expect(stageOf(fest, melb('2026-11-21'))).toBe('running')
    expect(stageOf(fest, melb('2026-11-22'))).toBe('final_day')
    expect(momentsDue(fest, melb('2026-11-20'), none).map((m) => `${m.kind}|${m.format}`)).toEqual(['first_day|feed', 'first_day|story'])
    expect(momentsDue(fest, melb('2026-11-22'), none).map((m) => `${m.kind}|${m.format}`)).toEqual(['final_day|feed', 'final_day|story'])
  })
  it('running: a story each day, one feed post across the middle only, never right after the first day feed', () => {
    const afterLaunch: RunHistory = { feedDays: ['2026-11-20'], storyDays: ['2026-11-20'], had: ['first_day|feed', 'first_day|story'] }
    expect(momentsDue(fest, melb('2026-11-21'), afterLaunch).map((m) => m.format)).toEqual(['story'])
    const quiet: RunHistory = { feedDays: [], storyDays: [], had: [] }
    expect(momentsDue(fest, melb('2026-11-21'), quiet).map((m) => `${m.kind}|${m.format}`)).toEqual(['running|feed', 'running|story'])
  })
  it('launch day of a single night: one feed and one story, which are also its last', () => {
    const one = runsOf([night()])[0]
    expect(stageOf(one, melb('2026-11-28'))).toBe('first_day')
    expect(momentsDue(one, melb('2026-11-28'), none).map((m) => m.kind)).toEqual(['first_day', 'first_day'])
  })
  it('the arc: announce once, build at most weekly, a final push two or three days out, a story the day before', () => {
    const one = runsOf([night({ listedAt: '2026-11-10T00:00:00Z', startDate: '2026-12-20T08:00:00Z', endDate: '2026-12-20T12:00:00Z' })])[0]
    expect(stageOf(one, melb('2026-11-10'))).toBe('announced')
    expect(momentsDue(one, melb('2026-11-10'), none).map((m) => m.kind)).toEqual(['announce'])
    expect(momentsDue(one, melb('2026-11-10'), { ...none, had: ['announce|feed'] })).toEqual([])
    expect(stageOf(one, melb('2026-11-20'))).toBe('upcoming')
    expect(momentsDue(one, melb('2026-11-20'), { feedDays: ['2026-11-15'], storyDays: [], had: [] })).toEqual([])
    expect(momentsDue(one, melb('2026-11-20'), { feedDays: ['2026-11-13'], storyDays: [], had: [] }).map((m) => m.kind)).toEqual(['build'])
    expect(momentsDue(one, melb('2026-12-17'), none).map((m) => m.kind)).toEqual(['final_push'])
    expect(momentsDue(one, melb('2026-12-19'), none).map((m) => `${m.kind}|${m.format}`)).toEqual(['tomorrow|story'])
  })
  it('expired and cancelled: nothing, ever', () => {
    const one = runsOf([night()])[0]
    expect(stageOf(one, melb('2026-11-29'))).toBe('ended')
    expect(momentsDue(one, melb('2026-11-29'), none)).toEqual([])
    const off = runsOf([night({ cancelled: true })])[0]
    expect(momentsDue(off, melb('2026-11-28'), none)).toEqual([])
  })
  it('previously promoted: a moment already had today is not due again', () => {
    const one = runsOf([night()])[0]
    const done: RunHistory = { feedDays: ['2026-11-28'], storyDays: ['2026-11-28'], had: ['first_day|feed', 'first_day|story'] }
    expect(momentsDue(one, melb('2026-11-28'), done)).toEqual([])
  })
})

describe('the events rule the day: every due moment of every event (Lawal, 22 November 2026, 01:31)', () => {
  const runs = runsOf(Array.from({ length: 8 }, (_, i) => night({ eventId: `n${i}`, title: `Night ${i}`, venueKey: `v${i}` })))
  it('every night with a photograph takes its day feed post and its day story; a missing permission never posts', () => {
    const cands = runs.flatMap((run, i) =>
      momentsDue(run, melb('2026-11-28'), none).map((moment) => ({ run, moment, hasPhoto: i !== 0 })),
    )
    const chosen = selectToday(cands)
    expect(chosen.filter((c) => c.moment.format === 'feed')).toHaveLength(7)
    expect(chosen.filter((c) => c.moment.format === 'story')).toHaveLength(7)
    expect(chosen.some((c) => c.run.nights[0].eventId === 'n0')).toBe(false)
  })
  it('three events with a day moment on one day draw three day pieces of each format', () => {
    const three = runsOf(['a', 'b', 'c'].map((k) => night({ eventId: k, title: `Night ${k}`, venueKey: `v${k}` })))
    const cands = three.flatMap((run) => momentsDue(run, melb('2026-11-28'), none).map((moment) => ({ run, moment, hasPhoto: true })))
    const chosen = selectToday(cands)
    expect(chosen.filter((c) => c.moment.format === 'feed').map((c) => c.run.nights[0].eventId).sort()).toEqual(['a', 'b', 'c'])
    expect(chosen.filter((c) => c.moment.format === 'story')).toHaveLength(3)
  })
  it("the season's spike: a day with 40 events draws every one's due pieces", () => {
    const forty = runsOf(Array.from({ length: 40 }, (_, i) => night({ eventId: `e${i}`, title: `Event ${i}`, venueKey: `w${i}` })))
    const cands = forty.flatMap((run) => momentsDue(run, melb('2026-11-28'), none).map((moment) => ({ run, moment, hasPhoto: true })))
    expect(cands).toHaveLength(80)
    expect(selectToday(cands)).toHaveLength(80)
  })
  it('tier 4 never takes a feed place (law 18), its story still goes', () => {
    const library = runsOf([night({ title: 'Story time', tier: 4 })])
    const lc = library.flatMap((run) => momentsDue(run, melb('2026-11-28'), none).map((moment) => ({ run, moment, hasPhoto: true })))
    expect(selectToday(lc).map((c) => c.moment.format)).toEqual(['story'])
  })
  it('a night EventLinqs sells is ranked before a night it only lists (law 39), so it takes the earlier slot', () => {
    const two = runsOf([night({ eventId: 'a', title: 'A', venueKey: 'va' }), night({ eventId: 'b', title: 'B', venueKey: 'vb', ticketedHere: true })])
    const cands = two.flatMap((run) => momentsDue(run, melb('2026-11-28'), none).map((moment) => ({ run, moment, hasPhoto: true })))
    const feed = selectToday(cands).filter((c) => c.moment.format === 'feed')
    expect(feed.map((c) => c.run.nights[0].eventId)).toEqual(['b', 'a'])
  })
})

describe('photo ranking within the policy, never a photo twice', () => {
  const a = (over: Partial<PhotoAsset>): PhotoAsset => ({ assetId: 'x', url: 'https://x/1.jpg', type: 'photo', leadRank: 1, width: 1440, height: 1080, ...over })
  it('ranks by lead rank, then fit, then width; drops flyers, unlooked photos and any used before', () => {
    const assets = [
      a({ assetId: 'flyer', url: 'u1', type: 'artwork', leadRank: 1 }),
      a({ assetId: 'unlooked', url: 'u2', leadRank: null }),
      a({ assetId: 'used', url: 'u3', leadRank: 1 }),
      a({ assetId: 'second', url: 'u4', leadRank: 2 }),
      a({ assetId: 'tall', url: 'u5', leadRank: 1, width: 1080, height: 1920 }),
      a({ assetId: 'first', url: 'u6', leadRank: 1, width: 1440, height: 1080 }),
    ]
    expect(rankPhotos(assets, 'feed', new Set(['u3'])).map((x) => x.assetId)).toEqual(['first', 'tall', 'second'])
    expect(rankPhotos(assets, 'story', new Set(['u3'])).map((x) => x.assetId)).toEqual(['tall', 'first', 'second'])
  })
  it('none is posted when none was looked at (law 37 (k))', () => {
    expect(rankPhotos([a({ leadRank: null })], 'feed', new Set())).toEqual([])
  })
})

describe('Collab is smart, never on every post (law 40)', () => {
  const org = (over: Partial<CollabOrganiser> = {}): CollabOrganiser => ({ handle: '@Night.Market', verifiedAt: '2026-11-20T00:00:00Z', preference: 'open', invites: [], ...over })
  const base = { format: 'feed' as const, slideCount: 1, eventCount: 1, worthIt: true, organisers: [org()] }
  it('invites the verified organiser on a single photograph feed post about their one event', () => {
    expect(collaboratorsFor(base)).toEqual(['night.market'])
  })
  it('never on a story, a carousel, a roundup, or where it adds nothing', () => {
    expect(collaboratorsFor({ ...base, format: 'story' })).toEqual([])
    expect(collaboratorsFor({ ...base, slideCount: 3 })).toEqual([])
    expect(collaboratorsFor({ ...base, eventCount: 4 })).toEqual([])
    expect(collaboratorsFor({ ...base, worthIt: false })).toEqual([])
  })
  it('never an unverified handle, a declined or do not invite organiser, one with an invite pending, or after two ignored', () => {
    expect(collaboratorsFor({ ...base, organisers: [org({ verifiedAt: null })] })).toEqual([])
    expect(collaboratorsFor({ ...base, organisers: [org({ preference: 'do_not_invite' })] })).toEqual([])
    expect(collaboratorsFor({ ...base, organisers: [org({ invites: [{ status: 'declined' }] })] })).toEqual([])
    expect(collaboratorsFor({ ...base, organisers: [org({ invites: [{ status: 'pending' }] })] })).toEqual([])
    expect(collaboratorsFor({ ...base, organisers: [org({ invites: [{ status: 'ignored' }, { status: 'ignored' }] })] })).toEqual([])
    expect(collaboratorsFor({ ...base, organisers: [org({ invites: [{ status: 'ignored' }, { status: 'accepted' }] })] })).toEqual(['night.market'])
  })
  it('at most three, each a real Instagram username', () => {
    const many = ['a.one', 'b_two', 'c3', 'd4'].map((h) => org({ handle: h }))
    expect(collaboratorsFor({ ...base, organisers: many })).toHaveLength(3)
    expect(cleanHandle('https://www.instagram.com/Asia.Example/')).toBe('asia.example')
    expect(cleanHandle('not a handle')).toBeNull()
  })
  it('adds value for festivals, concerts and community nights, or an organiser with an audience', () => {
    expect(collabWorthIt({ categorySlug: 'festivals', title: 'x', organiserFollowers: null })).toBe(true)
    expect(collabWorthIt({ categorySlug: 'workshops', title: 'Pottery class', organiserFollowers: null })).toBe(false)
    expect(collabWorthIt({ categorySlug: 'workshops', title: 'Pottery class', organiserFollowers: 250 })).toBe(true)
  })
})

describe('words: a human first line, never repeated in the window, facts short at the end', () => {
  it('never the same first line twice inside the window, and none when all are spent', () => {
    const first = firstLineFor('first_day', true, new Set(), 0)!
    const second = firstLineFor('first_day', true, new Set([first]), 0)!
    expect(second).not.toBe(first)
    expect(firstLineFor('first_day', true, new Set(['It starts today.', 'Today is the day.', 'Opening today.']), 0)).toBeNull()
  })
  it('never hurries a buyer: no last chance or selling fast, open or not (no-false-urgency)', () => {
    for (const kind of ['announce', 'build', 'final_push', 'tomorrow', 'first_day', 'running', 'final_day'] as const)
      for (const open of [true, false])
        for (let i = 0; i < 6; i++) expect(firstLineFor(kind, open, new Set(), i) ?? '').not.toMatch(/last chance|selling fast|few left|sold out/i)
  })
  it("a caption per network: Instagram's says link in bio, Facebook's carries its own link", () => {
    const facts = { title: 'Night Market', place: 'Fed Square', dateLabel: 'Sat 28 Nov', priceLine: 'Free', summary: 'Street food and live music under the lights all evening. More below.' }
    const ig = captionFor({ platform: 'instagram', firstLine: 'Today is the day.', facts, link: 'https://x?utm_source=instagram' })
    const fb = captionFor({ platform: 'facebook', firstLine: 'Today is the day.', facts, link: 'https://x?utm_source=facebook' })
    expect(ig.split('\n\n')).toEqual([
      'Today is the day.',
      'Street food and live music under the lights all evening.',
      // The 05:15 standard (22 November 2026): the details line closes the fact block, and never says 'tickets'.
      'Night Market\n\u{1F4CD} Fed Square\n\u{1F4C5} Sat 28 Nov\n\u{1F4B2} Free entry\n\u{1F39F} Details on EventLinqs: link in our bio',
    ])
    expect(fb.endsWith('\u{1F39F} Details on EventLinqs:\nhttps://x?utm_source=facebook')).toBe(true)
    // The class (the PM's 01:09 item 4): AMCF's first lifecycle pieces were refused as drawn for carrying no emoji. Every
    // caption the planner draws now passes caption standard version 2's marks, on both networks.
    expect(captionMarkFaults(ig)).toEqual([])
    expect(captionMarkFaults(fb)).toEqual([])
    const bare = captionFor({ platform: 'instagram', firstLine: 'Today is the day.', facts: { ...facts, place: null, priceLine: null, summary: null }, link: 'https://x' })
    expect(captionMarkFaults(bare)).toEqual([])
  })
  it("the listing's sentence is left out where it says the banned word outside the night's names (AMCF, 21 November 2026)", () => {
    // Production's own row, read at 02:56 on 21 November 2026: both of AMCF's pieces were refused as drawn, 'The words
    // carry a banned word. Say community.', for quoting this first sentence.
    const title = 'African Music and Cultural Festival 2026'
    const summary = 'Three days of African music, food and culture in the heart of Melbourne. A free, family-friendly event open to all.'
    const facts = { title, place: 'Fed Square', dateLabel: 'Sat 21 Nov, 11am', priceLine: 'Free', summary, names: [title] }
    for (const platform of ['instagram', 'facebook'] as const) {
      const caption = captionFor({ platform, firstLine: 'The middle day.', facts, link: `https://x?utm_source=${platform}` })
      expect(carriesBannedWord(caption, [title])).toBe(false)
      expect(caption).not.toContain('Three days of African music')
      expect(caption).toContain(title)
      expect(captionMarkFaults(caption)).toEqual([])
    }
    // The drill: the sentence alone is what the one rule refuses, so a caption quoting it would be held.
    expect(carriesBannedWord('Three days of African music, food and culture in the heart of Melbourne.', [title])).toBe(true)
    // A sentence that says the word only inside the night's own name is still quoted.
    const named = captionFor({ platform: 'instagram', firstLine: 'The middle day.', facts: { ...facts, summary: 'The African Music and Cultural Festival 2026 fills Fed Square for three days.' }, link: 'https://x' })
    expect(named).toContain('fills Fed Square for three days.')
  })
  it("a story's one line is short, and names the place only when it fits", () => {
    expect(storyLine('final_day', 'Fed Square')).toBe('Last day today at Fed Square.')
    expect(storyLine('running', 'A very long venue name that will not fit here')).toBe('On today.')
  })
})
