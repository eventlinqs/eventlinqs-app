/**
 * THE LEDGER'S VOCABULARY. Close-out D1.
 *
 * This file, and every other file in this directory except `adapter.ts`, speaks
 * the GENERAL language and only the general language. That is not a style
 * preference: this ledger is the foundation of something that will later run for
 * gyms, clinics, tour operators, studios and venues, and a ledger that speaks
 * one industry has to be rebuilt to leave it. Rebuilding a ledger means the
 * history does not come with you.
 *
 *   SLOT             any dated unit of perishable capacity
 *   INVENTORY CLASS  a priced bucket within a slot
 *   UNIT             one sellable place within an inventory class
 *   SOURCE SYSTEM    which platform the row came from
 *
 * `scripts/guards/ledger-speaks-no-industry.mjs` fails the build if any file in
 * this directory other than the adapter uses a word from one particular
 * industry, because the boundary is the entire portability of the business and
 * it erodes within a month if nothing defends it.
 */

/** Which platform a row came from. One value today, by design not a constant. */
export const SOURCE_SYSTEM = 'eventlinqs'

/** The five row types the close-out names, plus the one closing row per slot. */
export const ENTRY_KINDS = ['sale', 'price_change', 'inventory', 'refund', 'demand', 'close'] as const
export type EntryKind = (typeof ENTRY_KINDS)[number]

/** What happened to a priced bucket. */
export const INVENTORY_ACTIONS = ['open', 'close', 'hold', 'release', 'capacity_change'] as const
export type InventoryAction = (typeof INVENTORY_ACTIONS)[number]

/**
 * What a person did without buying. The two that carry no person are named here
 * so the rule about the address below is readable rather than implied.
 */
export const DEMAND_ACTIONS = [
  'page_view',
  'checkout_started',
  'checkout_abandoned',
  'waitlist_join',
  'sold_out_view',
] as const
export type DemandAction = (typeof DEMAND_ACTIONS)[number]

/** The demand actions that genuinely have nobody attached to them. */
export const ANONYMOUS_DEMAND_ACTIONS: readonly DemandAction[] = ['page_view', 'sold_out_view']

/**
 * A dated unit of perishable capacity, in the ledger's own terms.
 *
 * `category` and `subcategory` are REQUIRED and are never derived later. A slot
 * recorded today must still know what it was when the taxonomy has moved on.
 */
export type Slot = {
  sourceSystem: string
  /** The source system's own identifier. Carried as data, never as a foreign key. */
  sourceRef: string
  organisationId: string
  category: string
  subcategory: string
  capacity: number | null
  onSaleAt: string | null
  slotAt: string
  postcode: string | null
}

/** One thing that happened, in the ledger's own terms. */
export type Entry = {
  kind: EntryKind
  /**
   * One key per real-world happening. A redelivered webhook, a re-run backfill
   * and a retried action all collide on it rather than double-counting money.
   */
  occurrenceKey: string
  occurredAt?: string

  inventoryClass?: string | null
  inventoryClassRef?: string | null

  /** Signed. A refund is negative, so a sum is the net with no special case. */
  quantity?: number
  amountCents?: number
  unitAmountCents?: number

  referrer?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  device?: string | null
  buyerHash?: string | null
  returningBuyer?: boolean | null

  oldPriceCents?: number | null
  newPriceCents?: number | null

  inventoryAction?: InventoryAction

  demandAction?: DemandAction
  visitorHash?: string | null
  contactEmail?: string | null

  finalSold?: number
  finalRevenueCents?: number
  fillPercent?: number
  attended?: number | null
  noShows?: number | null
}
