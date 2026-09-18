import { describe, expect, test } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { writesIn, setsField, judgeDrive, BASELINE, PREMISES } from '../../../scripts/guards/fixtures-are-not-published.mjs'
import { venueHandle, SITEMAP_EVENT_MATCH, SITEMAP_ORGANISER_STATUS, laneFixturesStillPublished } from '../../../scripts/verify/lib/sitemap-footprint.mjs'
import { PUBLIC_EVENT_MATCH } from '@/lib/events/public-visibility'
import { venueSlugify } from '@/lib/venues/resolver'

const ROOT = join(__dirname, '..', '..', '..')

/**
 * THE RULE THESE TESTS HOLD, and why it is worth holding twice.
 *
 * A fixture that is `active`/`public` on the shared TEST database is published
 * by src/app/sitemap.ts and then deleted by the drive that made it, which is how
 * lane B's PL1 drive refused lane A's push on 14 September 2026 with two RULE 2
 * faults on URLs lane A had never heard of.
 *
 * The guard reads the drives; scripts/verify/lib/sitemap-footprint.mjs asks the
 * database. These tests hold the first one honest in milliseconds, and hold the
 * second one to the product's own definitions rather than to a copy that can
 * quietly drift.
 */
describe('writesIn', () => {
  test('reads the table, the method and the literal of a chained write', () => {
    const found = writesIn("await db.from('organisations').insert({ slug: 'x', status: 'pending' })")
    expect(found).toHaveLength(1)
    expect(found[0].table).toBe('organisations')
    expect(found[0].method).toBe('insert')
    expect(setsField(found[0].literal, 'status', 'pending')).toBe(true)
  })

  test('a SELECT on one table is not credited with the INSERT on the next', () => {
    const src = [
      "const { data } = await db.from('cities').select('slug').limit(1)",
      "await db.from('organisations').insert({ status: 'active' })",
    ].join('\n')
    const found = writesIn(src)
    expect(found.map((w: { table: string }) => w.table)).toEqual(['organisations'])
  })

  test('a write built from a variable comes back unjudgeable rather than clean', () => {
    const found = writesIn("await db.from('organisations').insert(rows)")
    expect(found).toHaveLength(1)
    expect(found[0].literal).toBeNull()
  })

  test('a comment describing the defect is not the defect', () => {
    const src = [
      "/* this fixture used to say status: 'active' and it published an organiser page */",
      "await db.from('organisations').insert({ status: 'pending' })",
    ].join('\n')
    expect(judgeDrive('example-drive.mjs', src)).toEqual([])
  })
})

describe('judgeDrive', () => {
  test("names a fixture event created 'public', wherever the literal sits", () => {
    // Built as a free-standing row and inserted by name further down: the shape
    // the first version of this guard reported as clean.
    const src = [
      "const rows = [{ status: 'published', visibility: 'public', slug: 'x' }]",
      "await db.from('events').insert(rows)",
    ].join('\n')
    const problems = judgeDrive('example-drive.mjs', src)
    expect(problems).toHaveLength(1)
    expect(problems[0].write).toBe("events.visibility='public'")
    expect(problems[0].message).toContain('/venues/<handle>')
  })

  test("names a fixture organisation created 'active'", () => {
    const problems = judgeDrive('example-drive.mjs', "await db.from('organisations').insert({ status: 'active' })")
    expect(problems).toHaveLength(1)
    expect(problems[0].write).toBe("organisations.status='active'")
  })

  test('names an organisations write it cannot read, instead of passing it', () => {
    const problems = judgeDrive('example-drive.mjs', "await db.from('organisations').insert(row)")
    expect(problems).toHaveLength(1)
    expect(problems[0].message).toContain('cannot see')
  })

  test("an UPDATE that re-publishes a fixture organisation counts as creating one", () => {
    const problems = judgeDrive('example-drive.mjs', "await db.from('organisations').update({ status: 'active' }).eq('id', id)")
    expect(problems).toHaveLength(1)
  })

  /*
   * THE FALSE POSITIVE THIS GUARD WAS NEARLY BORN WITH. `status: 'active'` is a
   * legitimate value on several tables, and discount-claim-drive writes exactly
   * that on a `reservations` row. A first draft of the baseline excused that
   * drive, having grepped for the string rather than read the call; the guard
   * itself reported the excuse as matching nothing, which is what a printed
   * baseline is for.
   */
  test("a reservation created 'active' is not an organiser profile", () => {
    expect(judgeDrive('example-drive.mjs', "await db.from('reservations').insert({ status: 'active' })")).toEqual([])
  })

  test('every drive in the tree is clean or on the printed baseline', () => {
    const dir = join(ROOT, 'scripts', 'verify')
    const drives = readdirSync(dir).filter((f) => f.endsWith('-drive.mjs'))
    expect(drives.length).toBeGreaterThan(20)
    const offenders = drives.flatMap((f) => judgeDrive(f, readFileSync(join(dir, f), 'utf8')))
    /*
     * THE EXCUSED SET IS READ OUT OF THE GUARD'S OWN BASELINE, never named here.
     * This test used to name two drives by hand, and on 17 September 2026 the
     * baseline grew two more for lane C's SEO drives: the guard passed and this
     * test failed about the identical tree, which is a disagreement between two
     * copies of one list rather than a finding about the product.
     */
    const excused = new Set((BASELINE as { drive: string }[]).map((b) => b.drive))
    const unexcused = offenders.filter((p: { drive: string }) => !excused.has(p.drive))
    expect(unexcused).toEqual([])
  })
})

