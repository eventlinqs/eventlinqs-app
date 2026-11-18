import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COMMS_CATEGORIES,
  NOTIFICATION_LIST_TYPES,
  RECORD_CLASS,
  TEMPLATE_CLASS,
  classOfNotification,
  classOfSocialPiece,
  classOfUntemplated,
  countsTowardTheTwenty,
  isCommsPair,
} from '@/lib/comms/categories'

// Law 24 (Lawal's master communications directive of 18 November 2026, section 1): one category and one subtype on
// every message record. The code's map and the migration's map are one map: this file reads the migration.
const MIGRATION = readFileSync(join(process.cwd(), 'supabase/migrations/20261118103501_comms_categories.sql'), 'utf8').replace(/\r\n/g, '\n')

function migrationTemplateMap(): Record<string, string> {
  const block = MIGRATION.slice(MIGRATION.indexOf('select m.subtype from (values'), MIGRATION.indexOf(') as m(key, subtype)'))
  return Object.fromEntries([...block.matchAll(/\('([a-z0-9_]+)', '([A-Z0-9-]+)'\)/g)].map((m) => [m[1], m[2]]))
}

/** Every template key on production, read at 10:33 on 18 November 2026 (C:/dev/EVIDENCE/EL-16NOV/market-ready/q/law24-purposes.json). */
// acq_first: the ACQ-FIRST template the ACQ go of 18 November inserts (C:/dev/EVIDENCE/EL-18NOV/go/acq-17-DRY-RUN.sql).
const PRODUCTION_KEYS = [
  'acq_first',
  'after_your_night', 'anything_coming_up', 'day10_close', 'day4_dm', 'day4_follow_up', 'dm_on_yes', 'featured', 'first_dm', 'first_invitation',
  'first_invitation_referred', 'reply_change', 'reply_cost', 'reply_existing_ticketing', 'reply_not_now', 'reply_stop', 'reply_take_down',
  'reply_who_are_you', 'reply_why_listed', 'segment_a_day10', 'segment_a_day4', 'segment_a_first', 'thank_you', 'twenty_advice', 'twenty_day10',
  'twenty_day4', 'twenty_offer', 'twenty_own_page', 'who_looks_after_events', 'withdrawal_confirmed',
]

