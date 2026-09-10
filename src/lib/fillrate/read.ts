/**
 * WHAT THE ENGINE IS ALLOWED TO KNOW. Close-out D2.
 *
 *     "The engine reads the ledger and nothing else. It must never import from,
 *      query, or reference an EventLinqs table, model or type. If it cannot be
 *      pointed at a gym's ledger rows tomorrow with only a new adapter, it is
 *      built wrong."
 *
 * So this is the ONLY file in the engine that touches a database, and every
 * table it names is either the ledger (`ledger_slots`, `ledger_entries`) or the
 * engine's own record of what it did (`recovery_*`). It names not one table
 * belonging to the source system, and `fillrate-reads-only-the-ledger` fails the
 * build if that ever stops being true.
 *
 * WHY IT RETURNS THE ENGINE'S OWN SHAPES rather than database rows. A row shape
 * is a coupling to one particular schema. The decision functions in `due.ts` and
 * `waitlist.ts` take these shapes and a clock and return decisions, which is why
 * every rule about contacting a real person can be EXECUTED in a test rather
 * than reasoned about.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { SOURCE_SYSTEM } from '@/lib/ledger/types'
import { identityHash } from '@/lib/ledger/identity'
import type { DemandRow, SlotFacts, SlotRow } from './due'
import type { JoinRow, HoldRow } from './waitlist'

/** How far back a sweep looks. Three messages end at 72 hours; this leaves room. */
export const SWEEP_WINDOW_HOURS = 120

type Db = ReturnType<typeof createAdminClient>

/** One place the engine says who it is, so a second source system is a value. */
const SOURCE = SOURCE_SYSTEM

/**
 * THE SLOTS WITH SOMEBODY TO CONTACT, and nothing else.
 *
 * Bounded two ways: a slot that has already happened can produce no honest
 * message, and a row older than the whole sequence can produce no due one. Both
 * bounds are applied in the DATABASE rather than in the loop, because this table
 * is the one on this platform designed to get large.
 */
export async function slotsWithRecoverableDemand(
  now: Date,
  db: Db = createAdminClient(),
): Promise<SlotRow[]> {
  const since = new Date(now.getTime() - SWEEP_WINDOW_HOURS * 3_600_000).toISOString()

  const { data: recent, error } = await db
    .from('ledger_entries')
    .select('slot_id')
    .eq('source_system', SOURCE)
    .eq('kind', 'demand')
    .eq('demand_action', 'checkout_abandoned')
    .gte('occurred_at', since)
  if (error) throw new Error(`the engine could not read recent abandonments: ${error.message}`)

  const slotIds = [...new Set(((recent ?? []) as Array<{ slot_id: string }>).map(r => r.slot_id))]
  if (slotIds.length === 0) return []

  const { data: slots, error: slotError } = await db
    .from('ledger_slots')
    .select('id, source_ref, organisation_id, category, subcategory, slot_at, capacity, recovery_enabled')
    .in('id', slotIds)
    .gt('slot_at', now.toISOString())
  if (slotError) throw new Error(`the engine could not read the slots: ${slotError.message}`)

  return ((slots ?? []) as Array<Record<string, unknown>>).map(toSlotRow)
}

function toSlotRow(row: Record<string, unknown>): SlotRow {
  return {
    id: String(row.id),
    sourceRef: String(row.source_ref),
    organisationId: String(row.organisation_id),
    category: String(row.category ?? ''),
    subcategory: String(row.subcategory ?? ''),
    slotAt: String(row.slot_at),
    capacity: typeof row.capacity === 'number' ? row.capacity : null,
    recoveryEnabled: row.recovery_enabled !== false,
  }
}

/** One slot by its id, or null. Used by the panel and by the drive. */
export async function slotById(id: string, db: Db = createAdminClient()): Promise<SlotRow | null> {
  const { data, error } = await db
    .from('ledger_slots')
    .select('id, source_ref, organisation_id, category, subcategory, slot_at, capacity, recovery_enabled')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`the engine could not read slot ${id}: ${error.message}`)
  return data ? toSlotRow(data as Record<string, unknown>) : null
}

