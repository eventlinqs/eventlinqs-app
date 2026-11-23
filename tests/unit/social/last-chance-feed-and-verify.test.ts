import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { feedDayWordOf, hookFor, momentsDue, runsOf, type LifecycleNight, type RunHistory } from '@/lib/social/lifecycle'

vi.mock('server-only', () => ({}))

/*
 * THE DEADLINE CAR OF 23 NOVEMBER 2026 (the PM's 13:32 item 1; Lawal's 13:05 and 13:12). A night at its tomorrow stage
 * that never had its final push could only be offered a story, which carries no link, so the engine had no Facebook post
 * with the event's own link. Each rule here is red on main:
 *   1. the last chance feed: the day before, a night with no final push gets one, beside its story;
 *   2. no relative words in a feed post: the final push's first line and the feed day word;
 *   3. Instagram waits for its proven booking journey (flag instagram_bio_journey_proven), failing closed;
 *   4. post this night now in two stages, so nothing publishes before the PM's VERIFY;
 *   5. the AI log line carries the organisation the key belongs to, from the response header, never the key.
 */

const night = (over: Partial<LifecycleNight> = {}): LifecycleNight => ({
  eventId: 'e1',
  seriesId: null,
  title: 'A Quiet Evening',
  venueKey: 'v1',
  startDate: '2026-12-20T08:00:00Z',
  endDate: '2026-12-20T10:00:00Z',
  timezone: 'Australia/Melbourne',
  listedAt: '2026-11-10T00:00:00Z',
  cancelled: false,
  salesOpen: true,
  ticketedHere: false,
  tier: 2,
  ...over,
})
const none: RunHistory = { feedDays: [], storyDays: [], had: [] }
const melb = (day: string) => new Date(`${day}T01:00:00Z`)
const keys = (r: { kind: string; format: string }[]) => r.map((m) => `${m.kind}|${m.format}`)

describe('the last chance feed', () => {
  const one = runsOf([night()])[0]
  it('the day before, a night that never had its final push gets it beside its story', () => {
    expect(keys(momentsDue(one, melb('2026-12-19'), none))).toEqual(['final_push|feed', 'tomorrow|story'])
  })
  it('a night that had its final push gets the story alone', () => {
    expect(keys(momentsDue(one, melb('2026-12-19'), { ...none, had: ['final_push|feed'] }))).toEqual(['tomorrow|story'])
  })
  it('a feed already posted today, or inside the gap, is not doubled', () => {
    expect(keys(momentsDue(one, melb('2026-12-19'), { feedDays: ['2026-12-19'], storyDays: [], had: [] }))).toEqual(['tomorrow|story'])
    expect(keys(momentsDue(one, melb('2026-12-19'), { feedDays: ['2026-12-18'], storyDays: [], had: [] }))).toEqual(['tomorrow|story'])
  })
})

describe('no relative words in a feed post', () => {
  it("the final push's first line names no time relative to the day it is read", () => {
    const line = hookFor('final_push', ['live music'], 'The Hall', {}) ?? ''
    expect(line).not.toMatch(/days away|tomorrow|today|tonight|this week/i)
    expect(line).toBe('Live music at The Hall, coming up.')
  })
  it("a feed post's day word is the weekday, never Today or Tomorrow", () => {
    expect(feedDayWordOf('2026-11-24')).toBe('Tuesday')
    const plan = readFileSync('src/lib/social/lifecycle-plan.ts', 'utf8')
    expect(plan).toMatch(/dayWord: c\.moment\.format === 'feed' \? feedDayWordOf\(/)
  })
})

describe("Instagram waits for the bio's proven booking journey", () => {
  const fake = (row: { enabled: boolean } | null, error: { message: string } | null = null) =>
    ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error }) }) }) }) }) as never
  it('fails closed: no flag, a flag off, or a failed read is unproven; only the flag on is proven', async () => {
    const { instagramBioJourneyProven } = await import('@/lib/social/store')
    expect(await instagramBioJourneyProven(fake(null))).toBe(false)
    expect(await instagramBioJourneyProven(fake({ enabled: false }))).toBe(false)
    expect(await instagramBioJourneyProven(fake({ enabled: true }, { message: 'down' }))).toBe(false)
    expect(await instagramBioJourneyProven(fake({ enabled: true }))).toBe(true)
  })
  it('scheduling holds the Instagram row with the reason, and Facebook goes alone', () => {
    const store = readFileSync('src/lib/social/store.ts', 'utf8')
    const loop = store.slice(store.indexOf('export async function scheduleApprovedPieces'), store.indexOf('/** What publishes a piece on a network'))
    expect(loop).toMatch(/if \(!misfit && platform === 'instagram'\) \{\s+bioProven \?\?= await instagramBioJourneyProven\(db\)\s+if \(!bioProven\) misfit = INSTAGRAM_BIO_UNPROVEN/)
  })
})

describe("post this night now stops for the PM's VERIFY", () => {
  const store = readFileSync('src/lib/social/store.ts', 'utf8')
  const fn = store.slice(store.indexOf('export async function postNightNow'), store.indexOf('async function publishPassedPiece'))
  it('the draw stage approves, schedules and sends nothing', () => {
    expect(fn).toMatch(/return \{ state: 'drawn', pieceId/)
    expect(fn).not.toMatch(/approvePieceChecked\(|scheduleApprovedPieces\(|publishDuePieces\(/)
  })
  it('the publish stage takes only the passed piece of the named night', () => {
    const pub = store.slice(store.indexOf('async function publishPassedPiece'))
    expect(pub).toMatch(/if \(!rev\.eventIds\.includes\(input\.eventId\)\) return \{ state: 'held'/)
    expect(pub.indexOf('rev.eventIds.includes')).toBeLessThan(pub.indexOf('approvePieceChecked('))
  })
  it('the run and its workflow require the stage; nothing draws and publishes in one call', () => {
    const route = readFileSync('src/app/api/cron/social-publish/route.ts', 'utf8')
    expect(route).toMatch(/if \(stage !== 'draw' && stage !== 'publish'\) return NextResponse\.json/)
    const wf = readFileSync('.github/workflows/social-post-now.yml', 'utf8')
    expect(wf).toMatch(/options: \[draw, publish\]/)
    expect(wf).toMatch(/stage=\$\{STAGE\}&piece=\$\{PIECE\}/)
  })
})

describe('the AI log line names the organisation the key belongs to', () => {
  it("the client's fetch notes anthropic-organization-id, and both request lines log it, never the key", () => {
    const client = readFileSync('src/lib/ai/client.ts', 'utf8')
    expect(client).toMatch(/res\.headers\.get\('anthropic-organization-id'\)/)
    expect(client).toMatch(/fetch: notingFetch/)
    for (const f of ['src/lib/ai/service.ts', 'src/lib/ai/magic-start.ts']) {
      const s = readFileSync(f, 'utf8')
      const line = s.slice(s.indexOf("evt: 'ai.request',"), s.indexOf("evt: 'ai.request',") + 120)
      expect(line).toMatch(/org: anthropicOrganisation\(\)/)
    }
    expect(readFileSync('src/lib/ai/logging.ts', 'utf8')).toMatch(/org\?: string \| null/)
  })
})
