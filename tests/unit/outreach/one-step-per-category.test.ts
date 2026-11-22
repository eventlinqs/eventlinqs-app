import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * WHAT MAKES A MESSAGE A DUPLICATE (Lawal, 23 November 2026, 01:51, through the PM's 01:52, item 1): its purpose (its
 * category), its context (the event or campaign it is about) and its step. At 01:30 on 23 November the outreach run's
 * own log said, for all twelve organisers of Monday's law 49 cohort: "That step is already drafted or sent for this
 * contact.": each had a PERM-IMAGE letter sent at step 1, and the 28 October index allowed one non void letter per
 * contact per step whatever its purpose, so law 49's ACQ offer (also step 1) was refused. Red on main: no migration
 * scopes the index by category and context there.
 */

describe('the database keeps one letter per purpose, context and step', () => {
  const dir = 'supabase/migrations'
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  const latest = (name: RegExp) => {
    const defining = files.filter((f) => name.test(readFileSync(`${dir}/${f}`, 'utf8')))
    return readFileSync(`${dir}/${defining[defining.length - 1]}`, 'utf8').replace(/\s+/g, ' ')
  }

  it('the newest definition of the key is (contact, category, context, step) where not void, and it takes the name outreach_touches_one_per_step', () => {
    const sql = latest(/create unique index if not exists outreach_touches_one_per_purpose_context_step/i)
    expect(sql).toMatch(/add column if not exists context_key text/)
    expect(sql).toMatch(/on public\.outreach_touches \(contact_id, coalesce\(comms_category, ''\), coalesce\(context_key, ''\), step\) where state <> 'void';/)
    expect(sql).toMatch(/drop index if exists public\.outreach_touches_one_per_step;/)
    expect(sql).toMatch(/alter index if exists public\.outreach_touches_one_per_purpose_context_step rename to outreach_touches_one_per_step;/)
    // Never a moment without a unique index: both new indexes are made before the old one goes.
    expect(sql.indexOf('create unique index if not exists outreach_touches_one_per_purpose_context_step')).toBeLessThan(sql.indexOf('drop index if exists public.outreach_touches_one_per_step;'))
    expect(sql.indexOf('create unique index if not exists outreach_touches_one_per_step_without_context')).toBeLessThan(sql.indexOf('drop index if exists public.outreach_touches_one_per_step;'))
  })

  it("a message with no context keeps the rule of 28 October, so main's code, which writes none, is held as it is today while the migration runs ahead of the policy's code", () => {
    const sql = latest(/create unique index if not exists outreach_touches_one_per_step_without_context/i)
    expect(sql).toMatch(/on public\.outreach_touches \(contact_id, step\) where state <> 'void' and context_key is null;/)
  })

  it("both indexes keep the CRM's plain words, the longer name read first", () => {
    const crm = readFileSync('src/lib/outreach/crm.ts', 'utf8').replace(/\r\n/g, '\n')
    expect(crm).toContain("outreach_touches_one_per_step_without_context: 'That step is already drafted or sent for this contact.'")
    expect(crm).toContain("outreach_touches_one_per_step: 'That letter is already drafted or sent for this contact: the same purpose, about the same event or campaign, at the same step.'")
    expect(crm.indexOf('outreach_touches_one_per_step_without_context:')).toBeLessThan(crm.indexOf('outreach_touches_one_per_step:'))
  })
})
