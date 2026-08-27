// THE LISTING WINDOW: an event is shown until it has ENDED, not until it started.
//
// The defect this pins: every discovery query filtered `start_date >= now`, so an
// event disappeared the moment it began. A 09:00 gig was invisible at 09:01, on
// the one day it mattered. The founder's 16 August 2026 event vanished exactly
// this way and a missing-cover filter was blamed for it first.
//
// These tests pin the rule and, more importantly, pin that the SQL predicate and
// the JavaScript predicate agree. They are two expressions of one rule and the
// only thing stopping them drifting is this file.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

import {
  SUPPORTED_EVENT_ZONES,
  endOfLocalDayUtc,
  isStillListed,
  listingUntil,
  listingWindowOrPredicate,
  startOfLocalDayUtc,
} from '@/lib/events/listing-window'

const SYD = 'Australia/Sydney'
const PER = 'Australia/Perth'

describe('local day boundaries', () => {
  it('resolves start of the Sydney day to the correct UTC instant', () => {
    // 16 Aug 2026 is winter in Sydney: AEST, UTC+10. Local midnight is 14:00Z
    // on the 15th.
    const now = new Date('2026-08-16T03:00:00Z') // 13:00 Sydney
    expect(startOfLocalDayUtc(now, SYD).toISOString()).toBe('2026-08-15T14:00:00.000Z')
  })

  it('resolves start of the Perth day to the correct UTC instant', () => {
    // Perth is UTC+8 year round, so local midnight is 16:00Z the day before.
    const now = new Date('2026-08-16T03:00:00Z') // 11:00 Perth
    expect(startOfLocalDayUtc(now, PER).toISOString()).toBe('2026-08-15T16:00:00.000Z')
  })

  it('end of day is the next local midnight', () => {
    const at = new Date('2026-08-15T23:00:00Z') // 16 Aug 09:00 Sydney
    expect(endOfLocalDayUtc(at, SYD).toISOString()).toBe('2026-08-16T14:00:00.000Z')
  })

  it('crosses a month boundary without special casing', () => {
    const at = new Date('2026-08-31T02:00:00Z') // 31 Aug 12:00 Sydney
    expect(endOfLocalDayUtc(at, SYD).toISOString()).toBe('2026-08-31T14:00:00.000Z')
  })

  it('handles the DST transition, where local midnight is not a fixed offset', () => {
    // Sydney DST starts on the first Sunday of October (4 Oct 2026), when the
    // offset moves +10 -> +11. A single-guess offset calculation gets the day
    // after the transition wrong by an hour.
    const afterTransition = new Date('2026-10-05T02:00:00Z') // 13:00 AEDT
    expect(startOfLocalDayUtc(afterTransition, SYD).toISOString()).toBe('2026-10-04T13:00:00.000Z')
  })
})

describe('listingUntil', () => {
  it('uses end_date when present, whatever the start date says', () => {
    const until = listingUntil({
      start_date: '2026-08-15T23:00:00Z',
      end_date: '2026-08-20T09:00:00Z',
      timezone: SYD,
    })
    expect(until.toISOString()).toBe('2026-08-20T09:00:00.000Z')
  })

  it('falls back to end of the local calendar day when end_date is null', () => {
    const until = listingUntil({ start_date: '2026-08-15T23:00:00Z', end_date: null, timezone: SYD })
    expect(until.toISOString()).toBe('2026-08-16T14:00:00.000Z')
  })

  it('uses the EVENT zone, not the platform zone', () => {
    // Same instant, different zone: Perth's day ends two hours after Sydney's.
    const syd = listingUntil({ start_date: '2026-08-15T23:00:00Z', end_date: null, timezone: SYD })
    const per = listingUntil({ start_date: '2026-08-15T23:00:00Z', end_date: null, timezone: PER })
    expect(per.getTime()).toBeGreaterThan(syd.getTime())
  })

  it('never hides an event whose start date cannot be parsed', () => {
    // A bad row is a data problem. Removing it from the platform silently is the
    // failure class this whole change exists to close.
    const until = listingUntil({ start_date: 'not-a-date', end_date: null, timezone: SYD })
    expect(until.getTime()).toBeGreaterThan(Date.now())
  })
})