/** Every abandonment on one slot inside the sweep window, oldest first. */
export async function abandonmentsOn(
  slotId: string,
  now: Date,
  db: Db = createAdminClient(),
): Promise<DemandRow[]> {
  const since = new Date(now.getTime() - SWEEP_WINDOW_HOURS * 3_600_000).toISOString()
  const { data, error } = await db
    .from('ledger_entries')
    .select(
      'id, slot_id, organisation_id, demand_action, contact_email, occurred_at, inventory_class, unit_amount_cents',
    )
    .eq('slot_id', slotId)
    .eq('kind', 'demand')
    .eq('demand_action', 'checkout_abandoned')
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: true })
  if (error) throw new Error(`the engine could not read abandonments on ${slotId}: ${error.message}`)

  return ((data ?? []) as Array<Record<string, unknown>>).map(row => ({
    id: Number(row.id),
    slotId: String(row.slot_id),
    organisationId: String(row.organisation_id),
    action: 'checkout_abandoned' as const,
    contactEmail: row.contact_email == null ? null : String(row.contact_email),
    occurredAt: String(row.occurred_at),
    inventoryClass: row.inventory_class == null ? null : String(row.inventory_class),
    unitAmountCents: typeof row.unit_amount_cents === 'number' ? row.unit_amount_cents : null,
  }))
}

/**
 * WHAT ALREADY HAPPENED ON A SLOT, summarised, so the rules stay pure.
 *
 * Sales and refunds are read as ROWS rather than as a stored total, because a
 * stored total is a second place a number lives and the whole point of an append
 * only ledger is that there is only one. `quantity` is signed, so the net is a
 * sum with no special case.
 *
 * A MONEY ROW CARRIES A HASH, NOT AN ADDRESS, and that shapes the whole
 * function. A `sale` records that somebody paid, never who they are, so "did
 * this person buy" cannot be asked of a column: it is asked by putting the
 * address on the demand row through the SAME keyed function the adapter used and
 * looking for that hash. The first draft of this file read `contact_email` off
 * the sale rows, which is null on every one of them, so the two most important
 * suppression rules in the engine, do not write to somebody who already bought
 * and do not chase somebody whose money came back, would have looked correct and
 * never once fired.
 */
export async function factsFor(slotId: string, db: Db = createAdminClient()): Promise<SlotFacts> {
  const { data: money, error } = await db
    .from('ledger_entries')
    .select('kind, quantity, buyer_hash')
    .eq('slot_id', slotId)
    .in('kind', ['sale', 'refund'])
  if (error) throw new Error(`the engine could not read the sales on ${slotId}: ${error.message}`)

  const boughtHashes = new Set<string>()
  const refundedHashes = new Set<string>()
  let unitsSold = 0
  for (const raw of (money ?? []) as Array<Record<string, unknown>>) {
    const quantity = typeof raw.quantity === 'number' ? raw.quantity : 0
    unitsSold += quantity
    const fingerprint = raw.buyer_hash == null ? '' : String(raw.buyer_hash)
    if (!fingerprint) continue
    if (raw.kind === 'refund') refundedHashes.add(fingerprint)
    else boughtHashes.add(fingerprint)
  }

  const { data: sends, error: sendError } = await db
    .from('recovery_sends')
    .select('contact_email, message_number')
    .eq('slot_id', slotId)
  if (sendError) throw new Error(`the engine could not read what it already sent: ${sendError.message}`)

  const alreadySent = new Set(
    ((sends ?? []) as Array<{ contact_email: string; message_number: number }>).map(
      row => `${row.contact_email.trim().toLowerCase()}::${row.message_number}`,
    ),
  )

  return { boughtHashes, refundedHashes, unitsSold, alreadySent }
}

