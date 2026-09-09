import { describe, it, expect } from 'vitest'
import {
  UNSAVED_TIER_PREFIX,
  isSavedTierId,
  tierSavePayload,
  readTierSaveVerdict,
  describeTierRefusal,
  type TierSaveInput,
} from '@/lib/events/save-tiers'

/**
 * The defect these pin, in one sentence: saving an event deleted every one of
 * its ticket types and re-inserted them, so an event that had sold anything at
 * all could never be edited again and an event that had not lost its waitlist,
 * its squads, its access codes and its pricing rules.
 *
 * The reconciliation itself lives in the database
 * (supabase/migrations/20260910000001_ticket_tiers_keep_their_identity.sql) and
 * is driven by scripts/verify/tier-identity-proof.mjs. What is pinned HERE is
 * the part that decides which ticket type is which, and the words a person
 * reads when the answer is no.
 */

const tier = (over: Partial<TierSaveInput> = {}): TierSaveInput => ({
  id: undefined,
  name: 'General admission',
  description: '',
  tier_type: 'general_admission',
  access_mode: 'in_person',
  price: 18,
  currency: 'AUD',
  total_capacity: 100,
  sale_start: null,
  sale_end: null,
  min_per_order: 1,
  max_per_order: 10,
  sort_order: 0,
  ...over,
})

describe('which ticket type is which', () => {
  it('treats a client-minted id as unsaved, so the server inserts it', () => {
    expect(isSavedTierId(`${UNSAVED_TIER_PREFIX}0a1b2c3d-0000-4000-8000-000000000000`)).toBe(false)
  })

  it('treats a database id as saved, so the server updates it in place', () => {
    expect(isSavedTierId('db639d3b-01b5-4a51-af53-223008b70fb0')).toBe(true)
  })

  it('treats an empty id as unsaved rather than as a row', () => {
    expect(isSavedTierId('')).toBe(false)
  })
})

describe('the payload the database function reads', () => {
  it('converts the price from dollars to cents exactly once', () => {
    const [row] = tierSavePayload([tier({ price: 18.5 })]) as unknown as Array<Record<string, unknown>>
    expect(row.price).toBe(1850)
  })

  it('rounds a price a person could type rather than truncating it', () => {
    const [row] = tierSavePayload([tier({ price: 26.87 })]) as unknown as Array<Record<string, unknown>>
    expect(row.price).toBe(2687)
  })

  it('carries a saved id through, because that id is what keeps the row alive', () => {
    const [row] = tierSavePayload([tier({ id: 'db639d3b-01b5-4a51-af53-223008b70fb0' })]) as unknown as Array<
      Record<string, unknown>
    >
    expect(row.id).toBe('db639d3b-01b5-4a51-af53-223008b70fb0')
  })

  it('sends an empty id for a new ticket type, which is what says "insert me"', () => {
    const [row] = tierSavePayload([tier()]) as unknown as Array<Record<string, unknown>>
    expect(row.id).toBe('')
  })

  it('sends an empty sale window rather than the word null', () => {
    // A blank window means on sale now (migration 20260704000005). It reaches
    // the function as '' and NULLIF turns it back into NULL, so a blank field
    // can never become a literal 'null' timestamp.
    const [row] = tierSavePayload([tier()]) as unknown as Array<Record<string, unknown>>
    expect(row.sale_start).toBe('')
    expect(row.sale_end).toBe('')
  })

  it('falls back to the array position when a tier carries no sort order', () => {
    const rows = tierSavePayload([
      tier({ name: 'First', sort_order: undefined as unknown as number }),
      tier({ name: 'Second', sort_order: undefined as unknown as number }),
    ]) as unknown as Array<Record<string, unknown>>
    expect(rows.map(r => r.sort_order)).toEqual([0, 1])
  })
})

describe('reading the verdict back', () => {
  it('reads a successful reconciliation and its counts', () => {
    expect(readTierSaveVerdict({ ok: true, removed: 1, updated: 2, created: 3 })).toEqual({
      ok: true,
      removed: 1,
      updated: 2,
      created: 3,
    })
  })

  it('reads the refusal to remove a ticket type somebody has bought', () => {
    expect(readTierSaveVerdict({ ok: false, refusal: 'sold', names: 'Early bird' })).toEqual({
      ok: false,
      refusal: 'sold',
      names: 'Early bird',
    })
  })

  it('reads the refusal to give two ticket types the same name', () => {
    expect(readTierSaveVerdict({ ok: false, refusal: 'repeated_name', names: 'VIP' })).toEqual({
      ok: false,
      refusal: 'repeated_name',
      names: 'VIP',
    })
  })

  it('reads the refusal to cut capacity below what is already sold', () => {
    expect(readTierSaveVerdict({ ok: false, refusal: 'capacity', names: 'General admission' })).toEqual({
      ok: false,
      refusal: 'capacity',
      names: 'General admission',
    })
  })

  it('refuses to read a shape it does not recognise, rather than assuming success', () => {
    // This is the whole point of returning a verdict. A save that quietly did
    // nothing must never be reported to an organiser as a save that worked.
    expect(readTierSaveVerdict(null)).toBeNull()
    expect(readTierSaveVerdict('ok')).toBeNull()
    expect(readTierSaveVerdict({})).toBeNull()
    expect(readTierSaveVerdict({ ok: false, refusal: 'something-else' })).toBeNull()
  })
})

describe('the words an organiser reads', () => {
  it('names the ticket type they tried to remove, and what to do instead', () => {
    const words = describeTierRefusal({ ok: false, refusal: 'sold', names: 'Early bird' })
    expect(words).toContain('Early bird')
    expect(words).toContain('sale end date')
  })

  it('names the ticket types that share a name', () => {
    const words = describeTierRefusal({ ok: false, refusal: 'repeated_name', names: 'VIP' })
    expect(words).toContain('VIP')
    expect(words).toContain('own name')
  })

  it('names the ticket type whose capacity is too low', () => {
    const words = describeTierRefusal({ ok: false, refusal: 'capacity', names: 'General admission' })
    expect(words).toContain('General admission')
  })

  it('says nothing at all when the save worked', () => {
    expect(describeTierRefusal({ ok: true, removed: 0, updated: 1, created: 0 })).toBeNull()
  })

  it('never shows a person a database word', () => {
    // What an organiser was actually shown before this change:
    //   duplicate key value violates unique constraint "ticket_tiers_event_id_name_key"
    for (const verdict of [
      { ok: false as const, refusal: 'sold' as const, names: 'Early bird' },
      { ok: false as const, refusal: 'capacity' as const, names: 'Early bird' },
      { ok: false as const, refusal: 'repeated_name' as const, names: 'Early bird' },
    ]) {
      const words = describeTierRefusal(verdict) ?? ''
      expect(words).not.toMatch(/constraint|ticket_tiers|duplicate key|null|sql|postgres/i)
    }
  })

  it('is written in the register the platform uses: no dashes, no exclamation marks', () => {
    for (const verdict of [
      { ok: false as const, refusal: 'sold' as const, names: 'Early bird' },
      { ok: false as const, refusal: 'capacity' as const, names: 'Early bird' },
      { ok: false as const, refusal: 'repeated_name' as const, names: 'Early bird' },
    ]) {
      const words = describeTierRefusal(verdict) ?? ''
      expect(words).not.toMatch(/[–—]/)
      expect(words).not.toContain('!')
    }
  })
})
