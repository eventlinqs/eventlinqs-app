import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { reachWords } from '@/lib/organisers/reach-words'
import { organiserUpdateWords } from '@/lib/organisers/update-words'

/*
 * THE CONTROLLER'S 02:20 OF 6 NOVEMBER 2026: car 45 item 3 reached the organiser profile but not /organisers, which still
 * promised, read on live, 'Every event you list goes into the discovery feed and out through push alerts', 'Push alerts
 * land on lock screens, not in spam folders', 'Followers get every event you publish, automatically'. With
 * broadcast_digest and broadcast_follow off, no customer facing string promises push alerts or follower notifications.
 * The promises live in ONE place, src/lib/organisers/reach-words.ts (and the profile's update-words.ts), each chosen by
 * the two flags, so they come back by themselves the day the flags turn on.
 */
const PROMISE = /push alerts?|lock screens?|get notified|notified (when|the moment)|followers get|follows you gets|can be alerted|discovery feed|follow graph/i

describe('the words with the broadcasts off promise nothing that is not running', () => {
  it('the organiser landing, its FAQ answer and a venue page (reachWords)', () => {
    const w = reachWords(false)
    for (const s of [w.heroLine, w.bandBody, ...w.bandPoints, w.objectionTail, w.venueEmpty('Costa Hall'), ...w.venuePillars]) expect(s, s).not.toMatch(PROMISE)
    expect(w.venuePillars.join(' ')).not.toMatch(/unsubscribe/i)
  })
  it('an organiser profile (organiserUpdateWords)', () => {
    const w = organiserUpdateWords('AMCF', false)
    for (const s of [w.emptySubhead, w.panelLine, w.bioLine, w.emptyAction, ...w.pillars]) expect(s, s).not.toMatch(PROMISE)
  })
  it('with the broadcasts on, the landing keeps its promises word for word', () => {
    const w = reachWords(true)
    expect(w.bandPoints).toContain('Push alerts land on lock screens, not in spam folders')
    expect(w.bandPoints).toContain('Followers get every event you publish, automatically')
  })
})

/** Every customer facing source file, read as text; comments are not copy. */
function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* sourceFiles(p)
    else if (/\.(ts|tsx)$/.test(name)) yield p
  }
}
// The one gated source, the profile's gated words, versioned legal text (never edited, a new dated version is), the
// admin and server-only areas a customer never reads, and ONE named open item: the signed-in /account/notifications
// controls, whose push and email alerts are a subscription a person sets up (what they deliver while both flags are off
// is put to the CONTROLLER, 6 November).
const ALLOWED = [
  /^src\/lib\/organisers\/reach-words\.ts$/,
  /^src\/lib\/organisers\/update-words\.ts$/,
  /^src\/app\/legal\//,
  /^src\/app\/admin\//,
  /^src\/app\/api\//,
  /^src\/lib\/flags\//,
  /^src\/lib\/health\//,
  /^src\/components\/notifications\/enable-alerts\.tsx$/,
  /^src\/app\/account\/notifications\//,
]

describe('no other customer facing string promises an alert (the guard)', () => {
  it('names every file that still does, outside the gated sources', () => {
    const root = process.cwd()
    const found: string[] = []
    for (const file of sourceFiles(join(root, 'src'))) {
      const rel = relative(root, file).replace(/\\/g, '/')
      if (ALLOWED.some((a) => a.test(rel))) continue
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        const t = line.trim()
        if (/^(\/\/|\*|\/\*|\{\/\*)/.test(t)) return
        if (PROMISE.test(line)) found.push(`${rel}:${i + 1}: ${t.slice(0, 120)}`)
      })
    }
    expect(found).toEqual([])
  })
})
