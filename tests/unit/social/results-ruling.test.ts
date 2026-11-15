import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * THE PM'S RULING OF 16 NOVEMBER 2026, 02:25, ON LAWAL'S 01:17 (EL-M1 against the old line in results.ts, 'Likes,
 * impressions and follows are never read'): reach, saves, shares and link clicks are read once a day through the official
 * APIs and stored as signals of what to make next; never shown as a goal, never a ranking by likes alone, and 'What worked
 * this week' leads with EventLinqs clicks and paid tickets. The comment that governs what results.ts counts says exactly
 * that, and the old refusal is gone, so no window reads the superseded line as the rule.
 */
describe("results.ts says the 02:25 ruling, not the line it superseded", () => {
  const src = readFileSync(join(process.cwd(), 'src/lib/social/results.ts'), 'utf8').replace(/\r\n/g, '\n').replace(/\n \* /g, ' ')
  it('reads reach, saves, shares and link clicks once a day through the official APIs, as signals of what to make next', () => {
    expect(src).toContain('Reach, saves, shares and link clicks are read once a day through the official APIs and stored as signals of what to make next')
  })
  it("never a goal, never ranked by likes alone, and 'What worked this week' leads with clicks and paid tickets", () => {
    expect(src).toContain('they are never shown as a goal, a post is never ranked by likes alone')
    expect(src).toContain("'What worked this week' leads with EventLinqs clicks and paid tickets")
  })
  it('the superseded line is gone', () => {
    expect(src).not.toContain('Likes, impressions and follows are never read')
  })
})
