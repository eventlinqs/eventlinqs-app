import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { allWell, areaOfPlay, BUSINESS_AREAS, dollars, morningRows, type MorningFacts } from '@/lib/admin/morning-report-math'
import { windowsAt } from '@/lib/admin/morning-report'
import { businessAreasSection, ENGINE_PAGE, renderStateReport } from '../../../scripts/lib/state-report.mjs'

/*
 * THE 08:00 REPORT'S SEVEN PARTS (car D, part 2; the operating model, section 10; law 25, Lawal's 11:31 of 18 November
 * 2026). The rows, their order and their words are held here; every figure is production's, read that morning.
 */
const QUIET: MorningFacts = {
  marketing: { firstLettersSent: 0, positiveReplies: 0, readyToday: 0 },
  permissions: { requestsSent: 0, photosReceived: 0, photosApproved: 0, requestsDueToday: 0 },
  social: { published: [], scheduledToday: 0, held: 0 },
  listings: { published: 0, ended: 0, onToday: 0 },
  relationships: { repliesReceived: 0, waitingForLawal: 0 },
  ticketing: { ordersConfirmed: 0, feeRevenueCents: 0, activations: 0 },
  system: { failures: [], unreadable: [] },
}
/** The morning of 19 November 2026, as production read it at 10:57 (q-report-shapes.sql). */
const NINETEENTH: MorningFacts = {
  marketing: { firstLettersSent: 17, positiveReplies: 0, readyToday: 0 },
  permissions: { requestsSent: 15, photosReceived: 3, photosApproved: 3, requestsDueToday: 0 },
  social: { published: [{ platform: 'instagram', ref: 'x' }, { platform: 'facebook', ref: 'y' }, { platform: 'facebook', ref: 'z' }], scheduledToday: 1, held: 8 },
  listings: { published: 40, ended: 12, onToday: 61 },
  relationships: { repliesReceived: 1, waitingForLawal: 1 },
  ticketing: { ordersConfirmed: 0, feeRevenueCents: 0, activations: 0 },
  system: { failures: [{ title: 'Social publishing', recovered: true }], unreadable: [] },
}

describe('the seven parts', () => {
  it("are law 25's business names, in law 25's order, one row each", () => {
    expect(morningRows(NINETEENTH).map((r) => r.area)).toEqual([...BUSINESS_AREAS])
    expect(BUSINESS_AREAS).toEqual(['Organiser Marketing', 'Event Photo Permissions', 'Social Media Marketing', 'Event Listings', 'Organiser Relationships', 'Ticketing & Revenue', 'System Operations'])
  })
  it('carry no code name, no dash, no "(s)", and every count agrees with its noun', () => {
    const words = morningRows(NINETEENTH).flatMap((r) => [r.yesterday, r.today]).join('\n')
    expect(words).not.toMatch(/\b(ACQ|PERM|SOC|LIST|RET|TKT|SYS)\b/)
    expect(words).not.toMatch(/[–—]| - |\(s\)/)
    expect(words).toContain('1 reply from organisers.')
    expect(words).toContain('3 posts published (2 on Facebook, 1 on Instagram).')
    expect(words).toContain('1 post scheduled. 8 posts held back with their reasons.')
    expect(words).toContain('1 reply waiting for you.')
    expect(words).toContain('Failed and recovered by itself: Social publishing.')
  })
  it('a quiet day says so in words, and asks nothing', () => {
    const rows = morningRows(QUIET)
    expect(rows.find((r) => r.area === 'Social Media Marketing')).toMatchObject({ yesterday: 'No posts published.', today: 'No posts scheduled.' })
    expect(rows.find((r) => r.area === 'System Operations')).toMatchObject({ yesterday: 'No failures.', today: 'Nothing needs you.' })
    expect(allWell(QUIET)).toBe(true)
  })
  it('DRILL: an area whose read failed is "not known", never a calm zero, and the morning is not all well', () => {
    const rows = morningRows({ ...QUIET, ticketing: null })
    expect(rows.find((r) => r.area === 'Ticketing & Revenue')?.yesterday).toBe('Not known: its records could not be read this morning.')
    expect(allWell({ ...QUIET, ticketing: null })).toBe(false)
  })
  it('a reply waiting for Lawal, or a failure not recovered, is never all well', () => {
    expect(allWell({ ...QUIET, relationships: { repliesReceived: 1, waitingForLawal: 1 } })).toBe(false)
    expect(allWell({ ...QUIET, system: { failures: [{ title: 'The outreach run', recovered: false }], unreadable: [] } })).toBe(false)
    expect(morningRows({ ...QUIET, system: { failures: [{ title: 'The outreach run', recovered: false }], unreadable: [] } }).at(-1)?.today).toBe('1 automation to look at; the engine page names each one.')
  })
  it("revenue is EventLinqs' own fee, in dollars, never the gross", () => {
    expect(dollars(0)).toBe('$0')
    expect(dollars(1250)).toBe('$12.50')
    const words = morningRows({ ...QUIET, ticketing: { ordersConfirmed: 2, feeRevenueCents: 1250, activations: 1 } }).find((r) => r.area === 'Ticketing & Revenue')?.yesterday
    expect(words).toBe('2 orders on EventLinqs ticketing; $12.50 in EventLinqs fees; 1 organiser sold a first ticket.')
  })
  it("a letter's area comes from its play, as production names them; anything else is counted nowhere", () => {
    expect(areaOfPlay('ACQ-FIRST: the 17 organisers of 18 November')).toBe('Organiser Marketing')
    expect(areaOfPlay('Segment A: the 14 permission letters of 18 November')).toBe('Event Photo Permissions')
    expect(areaOfPlay('A test play')).toBeNull()
  })
})

