import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * A FOLLOW UP READS THE FIRST LETTER OF ITS OWN SEQUENCE (the PM's 03:15 of 23 November 2026). outreach_touch_is_lawful
 * found a follow up's step before it, and the sent step 1 it counts its days from, by contact and step alone. Once the
 * duplicate key is (contact, category, context, step) a contact may hold two step 1 letters, and SELECT INTO takes
 * whichever the plan returns first. Migration 20261123020001 narrows both lookups to the same contact, category and
 * context, in place from the function in force (law 14 (z)), keeping every other check and its words. Proved on TEST in
 * one rolled back block: C:\dev\EVIDENCE\EL-23NOV\contact-policy\trigger-proof-on-test.sql and its answer.
 */

const dir = 'supabase/migrations'
const read = (f: string) => readFileSync(`${dir}/${f}`, 'utf8').replace(/\r\n/g, '\n')
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
const fixing = files.filter((f) => read(f).includes("v_old_first constant text := 'select sent_at into v_first"))
const migration = fixing.length ? read(fixing[fixing.length - 1]) : ''

describe("the lawful-touch trigger reads a follow up's own sequence", () => {
  it('one migration changes the two lookups, and it is the newest to touch them', () => {
    expect(fixing).toEqual(['20261123020001_outreach_touches_one_per_purpose_context_step.sql'])
    const later = files.filter((f) => f > fixing[0] && /outreach_touch_is_lawful/.test(read(f)))
    expect(later).toEqual([])
  })

  it('the lines it replaces are the lines the trigger was written with, untouched by the in place edits since', () => {
    const written = read('20261029210001_outreach_learning_loop.sql')
    for (const line of [
      'v_at timestamptz;',
      'if new.step > 1 then',
      "where contact_id = new.contact_id and step = new.step - 1 and state <> 'void' and id <> new.id;",
      "select sent_at into v_first from public.outreach_touches where contact_id = new.contact_id and step = 1 and state = 'sent';",
    ]) {
      expect(written.split(line).length - 1).toBe(1)
      expect(migration).toContain(line.replace(/'/g, "''"))
    }
    for (const f of ['20261119130001_outreach_reply_by_hand_recorded.sql', '20261121080001_outreach_test_letters_take_no_play_place.sql']) {
      const m = read(f).match(/v_old (?:constant )?text := (?:'([^\n]*)'|\$o\$([^\n]*)\$o\$);/)
      const v_old = m?.[1] ?? m?.[2] ?? ''
      expect(v_old.length).toBeGreaterThan(10)
      expect(v_old).not.toMatch(/v_prev|v_first|new\.step - 1|v_at timestamptz/)
    }
  })

  it('both lookups read only the same category and context, and each line is counted once before it is replaced', () => {
    const same = "and coalesce(comms_category, '''') = coalesce(v_cat, '''') and coalesce(context_key, '''') = coalesce(new.context_key, '''');"
    expect(migration).toContain(`v_new_prev constant text := 'where contact_id = new.contact_id and step = new.step - 1 and state <> ''void'' and id <> new.id\n         ${same}'`)
    expect(migration).toContain(`v_new_first constant text := 'select sent_at into v_first from public.outreach_touches where contact_id = new.contact_id and step = 1 and state = ''sent''\n         ${same}'`)
    expect(migration).toContain("v_def := pg_get_functiondef('public.outreach_touch_is_lawful()'::regprocedure);")
    expect(migration.match(/if v_count <> 1 then raise exception/g)).toHaveLength(4)
    expect(migration).toContain('execute v_def;')
    expect(migration).not.toMatch(/create or replace function public\.outreach_touch_is_lawful/i)
  })

  it("the follow up's category is read as the class trigger writes it: stored, template, by hand, thread, else ACQ", () => {
    const classTrigger = read('20261119125001_comms_categories.sql')
    expect(classTrigger).toContain("new.comms_category := split_part(new.comms_subtype, '-', 1);")
    expect(classTrigger).toContain("where o.contact_id = new.contact_id and o.id <> new.id and o.state <> 'void' and o.comms_source in ('template', 'manual')")
    expect(migration).toContain("when tg_op = ''UPDATE'' and new.comms_category is not null then new.comms_category")
    expect(migration).toContain("when new.template_id is not null then split_part(public.comms_subtype_of_template_key(tp.key), ''-'', 1)")
    expect(migration).toContain("when new.comms_source = ''manual'' and new.comms_category is not null then new.comms_category")
    expect(migration).toContain("where o.contact_id = new.contact_id and o.id <> new.id and o.state <> ''void'' and o.comms_source in (''template'', ''manual'')")
    expect(migration).toContain("order by coalesce(o.sent_at, o.drafted_at) desc nulls last limit 1), ''ACQ'')")
    // The class trigger runs after the lawful one, so the lawful one cannot read new.comms_category on an insert.
    expect('trg_outreach_touch_is_lawful' < 'trg_outreach_touch_takes_its_class').toBe(true)
  })

  it('every refusal keeps its words, and the post-conditions read them back from the function in force', () => {
    for (const words of [
      'refused: step % comes after step %.',
      'refused: step % is sent only after step % is sent.',
      'refused: step % is due from day %, this is day %.',
      'refused: this organiser is already being contacted through %.',
      'refused: the play has sent its % for today.',
    ]) {
      expect(migration).toContain(`'${words}'`)
    }
  })
})