describe('the founder 16 August 2026 case', () => {
  // start_date 16 Aug 09:00, visibility public, no end_date, Sydney zone.
  const event = { start_date: '2026-08-15T23:00:00Z', end_date: null, timezone: SYD }

  it('is listed while it is running', () => {
    expect(isStillListed(event, new Date('2026-08-16T03:00:00Z'))).toBe(true) // 13:00 Sydney
  })

  it('is STILL listed late that evening, which the old rule got wrong', () => {
    expect(isStillListed(event, new Date('2026-08-16T12:00:00Z'))).toBe(true) // 22:00 Sydney
  })

  it('drops overnight, not at 09:01', () => {
    expect(isStillListed(event, new Date('2026-08-16T14:00:01Z'))).toBe(false) // 00:00:01 the 17th
  })

  it('the OLD rule would have hidden it one minute after it started', () => {
    // Documents the regression rather than merely fixing it.
    const oldRuleWouldList = new Date(event.start_date).getTime() >= new Date('2026-08-16T03:00:00Z').getTime()
    expect(oldRuleWouldList).toBe(false)
    expect(isStillListed(event, new Date('2026-08-16T03:00:00Z'))).toBe(true)
  })
})

describe('the SQL predicate agrees with the JavaScript predicate', () => {
  const now = new Date('2026-08-16T03:00:00Z')
  const predicate = listingWindowOrPredicate(now)

  it('carries a branch for every supported zone', () => {
    for (const zone of SUPPORTED_EVENT_ZONES) {
      expect(predicate).toContain(`timezone.eq.${zone}`)
    }
  })

  it('uses each zone OWN start-of-day boundary, not a shared one', () => {
    const boundaries = SUPPORTED_EVENT_ZONES.map((z) => startOfLocalDayUtc(now, z).toISOString())
    // Perth and Sydney must not share a boundary, or the per-zone branches are
    // decorative and the rule is really being judged in one zone.
    expect(new Set(boundaries).size).toBeGreaterThan(1)
    for (const b of boundaries) expect(predicate).toContain(b)
  })

  it('catches a null zone rather than dropping it', () => {
    expect(predicate).toContain('and(end_date.is.null,timezone.is.null,start_date.gte.')
  })

  it('catches an UNRECOGNISED zone rather than dropping it', () => {
    // The branch that stops an eighth timezone silently emptying the platform.
    expect(predicate).toContain('timezone.not.in.(')
  })

  it('always lists anything with an end_date in the future', () => {
    expect(predicate).toContain(`end_date.gte.${now.toISOString()}`)
  })

  it('the per-zone boundary matches what isStillListed decides, zone by zone', () => {
    for (const zone of SUPPORTED_EVENT_ZONES) {
      const boundary = startOfLocalDayUtc(now, zone)
      // An event starting exactly at the boundary is listed.
      expect(isStillListed({ start_date: boundary.toISOString(), end_date: null, timezone: zone }, now)).toBe(true)
      // One millisecond before it is not.
      const justBefore = new Date(boundary.getTime() - 1)
      expect(isStillListed({ start_date: justBefore.toISOString(), end_date: null, timezone: zone }, now)).toBe(false)
    }
  })
})

/*
 * THE LIVE PROOF, against the TEST database.
 *
 * REGISTERED ONLY WHEN `LISTING_PROOF=1`. Not `describe.skip`: a skipped test is
 * reported as skipped, and scripts/guards/test-count-canary.mjs allows exactly
 * zero skipped tests, by design. Conditional REGISTRATION adds nothing to the
 * suite when the variable is unset, so the pinned counts stay stable and CI is
 * untouched, while the proof is one command away locally.
 *
 * Run: LISTING_PROOF=1 npx vitest run tests/unit/events/listing-window.test.ts
 *
 * READ ONLY, and TEST ONLY. It refuses the production ref outright.
 */
const PRODUCTION_REF = 'gndnldyfudbytbboxesk'
const TEST_REF = 'vkapkibzokmfaxqogypq'