/**
 * WHO HAS SAID STOP. Read whole rather than per address, because the set is
 * small by construction and a per address round trip inside a loop is how a
 * sweep becomes a timeout.
 */
export async function suppressedAddresses(db: Db = createAdminClient()): Promise<Set<string>> {
  const { data, error } = await db
    .from('recovery_suppressions')
    .select('contact_email')
    .eq('source_system', SOURCE)
  if (error) throw new Error(`the engine could not read the suppression list: ${error.message}`)
  return new Set(
    ((data ?? []) as Array<{ contact_email: string }>).map(row => row.contact_email.trim().toLowerCase()),
  )
}

/**
 * THE STABLE UNSUBSCRIBE TOKEN for one address, minted on first use.
 *
 * Per address rather than per message: a token good for one message means a
 * person who unsubscribes from the first still gets the second while their click
 * is in flight. The write is an upsert on the unique address, so two workers
 * racing produce one token rather than an error.
 */
export async function tokenFor(email: string, db: Db = createAdminClient()): Promise<string | null> {
  const address = email.trim().toLowerCase()
  const { data: existing, error } = await db
    .from('recovery_contacts')
    .select('token')
    .eq('source_system', SOURCE)
    .eq('contact_email', address)
    .maybeSingle()
  if (error) throw new Error(`the engine could not read the unsubscribe token: ${error.message}`)
  if (existing) return String((existing as { token: string }).token)

  const { data: made, error: insertError } = await db
    .from('recovery_contacts')
    .upsert({ source_system: SOURCE, contact_email: address }, { onConflict: 'source_system,contact_email' })
    .select('token')
    .maybeSingle()
  if (insertError) throw new Error(`the engine could not mint an unsubscribe token: ${insertError.message}`)
  return made ? String((made as { token: string }).token) : null
}

/** Record that a message went. The UNIQUE is what stops a second one. */
export async function recordSend(
  send: {
    slotId: string
    organisationId: string
    contactEmail: string
    messageNumber: number
    inventoryClass: string | null
    unitAmountCents: number | null
    demandEntryId: number
  },
  db: Db = createAdminClient(),
): Promise<{ recorded: boolean; alreadyThere: boolean; reason?: string }> {
  const { error } = await db.from('recovery_sends').insert({
    source_system: SOURCE,
    slot_id: send.slotId,
    organisation_id: send.organisationId,
    contact_email: send.contactEmail.trim().toLowerCase(),
    message_number: send.messageNumber,
    inventory_class: send.inventoryClass,
    unit_amount_cents: send.unitAmountCents,
    demand_entry_id: send.demandEntryId,
  })
  if (!error) return { recorded: true, alreadyThere: false }
  // 23505 is the unique violation, which here means another worker got there
  // first. That is the safety net doing its job, not a failure.
  if (error.code === '23505') return { recorded: false, alreadyThere: true }
  return { recorded: false, alreadyThere: false, reason: error.message }
}

/** Stop writing to somebody, for ever, platform wide. */
export async function suppress(
  email: string,
  reason: 'unsubscribed' | 'complained' | 'bounced' | 'organiser_disabled',
  db: Db = createAdminClient(),
): Promise<boolean> {
  const { error } = await db.from('recovery_suppressions').upsert(
    { source_system: SOURCE, contact_email: email.trim().toLowerCase(), reason },
    { onConflict: 'source_system,contact_email' },
  )
  if (error) throw new Error(`the engine could not record the stop request: ${error.message}`)
  return true
}

/** The keyed hash of one address, so a caller can ask the money rows about it. */
export function hashOf(email: string): string | null {
  return identityHash(email)
}

/** Whose token this is, or null. The unsubscribe route's only question. */
export async function addressForToken(token: string, db: Db = createAdminClient()): Promise<string | null> {
  const { data, error } = await db
    .from('recovery_contacts')
    .select('contact_email')
    .eq('token', token)
    .maybeSingle()
  if (error) throw new Error(`the engine could not resolve that link: ${error.message}`)
  return data ? String((data as { contact_email: string }).contact_email) : null
}