describe('the seven communication categories (Law 24)', () => {
  it('are exactly the directive\'s seven identifiers', () => {
    expect(Object.keys(COMMS_CATEGORIES)).toEqual(['ACQ', 'PERM', 'LIST', 'SOC', 'RET', 'TKT', 'SYS'])
  })

  it('a subtype names its own category first, in capitals and hyphens', () => {
    expect(isCommsPair('ACQ', 'ACQ-FIRST')).toBe(true)
    expect(isCommsPair('PERM', 'PERM-REMINDER')).toBe(true)
    expect(isCommsPair('ACQ', 'PERM-IMAGE')).toBe(false)
    expect(isCommsPair('ACQ', 'ACQ')).toBe(false)
    expect(isCommsPair('ACQ', 'ACQ-first')).toBe(false)
    expect(isCommsPair('OUTREACH', 'OUTREACH-FIRST')).toBe(false)
  })

  it('every template on production has one class, and every class is a true pair', () => {
    for (const key of PRODUCTION_KEYS) {
      const c = TEMPLATE_CLASS[key]
      expect(c, key).toBeDefined()
      expect(isCommsPair(c.category, c.subtype), `${key}: ${c.subtype}`).toBe(true)
    }
    expect(Object.keys(TEMPLATE_CLASS).sort()).toEqual([...PRODUCTION_KEYS].sort())
  })

  it('the migration holds the same template map as the code, key for key', () => {
    const sql = migrationTemplateMap()
    expect(Object.keys(sql).sort()).toEqual(Object.keys(TEMPLATE_CLASS).sort())
    for (const [key, c] of Object.entries(TEMPLATE_CLASS)) expect(sql[key], key).toBe(c.subtype)
  })

  it('segment A asks a listed organiser for an image: PERM, never acquisition, never toward the 20', () => {
    expect(TEMPLATE_CLASS.segment_a_first).toEqual({ category: 'PERM', subtype: 'PERM-IMAGE' })
    expect(TEMPLATE_CLASS.segment_a_day4.subtype).toBe('PERM-REMINDER')
    expect(countsTowardTheTwenty(TEMPLATE_CLASS.segment_a_first)).toBe(false)
  })

  it('the 20 a business day counts an acquisition first letter only', () => {
    const counted = Object.entries(TEMPLATE_CLASS).filter(([, c]) => countsTowardTheTwenty(c)).map(([k]) => k).sort()
    expect(counted).toEqual(['acq_first', 'first_dm', 'first_invitation', 'first_invitation_referred', 'twenty_advice', 'twenty_offer', 'twenty_own_page', 'who_looks_after_events'])
    expect(countsTowardTheTwenty({ category: 'ACQ', subtype: 'ACQ-FOLLOWUP' })).toBe(false)
  })

  it('a message with no template keeps its thread\'s category, else the CRM default by step and purpose, as the trigger does', () => {
    const perm = { category: 'PERM' as const, subtype: 'PERM-IMAGE' }
    expect(classOfUntemplated({ purpose: 'cadence', step: 1, thread: perm })).toEqual(perm)
    expect(classOfUntemplated({ purpose: 'cadence', step: 2, thread: perm })).toEqual({ category: 'PERM', subtype: 'PERM-REMINDER' })
    expect(classOfUntemplated({ purpose: 'reply', step: null, thread: perm })).toEqual({ category: 'PERM', subtype: 'PERM-REPLY' })
    expect(classOfUntemplated({ purpose: 'cadence', step: 3, thread: { category: 'ACQ', subtype: 'ACQ-FIRST' } })).toEqual({ category: 'ACQ', subtype: 'ACQ-FOLLOWUP' })
    expect(classOfUntemplated({ purpose: 'cadence', step: 1, thread: null })).toEqual({ category: 'ACQ', subtype: 'ACQ-FIRST' })
    expect(classOfUntemplated({ purpose: 'cadence', step: 2, thread: null })).toEqual({ category: 'ACQ', subtype: 'ACQ-FOLLOWUP' })
    expect(classOfUntemplated({ purpose: 'reply', step: null, thread: null })).toEqual({ category: 'ACQ', subtype: 'ACQ-REPLY' })
    expect(classOfUntemplated({ purpose: 'relationship', step: null, thread: null })).toEqual({ category: 'RET', subtype: 'RET-RELATIONSHIP' })
    // The trigger's own words for the same rules.
    for (const words of ["when new.purpose = 'reply' then v_cat || '-REPLY'", "case when v_cat = 'PERM' then '-REMINDER' else '-FOLLOWUP' end",
      "when new.purpose = 'relationship' then 'RET-RELATIONSHIP'", "when coalesce(new.step, 1) > 1 then 'ACQ-FOLLOWUP'", "else 'ACQ-FIRST' end"]) {
      expect(MIGRATION, words).toContain(words)
    }
  })

  it('a social piece is SOC by its kind, in the code and in the generated column', () => {
    expect(classOfSocialPiece('daily_poster')).toEqual({ category: 'SOC', subtype: 'SOC-DAILY-POSTER' })
    expect(classOfSocialPiece('tonight_tomorrow').subtype).toBe('SOC-TONIGHT-TOMORROW')
    expect(MIGRATION).toContain("comms_subtype text generated always as ('SOC-' || upper(replace(kind, '_', '-'))) stored")
  })

  it('the reports, digests and founder notices carry one class each, the same in the migration', () => {
    for (const [table, c] of Object.entries(RECORD_CLASS)) {
      expect(isCommsPair(c.category, c.subtype), table).toBe(true)
      expect(MIGRATION, table).toContain(`alter table public.${table}\n  add column if not exists comms_category text not null default '${c.category}',\n  add column if not exists comms_subtype text not null default '${c.subtype}';`)
    }
  })

  it('an attendee alert is LIST and a performer notice is SYS, the same list in the migration', () => {
    expect(classOfNotification('tonight')).toEqual({ category: 'LIST', subtype: 'LIST-TONIGHT' })
    expect(classOfNotification('gig_posted')).toEqual({ category: 'SYS', subtype: 'SYS-GIG-POSTED' })
    const list = `type in (${NOTIFICATION_LIST_TYPES.map((t) => `'${t}'`).join(', ')})`
    expect(MIGRATION.split(list).length - 1).toBe(2)
  })
})
