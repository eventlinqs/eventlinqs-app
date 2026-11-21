import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * NO ROUTE INTO THE PUBLISHER SKIPS THE GATE (P0 section 3, the PM's 22:02 of 17 November 2026, item 3 (b): "Every route
 * into Blotato goes through it. It is checked by a guard that fails if any publish path skips it"). Read from the source:
 * the publisher is made in one place, called by one run, and that run checks every piece through pieceDependencies, which
 * carries pieceQuality; scheduling and draft save carry the same rules.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const bodyOf = (src: string, start: string) => {
  const from = src.indexOf(start)
  if (from < 0) return ''
  const next = src.indexOf('\nexport ', from + start.length)
  return src.slice(from, next < 0 ? undefined : next)
}
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|mts|mjs)$/.test(name) ? [p] : []
  })

describe('the publish gate is on every route', () => {
  const store = read('src/lib/social/store.ts')

  it('approval and publishing check every piece through pieceDependencies, which runs pieceQuality', () => {
    expect(bodyOf(store, 'export async function pieceDependencies(')).toMatch(/pieceQuality\(/)
    expect(bodyOf(store, 'export async function approvePieceChecked(')).toMatch(/pieceDependencies\(/)
    const publish = bodyOf(store, 'export async function publishDuePieces(')
    expect(publish).toMatch(/pieceDependencies\(/)
    expect(publish.indexOf('pieceDependencies(')).toBeLessThan(publish.indexOf('publisher('))
  })

  it('scheduling and draft save carry the same rules', () => {
    expect(bodyOf(store, 'export async function scheduleApprovedPieces(')).toMatch(/pieceQuality\(/)
    // Destination first, before a slot is kept (law 28 (d); the PM's 20:50 item 2): each platform's fit, as publishing reads it.
    const schedule = bodyOf(store, 'export async function scheduleApprovedPieces(')
    expect(schedule).toMatch(/slidesMisfit\(d\.rev\.slides, platform/)
    expect(schedule.indexOf('slidesMisfit(')).toBeLessThan(schedule.indexOf('scheduled.push('))
    expect(schedule).toMatch(/\.eq\('platform', platform\)/)
    // A partner kit is never given a slot on our account (the PM's 23:09 of 18 November 2026).
    // The kind decides the partner kit; the moment (train AI-2, law 37 (l)) binds a lifecycle piece to its day.
    expect(schedule).toMatch(/select\('format, kind, moment_key'\)/)
    expect(schedule).toMatch(/if \(String\(piece\.kind\) === 'partner_kit'\) continue/)
    expect(schedule.indexOf("=== 'partner_kit') continue")).toBeLessThan(schedule.indexOf('due.push('))
    expect(bodyOf(store, 'export async function editPiece(')).toMatch(/languageFaults\(/)
  })

  // Caption standard version 2's marks, one rule (caption-marks.ts; the emoji gate of the PM's 21:00 of 18 November 2026):
  // drawing, the founder's edit and the hourly corrections read every mark; approval and publishing read the two that were
  // holds before (law 22 as amended keeps the gate to essential protection).
  it('every place a caption is judged reads caption standard version 2 marks', () => {
    const campaign = read('src/lib/social/campaign.ts')
    expect(bodyOf(campaign, 'export function pieceRefusal(')).toMatch(/captionMarkFaults\(/)
    expect(bodyOf(campaign, 'export function creativeRefusals(')).toMatch(/captionMarkFaults\([^)]*\)\.filter\(holdsAtPublishing\)/)
    expect(bodyOf(store, 'export async function editPiece(')).toMatch(/captionMarkFaults\(/)
    expect(bodyOf(read('src/lib/social/piece-quality.ts'), 'export function pieceCorrections(')).toMatch(/captionMarkFaults\(/)
    // No route keeps its own exclamation rule beside the one rule.
    for (const f of ['src/lib/social/campaign.ts', 'src/lib/social/store.ts']) expect(read(f)).not.toMatch(/\/\[!\\u2013\\u2014\]\//)
  })

  it('the publisher is made only in meta-wiring.ts and run only by publishDuePieces', () => {
    const src = files(join(process.cwd(), 'src')).map((f) => ({ f: relative(process.cwd(), f).replace(/\\/g, '/'), t: readFileSync(f, 'utf8') }))
    const makers = src.filter(({ f, t }) => /make(Blotato|Meta)Publisher\(/.test(t) && !/src\/lib\/social\/(blotato|meta)-publisher\.ts$/.test(f)).map(({ f }) => f)
    expect(makers).toEqual(['src/lib/social/meta-wiring.ts'])
    const runners = src.filter(({ t }) => /socialPublisherFromEnv\(/.test(t)).map(({ f }) => f).filter((f) => f !== 'src/lib/social/meta-wiring.ts')
    expect(runners).toEqual(['src/app/api/cron/social-publish/route.ts'])
    const route = read('src/app/api/cron/social-publish/route.ts')
    expect(route).toMatch(/publishDuePieces\(/)
    // The post now for one night (22 November 2026) is the run's own mode, never an admin press (Lawal's 01:23): it hands
    // the one publisher to postNightNow, which runs it only through publishDuePieces.
    const postNow = route.slice(route.indexOf("searchParams.get('post') === 'now'"), route.indexOf('\n  }\n', route.indexOf("searchParams.get('post') === 'now'")))
    expect(postNow).toMatch(/postNightNow\(db, \{[^}]*publisher: socialPublisherFromEnv\(db, now\)/)
    expect(route.indexOf("searchParams.get('post') === 'now'")).toBeGreaterThan(route.indexOf('requireCronAuth(request)'))
    const store = read('src/lib/social/store.ts')
    expect(store.slice(store.indexOf('export async function postNightNow('))).toMatch(/await publishDuePieces\(db, input\.now, \{ siteOrigin: input\.siteOrigin, publisher: input\.publisher/)
  })
})