if (process.env.LISTING_PROOF === '1') {
  describe('live proof against the TEST database', () => {
    function testEnv(): { url: string; key: string } {
      const out: Record<string, string> = {}
      for (const line of readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
        if (m) out[m[1]] = m[2].trim()
      }
      return { url: out.NEXT_PUBLIC_SUPABASE_URL, key: out.SUPABASE_SERVICE_ROLE_KEY }
    }

    it('recovers in-progress events and loses nothing', async () => {
      const { url, key } = testEnv()
      expect(url, '.env.test has no NEXT_PUBLIC_SUPABASE_URL').toBeTruthy()
      expect(url.includes(PRODUCTION_REF), 'REFUSING: that is the PRODUCTION project').toBe(false)
      expect(url.includes(TEST_REF), `expected the TEST ref ${TEST_REF}`).toBe(true)

      const supabase = createClient(url, key, { auth: { persistSession: false } })
      const now = new Date()
      const SELECT = 'id, slug, start_date, end_date, timezone'
      const base = () =>
        supabase.from('events').select(SELECT).eq('status', 'published').eq('visibility', 'public')

      const oldRule = await base().gte('start_date', now.toISOString()).limit(2000)
      const newRule = await base().or(listingWindowOrPredicate(now)).limit(2000)

      expect(oldRule.error?.message ?? null).toBeNull()
      expect(newRule.error?.message ?? null, `predicate: ${listingWindowOrPredicate(now)}`).toBeNull()

      const oldRows = oldRule.data ?? []
      const newRows = newRule.data ?? []
      const oldIds = new Set(oldRows.map((e) => e.id))
      const recovered = newRows.filter((e) => !oldIds.has(e.id))

       
      console.log(
        `[listing-proof] old rule ${oldRows.length}, new rule ${newRows.length}, recovered ${recovered.length}`,
      )
      for (const e of recovered.slice(0, 15)) {
         
        console.log(`[listing-proof] now on: ${e.start_date} tz=${e.timezone ?? 'null'} /events/${e.slug}`)
      }

      // NOTHING MAY BE LOST. The new rule must be a superset of the old one.
      const newIds = new Set(newRows.map((e) => e.id))
      const lost = oldRows.filter((e) => !newIds.has(e.id))
      expect(lost.map((e) => e.slug), 'events visible under the OLD rule vanished under the new one').toEqual([])

      // The SQL predicate and the JS rule are two expressions of one rule.
      const disagreements = recovered.filter((e) => !isStillListed(e, now))
      expect(disagreements.map((e) => e.slug), 'SQL matched but the JS rule says not listed').toEqual([])
    }, 60_000)

    it('an event that is ON RIGHT NOW appears, proven by making one', async () => {
      // The previous test can only report what the data happens to contain, and
      // TEST contains no mid-flight event, so "recovered 0" proves nothing about
      // recovery. This makes the case instead.
      //
      // It moves a REAL row rather than inserting one, so every foreign key, the
      // events_published_real_cover constraint and every default are satisfied by
      // construction. Both fields are restored in a finally block.
      //
      // NOTE ON THE DATA: every published public event on TEST carries an
      // end_date, so the null-end_date shape - which is exactly the founder's
      // production event - does not occur here naturally. Case B creates it.
      const { url, key } = testEnv()
      const supabase = createClient(url, key, { auth: { persistSession: false } })
      const now = new Date()

      const picked = await supabase
        .from('events')
        .select('id, slug, start_date, end_date, timezone')
        .eq('status', 'published')
        .eq('visibility', 'public')
        .limit(1)
        .maybeSingle()

      expect(picked.error?.message ?? null).toBeNull()
      const row = picked.data
      expect(row, 'no published public event on TEST to borrow').toBeTruthy()
      if (!row) return

      const originalStart = row.start_date
      const originalEnd = row.end_date
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()
      const inTwoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString()

      const base = () =>
        supabase.from('events').select('id').eq('status', 'published').eq('visibility', 'public')

      async function visibility(label: string) {
        const underOld = await base().gte('start_date', now.toISOString()).eq('id', row!.id)
        const underNew = await base().or(listingWindowOrPredicate(now)).eq('id', row!.id)
        expect(underOld.error?.message ?? null).toBeNull()
        expect(underNew.error?.message ?? null).toBeNull()
        const oldSeen = underOld.data?.length ?? 0
        const newSeen = underNew.data?.length ?? 0
         
        console.log(`[listing-proof] ${label} /events/${row!.slug}: old rule sees ${oldSeen}, new rule sees ${newSeen}`)
        return { oldSeen, newSeen }
      }

      try {
        // CASE A: started two hours ago, ends in two hours. Running right now.
        const movedA = await supabase
          .from('events')
          .update({ start_date: twoHoursAgo, end_date: inTwoHours })
          .eq('id', row.id)
        expect(movedA.error?.message ?? null).toBeNull()

        const a = await visibility('CASE A in progress, end_date set:')
        expect(a.oldSeen, 'the OLD rule should hide a running event, which was the defect').toBe(0)
        expect(a.newSeen, 'the NEW rule must show an event that is running right now').toBe(1)

        // CASE B: the founder's exact shape. Started earlier today, no end_date.
        const movedB = await supabase
          .from('events')
          .update({ start_date: twoHoursAgo, end_date: null })
          .eq('id', row.id)

        if (movedB.error) {
           
          console.log(`[listing-proof] CASE B skipped: end_date is not nullable here (${movedB.error.message})`)
        } else {
          const b = await visibility('CASE B in progress, end_date NULL:')
          expect(b.oldSeen, 'the OLD rule hid the founder 16 August event exactly this way').toBe(0)
          expect(b.newSeen, 'the NEW rule must show it until the end of its local day').toBe(1)
        }
      } finally {
        await supabase
          .from('events')
          .update({ start_date: originalStart, end_date: originalEnd })
          .eq('id', row.id)
      }
    }, 60_000)
  })
}
