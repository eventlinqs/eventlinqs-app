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
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { SOURCE_SYSTEM } from '@/lib/ledger/types'
import { identityFingerprints, identityHash } from '@/lib/ledger/identity'
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

  /*
   * WHAT WE ALREADY SENT, ALL OF IT, AND THIS IS THE SECOND SUPPRESSION SET IN
   * THIS ENGINE THAT FAILS OPEN WHEN IT IS SHORT.
   *
   * `alreadySent` is SUBTRACTED from the people about to be written to. A name
   * missing from it is a person who gets the same message a second time, which
   * is the one failure this engine cannot apologise its way out of: the
   * recipient asked for nothing, is being chased about a checkout they
   * abandoned, and now hears it twice.
   *
   * The read was unbounded, and Supabase caps one response at a fixed number of
   * rows, 1,000 by default
   * (https://supabase.com/docs/reference/javascript/select, fetched
   * 2026-09-19), in silence: HTTP 200, `error` null, a full-looking array.
   * Measured against this project on 20 September 2026:
   *
   *     Prefer: count=exact    HTTP 206   Content-Range: 0-999/14381
   *     no count requested     HTTP 200   Content-Range: 0-999/*
   *
   * THIS ONE IS NOT THEORETICAL AT TODAY'S VOLUME. It filters by slot, so the
   * cliff is a thousand sends on ONE slot, and the busiest slot on TEST already
   * carries 452. Three messages to three hundred and fifty abandoners crosses
   * it, which is one mid-sized show.
   */
  const sends = await readEveryRow<{ contact_email: string; message_number: number }>(
    `what the engine already sent on ${slotId}`,
    (from, to) =>
      db
        .from('recovery_sends')
        .select('contact_email, message_number')
        .eq('slot_id', slotId)
        .order('id', { ascending: true })
        .range(from, to),
  )

  const alreadySent = new Set(
    sends.map(row => `${row.contact_email.trim().toLowerCase()}::${row.message_number}`),
  )

  return { boughtHashes, refundedHashes, unitsSold, alreadySent }
}

/**
 * WHO HAS SAID STOP. Read whole rather than per address, because the set is
 * small by construction and a per address round trip inside a loop is how a
 * sweep becomes a timeout.
 *
 * READ WHOLE MEANS PAGED, and for eleven days it did not. This select carried no
 * bound, and Supabase caps one response at a fixed number of rows, 1,000 by
 * default (https://supabase.com/docs/reference/javascript/select, fetched
 * 2026-09-19). The cap is silent: HTTP 200, `error` null, a full-looking array.
 * Measured against this project on 20 September 2026 rather than assumed:
 *
 *     Content-Range: 0-999/14364      an unbounded select on a 14,364 row table
 *
 * A SUPPRESSION LIST IS THE ONE SHAPE WHERE A SHORT READ FAILS OPEN. Every other
 * truncation in this engine withholds a message; this one sends it, to the
 * 1,001st person who asked it not to. `src/lib/matching/run.ts` already pages
 * this very table for the same reason and says so in its own comment: "A
 * truncated recovery_suppressions means mailing somebody who asked not to be."
 * This read simply never got the same treatment.
 *
 * WHAT IS IN THIS LIST, and where the rest of it comes from. The engine owns
 * this table and reads nothing else, which is the D2 invariant. EventLinqs'
 * OWN consent ledger is a different store and the engine may not look at it, so
 * the source system keeps this table truthful from outside:
 * `src/lib/recovery/consent-stops.ts` copies every facilitated-marketing
 * withdrawal in before each sweep. Point the engine at a gym tomorrow and that
 * file is replaced; this function is not.
 */
export async function suppressedAddresses(db: Db = createAdminClient()): Promise<Set<string>> {
  const rows = await readEveryRow<{ contact_email: string }>('the suppression list', (from, to) =>
    db
      .from('recovery_suppressions')
      .select('contact_email')
      .eq('source_system', SOURCE)
      .order('id', { ascending: true })
      .range(from, to),
  )
  return new Set(rows.map(row => row.contact_email.trim().toLowerCase()))
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

/**
 * Every hash one address may carry on a money row, keyed first, so the
 * "already bought" and "money came back" rules hold for rows written on a
 * deployment that had no key (see identityFingerprints for the day that
 * happened).
 */
export function fingerprintsOf(email: string): string[] {
  return identityFingerprints(email)
}

/**
 * THE SHAPE OF EVERY TOKEN THE ENGINE MINTS: a uuid. recovery_contacts.token is
 * a uuid column filled by gen_random_uuid(), so a value of any other shape
 * cannot name anybody, and asking the database about one is how a malformed
 * link became a 500 on production on 12 September 2026: the first route sweep
 * after the merge asked /unsubscribe/recovery/zzzzzzzzzzzz and Postgres
 * answered "invalid input syntax for type uuid", which addressForToken threw
 * as an outage. A link that names nobody is NOT FOUND. Only a real failure to
 * ask is a 500 (the read-failure rule: a 500 says ask again, a 404 says
 * something false and permanent), and that branch is kept below.
 */
const TOKEN_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isTokenShaped(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_SHAPE.test(token.trim())
}

/** Whose token this is, or null. The unsubscribe route's only question. */
export async function addressForToken(token: string, db: Db = createAdminClient()): Promise<string | null> {
  // A value the column would refuse is not found, without the question.
  if (!isTokenShaped(token)) return null
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

/**
 * Every hold on a slot, live or lapsed, so an expiry can pass down the list.
 *
 * EVERY MEANS EVERY. This read was unbounded, and a hold missing from it is a
 * seat the engine believes is free: the same unit offered to a second person,
 * or an expiry that never passes down the list because the hold it should have
 * lapsed was never seen. It filters by slot and the busiest slot on TEST
 * carries two holds, so the cliff is far away today, and it is the same silent
 * cliff as everywhere else: HTTP 200, `error` null, a full-looking array
 * (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19).
 */
export async function holdsOn(slotId: string, db: Db = createAdminClient()): Promise<HoldRow[]> {
  const data = await readEveryRow<Record<string, unknown>>(`the holds on ${slotId}`, (from, to) =>
    db
      .from('recovery_holds')
      .select('id, demand_entry_id, contact_email, inventory_class, units, expires_at, claimed_at, released_at')
      .eq('slot_id', slotId)
      .order('id', { ascending: true })
      .range(from, to),
  )

  return (data as Array<Record<string, unknown>>).map(row => ({
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