describe("Melbourne's own days", () => {
  it('yesterday and today begin at Melbourne midnight, in daylight time', () => {
    const w = windowsAt(new Date('2026-11-18T21:00:00Z')) // 08:00 on 19 November in Melbourne
    expect(w.yesterday).toEqual({ from: '2026-11-17T13:00:00.000Z', to: '2026-11-18T13:00:00.000Z' })
    expect(w.today).toEqual({ from: '2026-11-18T13:00:00.000Z', to: '2026-11-19T13:00:00.000Z' })
  })
  it('the day daylight saving begins is 23 hours long', () => {
    const w = windowsAt(new Date('2026-10-04T21:00:00Z')) // 08:00 on 5 October, the day after the change
    expect(Date.parse(w.yesterday.to) - Date.parse(w.yesterday.from)).toBe(23 * 3_600_000)
  })
})

describe('the daily email', () => {
  it('draws the seven parts first, with the engine page, and nothing on a run that did not ask for them', () => {
    const areas = { rows: morningRows(NINETEENTH), allWell: false, unreadable: [], engine: '/admin/engine' }
    const drawn = businessAreasSection(areas)
    expect(drawn).not.toBeNull()
    const section = drawn!
    expect(section.title).toBe('Your business, yesterday and today')
    expect(section.lines[0]).toBe('Organiser Marketing. Yesterday: 17 first letters sent to organisers; 0 positive replies. Today: No first letters queued, 20 short of twenty; the pool could not be read; discovery goes on.')
    expect(section.lines.at(-1)).toBe(`Every automation, run by run: ${ENGINE_PAGE}`)
    expect(businessAreasSection(null)).toBeNull()
    expect(businessAreasSection({ error: 'the platform was not reached' })?.lines).toEqual(['Not known: the platform was not reached.'])
    const rendered = renderStateReport({ generatedAt: '2026-11-18T21:00:00Z', business: { areas }, main: { conclusion: 'success', shortSha: 'd570e3cb' } })
    const titles = rendered.sections.map((s: { title: string }) => s.title)
    expect(titles.indexOf('Your business, yesterday and today')).toBeLessThan(titles.indexOf('Main'))
  })
  it('a quiet morning says it once, plainly', () => {
    const section = businessAreasSection({ rows: morningRows(QUIET), allWell: true, unreadable: [], engine: '/admin/engine' })
    expect(section?.lines[0]).toBe('Everything ran, and nothing needs you.')
  })
  it('the morning run asks for them and the hourly stall check never does; the platform reads them only when asked', () => {
    const ops = readFileSync(join(process.cwd(), 'scripts/ops/state-report.mjs'), 'utf8')
    expect(ops).toContain("morning ? 'business=1' : null")
    expect(ops).toContain('morning: !args.stall,')
    const route = readFileSync(join(process.cwd(), 'src/app/api/ops/state/route.ts'), 'utf8')
    expect(route).toContain("request.nextUrl.searchParams.get('business') === '1'")
    const wf = readFileSync(join(process.cwd(), '.github/workflows/state-report.yml'), 'utf8')
    expect(wf).toContain("- cron: '50 20 * * *'")
    expect(wf).toContain("github.event.schedule == '50 20 * * *'")
  })
})
