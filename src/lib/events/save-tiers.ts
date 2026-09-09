/**
 * SAVING AN EVENT'S TICKET TYPES: the payload, and the words for a refusal.
 *
 * WHY THIS MODULE EXISTS SEPARATELY FROM THE ACTION. The database function
 * public.save_event_ticket_tiers (migration 20260910000001) does the
 * reconciliation, and it answers with a verdict rather than raising, precisely
 * so the sentence an organiser reads is written HERE, in TypeScript, where the
 * copy gate can see it and a unit test can drive it without a database.
 *
 * The defect that produced all of this is recorded in full in that migration.
 * The one-line version: the save deleted every ticket type and re-inserted it,
 * so a sold event could not be edited at all and an unsold one lost its
 * waitlist, its squads, its access codes and its pricing rules.
 */
import type { Json } from '@/types/database'

/**
 * A ticket type the organiser has drafted but never saved carries this in front
 * of its client-minted id.
 *
 * WHY A PREFIX RATHER THAN AN ABSENT ID. The form needs a stable key for every
 * row it renders, including the ones being typed, so every tier has an id from
 * the moment it appears. Without a marker, a client-minted uuid and a database
 * id are the same shape, and the server would have to guess which it was
 * looking at. Guessing wrong in one direction inserts a duplicate; guessing
 * wrong in the other silently discards an edit.
 */
export const UNSAVED_TIER_PREFIX = 'unsaved-'

/** True when this id names a row that already exists, rather than one being drafted. */
export function isSavedTierId(id: string): boolean {
  return Boolean(id) && !id.startsWith(UNSAVED_TIER_PREFIX)
}

/** One ticket type as the organiser's form submits it. */
export type TierSaveInput = {
  id?: string
  name: string
  description: string
  tier_type: string
  access_mode: 'in_person' | 'virtual'
  /** Dollars, as the form holds them. Converted to cents here, in one place. */
  price: number
  currency: string
  total_capacity: number
  sale_start: string | null
  sale_end: string | null
  min_per_order: number
  max_per_order: number
  sort_order: number
}

/** What public.save_event_ticket_tiers answers. */
export type TierSaveVerdict =
  | { ok: true; removed: number; updated: number; created: number }
  | { ok: false; refusal: TierSaveRefusal; names: string }

/** Every way the reconciliation says no, each with words of its own below. */
export const TIER_SAVE_REFUSALS = ['sold', 'capacity', 'repeated_name'] as const
export type TierSaveRefusal = (typeof TIER_SAVE_REFUSALS)[number]

/**
 * The jsonb the database function reads. Prices arrive in DOLLARS from the form
 * and leave in CENTS, converted once, here, so no caller can forget.
 */
export function tierSavePayload(tiers: TierSaveInput[]): Json {
  return tiers.map((tier, i) => ({
    id: tier.id ?? '',
    name: tier.name,
    description: tier.description || '',
    tier_type: tier.tier_type,
    access_mode: tier.access_mode,
    price: Math.round(tier.price * 100),
    currency: tier.currency,
    total_capacity: tier.total_capacity,
    sale_start: tier.sale_start || '',
    sale_end: tier.sale_end || '',
    min_per_order: tier.min_per_order,
    max_per_order: tier.max_per_order,
    sort_order: tier.sort_order ?? i,
  })) as unknown as Json
}

/**
 * Read the verdict back. Anything that is not a shape this module recognises is
 * a fault rather than a refusal, and says so, because a save that silently did
 * nothing is the failure this whole change exists to end.
 */
export function readTierSaveVerdict(value: unknown): TierSaveVerdict | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (v.ok === true) {
    return {
      ok: true,
      removed: Number(v.removed ?? 0),
      updated: Number(v.updated ?? 0),
      created: Number(v.created ?? 0),
    }
  }
  if (v.ok === false && TIER_SAVE_REFUSALS.includes(v.refusal as TierSaveRefusal)) {
    return { ok: false, refusal: v.refusal as TierSaveRefusal, names: String(v.names ?? '') }
  }
  return null
}

/**
 * The sentence the organiser reads, in their terms, naming their own ticket
 * types and the thing they can actually do instead.
 *
 * "Set the sale end date to a time in the past" is not a suggestion invented
 * here: a sale window in the past is what create_reservation already refuses on
 * (migration 20260704000005), and the sale end field is on the same step of the
 * same form, so it is a control the organiser is already looking at.
 */
export function describeTierRefusal(verdict: TierSaveVerdict): string | null {
  if (verdict.ok) return null
  if (verdict.refusal === 'sold') {
    return (
      `${verdict.names} cannot be removed, because tickets have already been sold or held on it. ` +
      'To stop new sales, set its sale end date to a time in the past and save again. ' +
      'It stays on the event so everyone who already holds one keeps their ticket.'
    )
  }
  if (verdict.refusal === 'repeated_name') {
    return (
      `More than one of your ticket types is called ${verdict.names}. ` +
      'Give each one its own name and save again, so a buyer can tell them apart.'
    )
  }
  return (
    `The capacity you have set for ${verdict.names} is below the number already sold or held. ` +
    'Raise it to at least that number, or leave it as it is, and save again.'
  )
}