describe('the runtime half asks the same question as the product', () => {
  test('SITEMAP_EVENT_MATCH is PUBLIC_EVENT_MATCH, value for value', () => {
    expect(SITEMAP_EVENT_MATCH).toEqual({ ...PUBLIC_EVENT_MATCH })
  })

  /*
   * RE-AIMED 17 September 2026. This used to assert the organiser predicate
   * against src/app/sitemap.ts by name. The three catalogue reads moved into
   * src/lib/seo/sitemap-catalogue.ts when lane C's SEO2 arrived, the guard's
   * PREMISES list was re-aimed at the new address, and this hand-written copy
   * was not, so it failed pointing at a file that no longer holds the predicate.
   *
   * It now walks the guard's own PREMISES, so the guard and the test can never
   * be aimed at different files again, and the organiser status is still checked
   * against the product's own constant on top of that.
   */
  test('every premise the guard depends on still matches where the guard says it lives', () => {
    const premises = PREMISES as { file: string; needle: string; why: string }[]
    expect(premises.length).toBeGreaterThan(0)
    for (const premise of premises) {
      expect(readFileSync(join(ROOT, premise.file), 'utf8'), `${premise.file} no longer contains ${premise.needle}`).toContain(
        premise.needle,
      )
    }
  })

  test("the organiser predicate the premises pin is the status this copy names", () => {
    const premises = PREMISES as { file: string; needle: string }[]
    const organiser = premises.find((p) => p.needle.includes("'status'"))
    expect(organiser, 'no premise pins the organiser status any more').toBeDefined()
    expect(organiser!.needle).toBe(`.eq('status', '${SITEMAP_ORGANISER_STATUS}')`)
  })

  test('venueHandle is venueSlugify, on every venue name lane B fixtures use', () => {
    const names = [
      'Lane B PL1 warehouse',
      'Lane B GA1v3 room',
      'Lane B GA2 room',
      'Lane B GA3 room',
      'Lane B GA3 other room',
      'Lane B GA4 warehouse',
      'Lane B GA5 warehouse',
      "St Kilda's Palais & Gardens",
      '  leading and trailing  ',
    ]
    for (const name of names) expect(venueHandle(name)).toBe(venueSlugify(name))
  })
})

describe('laneFixturesStillPublished refuses before it reads', () => {
  /*
   * THE RULE IT ENFORCES IS THE BRIEF'S: a lane never reads, edits or deletes
   * another lane's rows. This is the sweep's only safety catch, so it is held
   * in both directions rather than trusted.
   */
  /*
   * `undefined` is in this list on purpose and it is why the parameter is typed
   * loosely here: the JSDoc on the .mjs says `string`, and the case that matters
   * most is the caller who passes nothing at all.
   */
  test.each(['', 'lane-', 'ga5-', '%', 'lane-d-ga5-', undefined as unknown as string])('refuses %o', async (prefix) => {
    await expect(laneFixturesStillPublished(null, prefix)).rejects.toThrow(/lane prefix is required/)
  })

  test('accepts a lane prefix and gets as far as the database', async () => {
    // No client is passed, so the first read throws. Reaching that throw is the
    // proof that the prefix was accepted; the message tells the two apart.
    await expect(laneFixturesStillPublished(null, 'lane-b-ga5-')).rejects.not.toThrow(/lane prefix is required/)
  })
})