/* -------------------------------------------------------------------------- */
/*  THE WAITLIST HALF                                                           */
/* -------------------------------------------------------------------------- */

/** Everybody who asked to be told, in the order they asked. */
export async function joinsOn(slotId: string, db: Db = createAdminClient()): Promise<JoinRow[]> {
  const { data, error } = await db
    .from('ledger_entries')
    .select('id, slot_id, organisation_id, contact_email, occurred_at, inventory_class, quantity')
    .eq('slot_id', slotId)
    .eq('kind', 'demand')
    .eq('demand_action', 'waitlist_join')
    .not('contact_email', 'is', null)
    .order('occurred_at', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw new Error(`the engine could not read the waiting list on ${slotId}: ${error.message}`)

  return ((data ?? []) as Array<Record<string, unknown>>).map(row => ({
    demandEntryId: Number(row.id),
    slotId: String(row.slot_id),
    organisationId: String(row.organisation_id),
    contactEmail: String(row.contact_email ?? '').trim().toLowerCase(),
    joinedAt: String(row.occurred_at),
    inventoryClass: row.inventory_class == null ? null : String(row.inventory_class),
    unitsWanted: typeof row.quantity === 'number' && row.quantity > 0 ? row.quantity : 1,
  }))
}

/** Every hold on a slot, live or lapsed, so an expiry can pass down the list. */
export async function holdsOn(slotId: string, db: Db = createAdminClient()): Promise<HoldRow[]> {
  const { data, error } = await db
    .from('recovery_holds')
    .select('id, demand_entry_id, contact_email, inventory_class, units, expires_at, claimed_at, released_at')
    .eq('slot_id', slotId)
  if (error) throw new Error(`the engine could not read the holds on ${slotId}: ${error.message}`)

  return ((data ?? []) as Array<Record<string, unknown>>).map(row => ({
    id: Number(row.id),
    demandEntryId: Number(row.demand_entry_id),
    contactEmail: String(row.contact_email ?? '').trim().toLowerCase(),
    inventoryClass: row.inventory_class == null ? null : String(row.inventory_class),
    units: typeof row.units === 'number' ? row.units : 1,
    expiresAt: String(row.expires_at),
    claimedAt: row.claimed_at == null ? null : String(row.claimed_at),
    releasedAt: row.released_at == null ? null : String(row.released_at),
  }))
}

/** Put a unit aside for one person until a moment. */
export async function openHold(
  hold: {
    slotId: string
    organisationId: string
    demandEntryId: number
    contactEmail: string
    inventoryClass: string | null
    units: number
    expiresAt: string
  },
  db: Db = createAdminClient(),
): Promise<{ opened: boolean; alreadyThere: boolean; reason?: string }> {
  const { error } = await db.from('recovery_holds').insert({
    source_system: SOURCE,
    slot_id: hold.slotId,
    organisation_id: hold.organisationId,
    demand_entry_id: hold.demandEntryId,
    contact_email: hold.contactEmail.trim().toLowerCase(),
    inventory_class: hold.inventoryClass,
    units: hold.units,
    expires_at: hold.expiresAt,
  })
  if (!error) return { opened: true, alreadyThere: false }
  if (error.code === '23505') return { opened: false, alreadyThere: true }
  return { opened: false, alreadyThere: false, reason: error.message }
}

/** Mark a hold finished, one way or the other. */
export async function closeHold(
  id: number,
  how: 'claimed' | 'released',
  db: Db = createAdminClient(),
): Promise<boolean> {
  const patch =
    how === 'claimed' ? { claimed_at: new Date().toISOString() } : { released_at: new Date().toISOString() }
  const { error } = await db.from('recovery_holds').update(patch).eq('id', id)
  if (error) throw new Error(`the engine could not close hold ${id}: ${error.message}`)
  return true
}
