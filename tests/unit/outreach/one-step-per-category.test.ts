import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * ONE LETTER PER STEP PER CATEGORY (the PM's 23:56 of 22 November 2026; Lawal's 01:20, item 9). At 01:30 on 23 November the
 * outreach run's own log said, for all twelve organisers of Monday's law 49 cohort: "That step is already drafted or sent
 * for this contact.": each had a PERM-IMAGE letter sent at step 1, and the 28 October index allowed one non void letter per
 * contact per step whatever its category, so law 49's ACQ offer (also step 1) was refused. Red on main: no migration scopes
 * the index by category there.
 */

describe('the database keeps one letter per step per communication category', () => {
  const dir = 'supabase/migrations'
  const latest = (() => {
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    const defining = files.filter((f) => /create unique index[^;]*outreach_touches_one_per_step/i.test(readFileSync(`${dir}/${f}`, 'utf8')))
    return defining[defining.length - 1]
  })()

  it("the newest definition of outreach_touches_one_per_step is scoped by the letter's category", () => {
    const sql = readFileSync(`${dir}/${latest}`, 'utf8')
    expect(sql).toMatch(/drop index if exists public\.outreach_touches_one_per_step;/)
    expect(sql).toMatch(/on public\.outreach_touches \(contact_id, coalesce\(comms_category, ''\), step\)\s*where state <> 'void';/)
  })

  it('the index keeps its name, so the CRM still says the database\'s own words', () => {
    const crm = readFileSync('src/lib/outreach/crm.ts', 'utf8')
    expect(crm).toContain("outreach_touches_one_per_step: 'That step is already drafted or sent for this contact.'")
  })
})
