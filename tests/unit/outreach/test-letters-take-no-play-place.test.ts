import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * 21 November 2026: the seventh first letter of the day's play was refused at the 07:30 send run, 'the play has sent its
 * 7 for today', because the greeting test letter to eventlinqs.com rode in the same play and the cap clause counted it.
 * Migration 20261121080001 changes the clause in place (law 14 (z)); the database applies it on TEST in the gate and its
 * post-conditions read the function back. This holds the migration's own shape: the one line it replaces is the line in
 * force (read from production at 07:38: 'where play_id = pl.id and state in ('sent', 'sending') and id <> new.id'), it
 * refuses unless that line appears exactly once, and it leaves out only the sender's own test domain.
 */
const SQL = readFileSync(join(process.cwd(), 'supabase/migrations/20261121080001_outreach_test_letters_take_no_play_place.sql'), 'utf8').replace(/\r\n/g, '\n')

describe("a letter to our own test domain never takes a real organiser's place in a play's cap", () => {
  it('replaces the cap count line in force, in place, only when it appears exactly once', () => {
    expect(SQL).toContain("v_old constant text := $o$where play_id = pl.id and state in ('sent', 'sending') and id <> new.id$o$;")
    expect(SQL).toContain("pg_get_functiondef('public.outreach_touch_is_lawful()'::regprocedure)")
    expect(SQL).toMatch(/if v_count <> 1 then\s+raise exception/)
    expect(SQL).not.toMatch(/create or replace function public\.outreach_touch_is_lawful/i)
  })
  it("leaves out only letters to the sender's own test domain, and the refusals stay", () => {
    expect(SQL).toContain("lower(split_part(tc.address, '@', 2)) = lower(snd.test_domain)")
    expect(SQL).toContain("position('refused: the play has sent its % for today.' in v_def) = 0")
    expect(SQL).toContain("position('refused: the sender is in test mode and % is not at %.' in v_def) = 0")
  })
})
