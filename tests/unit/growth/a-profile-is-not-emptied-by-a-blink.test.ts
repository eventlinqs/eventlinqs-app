import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  wholeResultBindings,
} from '../../../scripts/guards/lib/whole-result-bindings.mjs'
import {
  SCOPE,
  DOORS,
  awaitedDestructures,
} from '../../../scripts/guards/a-failed-read-is-not-a-fact-about-a-person.mjs'

/**
 * A REAL ORGANISER'S PROFILE MAY NOT PUBLISH AN EMPTY CATALOGUE BECAUSE A
 * SOCKET DROPPED.
 *
 * `/organisers/[handle]` is the page an organiser sends their own audience to.
 * Both of its event reads coalesced a failed read to `[]`, and the page then
 * renders, under the organiser's own name, "No upcoming events from <name> just
 * yet." A statement about somebody's business, published to the people they
 * invited, at HTTP 200 so nothing on the platform notices. The venue profile
 * carried the identical pair plus the rail of venues near it.
 *
 * THE FILE IS WHERE THE DOOR WAS BORN, which is why the regression matters more
 * than usual. `src/lib/supabase/read-or-throw.ts` names "the organiser profile
 * (twice)" as the first two occurrences of this family and exists so that "the
 * fifth occurrence has nowhere to happen". Those two were the DESTRUCTURE
 * spelling and were fixed on 12 September 2026. These two were the
 * whole-response spelling, nine lines apart in the same function, and survived
 * because no matcher in the tree could see them.
 *
 * WHAT THESE TESTS CAN AND CANNOT DECIDE. A Next.js page's data functions are
 * module-private, so they cannot be called from here. What CAN be decided is
 * the judgement (does any read in these files publish a failure as an absence)
 * and the propagation (is there anything between the door and the caller that
 * would swallow a throw). Both are asserted through the guard's own matchers
 * rather than by grepping for `readOrThrow`, so these are about the rule and
 * not about a spelling. The pages themselves are driven in a browser at 390,
 * 768 and 1440 by scripts/verify/a-profile-is-not-emptied-drive.mjs.
 */

const ROOT = join(__dirname, '..', '..', '..')
const PROFILES = ['src/app/organisers/[handle]/page.tsx', 'src/app/venues/[handle]/page.tsx']
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

type Binding = { name: string; handled: boolean; line: number }

describe('the two public profiles publish no failure as an absence', () => {
  it.each(PROFILES)('%s binds no response whose error goes unread', (rel) => {
    const found = (wholeResultBindings(read(rel), DOORS) as Binding[]).filter((b) => !b.handled)
    expect(found).toEqual([])
  })

  it.each(PROFILES)('%s destructures no response without binding its error', (rel) => {
    const found = (awaitedDestructures(read(rel)) as { handled: boolean }[]).filter((d) => !d.handled)
    expect(found).toEqual([])
  })

  /*
   * NOT VACUOUS. Both files must still CONTAIN reads for the assertions above to
   * mean anything: a file with no reads at all passes them perfectly.
   */
  it.each(PROFILES)('%s still reads the database, so the two above are not vacuous', (rel) => {
    const source = read(rel)
    expect(source).toMatch(/\.from\(/)
    const doored = DOORS.reduce(
      (total: number, door: string) =>
        total + [...source.matchAll(new RegExp(`\\b${door}\\s*[(<]`, 'g'))].length,
      0,
    )
    // Two on the organiser (upcoming, past) and three on the venue (those two
    // plus the rail of venues near it). Two is the floor both must clear.
    expect(doored).toBeGreaterThanOrEqual(2)
  })
})

describe('a throw from the door reaches the reader', () => {
  /*
   * A DOOR THAT THROWS INSIDE A `try` IS A DOOR THAT DOES NOTHING. The fix is
   * only worth anything if the raise propagates: `read-or-throw.ts` answers 500
   * and a 500 says "ask again", where the empty catalogue said something false
   * and permanent. Anything that caught it here would put the empty rail back
   * while leaving every other check in this file green.
   */
  it.each([
    ['src/app/organisers/[handle]/page.tsx', 'async function fetchOrganiserEvents'],
    ['src/app/venues/[handle]/page.tsx', 'async function fetchVenueEventsByName'],
    ['src/app/venues/[handle]/page.tsx', 'async function fetchSimilarVenues'],
  ])('%s: %s does not swallow it', (rel, signature) => {
    const source = read(rel)
    const start = source.indexOf(signature)
    expect(start, `${signature} is not in ${rel}`).toBeGreaterThan(-1)
    const body = source.slice(start, source.indexOf('\n}', start))
    expect(body).toContain('readOrThrow')
    expect(body).not.toMatch(/\btry\s*\{/)
    expect(body).not.toMatch(/\.catch\s*\(/)
  })
})

describe('the guard scope says what each failure would publish', () => {
  const entries = SCOPE as [string, string][]

  it.each(['src/app/organisers', 'src/app/venues'])('%s is in the guard scope', (dir) => {
    expect(entries.map((e) => e[0])).toContain(dir)
  })

  /*
   * THE SECOND COLUMN IS THE POINT OF THE LIST. A directory added with a vague
   * consequence is a directory nobody can argue about later, and this guard's
   * whole case for judging src/app at all is what those two pages SAY.
   */
  it('the organiser entry names the sentence the page would print', () => {
    const entry = entries.find((e) => e[0] === 'src/app/organisers')
    expect(entry?.[1]).toMatch(/No upcoming events/)
  })

  it('every scope entry carries a consequence, not just a path', () => {
    for (const [dir, becomes] of entries) {
      expect(becomes, `${dir} has no consequence sentence`).toBeTruthy()
      expect(becomes.length, `${dir}'s consequence is too short to mean anything`).toBeGreaterThan(30)
    }
  })
})

describe('the empty state the defect impersonated is real and still there', () => {
  /*
   * The scope entry claims the page prints "No upcoming events from <name> just
   * yet". If that sentence ever left the file, the entry would be describing a
   * consequence that no longer exists, and the argument for guarding this
   * directory would have quietly evaporated.
   */
  it('the organiser profile still carries the sentence a blink used to trigger', () => {
    expect(read('src/app/organisers/[handle]/page.tsx')).toContain('No upcoming events from')
  })
})
