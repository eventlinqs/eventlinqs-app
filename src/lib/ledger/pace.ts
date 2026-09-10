/**
 * HOW A SLOT SOLD. Close-out D1, the part an organiser actually looks at.
 *
 * The close-out asks for a panel on the organiser dashboard showing cumulative
 * sales against days out, the price at each point, and how many people reached
 * checkout and did not finish. (Its own wording names the unit this platform
 * happens to sell; the heading a person reads is composed in the component,
 * which is allowed to, and this file is not.)
 *
 * Every number here is READ OUT OF THE LEDGER and nothing else. Not the current
 * state tables, which is the whole point: `sold 240` cannot say when those 240
 * sold or what they paid, and by the time anybody asks, the rows that would have
 * told you were overwritten as they changed.
 *
 * It speaks the general vocabulary, so the same reader draws the same panel for
 * a gym's rate card tomorrow with a new adapter and nothing else.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { SOURCE_SYSTEM } from './types'

/** The two tables, named once, so a typo is a compile-time thing. */
const LEDGER_ENTRIES = 'ledger_entries'
const LEDGER_SLOTS = 'ledger_slots'

/** One point on the curve: how things stood this many days before the slot. */
export type PacePoint = {
  daysOut: number
  /** Units sold on this day, net of anything given back on it. */
  units: number
  /** Cumulative units up to and including this day. */
  cumulativeUnits: number
  /** Cumulative money, in cents, up to and including this day. */
  cumulativeAmountCents: number
  /** What one unit cost on this day, when anything sold. */
  unitAmountCents: number | null
}

export type PriceMove = {
  daysOut: number
  inventoryClass: string
  oldAmountCents: number | null
  newAmountCents: number
}

export type PaceCurve = {
  slotId: string
  category: string
  subcategory: string
  capacity: number | null
  slotAt: string
  onSaleAt: string | null
  points: PacePoint[]
  priceMoves: PriceMove[]
  totals: {
    units: number
    amountCents: number
    /** Whole units given back, as a positive number, for reading. */
    unitsReturned: number
  }
  /** What people did without buying. The number nobody has ever had. */
  demand: {
    views: number
    soldOutViews: number
    checkoutsStarted: number
    checkoutsAbandoned: number
    waitlistJoins: number
    /** Of everyone who reached checkout, how many did not finish. */
    abandonmentPercent: number | null
  }
  /** Null until the slot has been through the closing sweep. */
  close: {
    finalUnits: number
    finalAmountCents: number
    fillPercent: number
    attended: number | null
    noShows: number | null
  } | null
}

type EntryRow = {
  kind: string
  occurred_at: string
  days_out: number | null
  quantity: number | null
  amount_cents: number | null
  unit_amount_cents: number | null
  old_price_cents: number | null
  new_price_cents: number | null
  inventory_class: string | null
  demand_action: string | null
  final_sold: number | null
  final_revenue_cents: number | null
  fill_percent: number | null
  attended: number | null
  no_shows: number | null
}

/**
 * The whole curve for one slot, or null when the ledger has never heard of it.
 *
 * Null is a real answer and is rendered as one: a slot with no rows is a slot
 * that existed before the ledger did, and telling an organiser it sold nothing
 * would be a lie the panel has no business telling.
 */
export async function paceForSlot(sourceRef: string): Promise<PaceCurve | null> {
  const admin = createAdminClient()

  const { data: slot } = await admin
    .from(LEDGER_SLOTS)
    .select('id, category, subcategory, capacity, slot_at, on_sale_at')
    .eq('source_system', SOURCE_SYSTEM)
    .eq('source_ref', sourceRef)
    .maybeSingle()
  if (!slot) return null

  const row = slot as {
    id: string
    category: string
    subcategory: string
    capacity: number | null
    slot_at: string
    on_sale_at: string | null
  }

  const { data: entries } = await admin
    .from(LEDGER_ENTRIES)
    .select(
      'kind, occurred_at, days_out, quantity, amount_cents, unit_amount_cents, old_price_cents, new_price_cents, inventory_class, demand_action, final_sold, final_revenue_cents, fill_percent, attended, no_shows',
    )
    .eq('slot_id', row.id)
    .order('occurred_at', { ascending: true })

  return buildCurve(row, (entries ?? []) as EntryRow[])
}

/**
 * The arithmetic, separated from the reading so it can be driven by a test with
 * no database at all. Every rule that decides what an organiser sees is here.
 */
export function buildCurve(
  slot: {
    id: string
    category: string
    subcategory: string
    capacity: number | null
    slot_at: string
    on_sale_at: string | null
  },
  entries: EntryRow[],
): PaceCurve {
  const byDay = new Map<number, { units: number; amountCents: number; unitAmountCents: number | null }>()
  const priceMoves: PriceMove[] = []
  const demand = {
    views: 0,
    soldOutViews: 0,
    checkoutsStarted: 0,
    checkoutsAbandoned: 0,
    waitlistJoins: 0,
    abandonmentPercent: null as number | null,
  }
  let close: PaceCurve['close'] = null
  let unitsReturned = 0

  for (const entry of entries) {
    // A row with no days_out cannot be placed on the curve. It is still counted
    // in the totals: leaving money out of a total because the axis is awkward
    // would be a wrong number, and a wrong number is worse than a gap.
    const day = entry.days_out

    if (entry.kind === 'sale' || entry.kind === 'refund') {
      if (entry.kind === 'refund') unitsReturned += Math.abs(entry.quantity ?? 0)
      if (day !== null) {
        const at = byDay.get(day) ?? { units: 0, amountCents: 0, unitAmountCents: null }
        at.units += entry.quantity ?? 0
        at.amountCents += entry.amount_cents ?? 0
        if (entry.kind === 'sale' && entry.unit_amount_cents !== null) at.unitAmountCents = entry.unit_amount_cents
        byDay.set(day, at)
      }
      continue
    }

    if (entry.kind === 'price_change' && entry.new_price_cents !== null && day !== null) {
      priceMoves.push({
        daysOut: day,
        inventoryClass: entry.inventory_class ?? '',
        oldAmountCents: entry.old_price_cents,
        newAmountCents: entry.new_price_cents,
      })
      continue
    }

    if (entry.kind === 'demand') {
      if (entry.demand_action === 'page_view') demand.views += 1
      else if (entry.demand_action === 'sold_out_view') demand.soldOutViews += 1
      else if (entry.demand_action === 'checkout_started') demand.checkoutsStarted += 1
      else if (entry.demand_action === 'checkout_abandoned') demand.checkoutsAbandoned += 1
      else if (entry.demand_action === 'waitlist_join') demand.waitlistJoins += 1
      continue
    }

    if (entry.kind === 'close') {
      close = {
        finalUnits: entry.final_sold ?? 0,
        finalAmountCents: entry.final_revenue_cents ?? 0,
        fillPercent: Number(entry.fill_percent ?? 0),
        attended: entry.attended,
        noShows: entry.no_shows,
      }
    }
  }

  // Days out COUNT DOWN towards the slot, so the curve reads left to right the
  // way a person reads a calendar: furthest out first, the day itself last.
  const days = [...byDay.keys()].sort((a, b) => b - a)
  let cumulativeUnits = 0
  let cumulativeAmountCents = 0
  const points: PacePoint[] = days.map(day => {
    const at = byDay.get(day) as { units: number; amountCents: number; unitAmountCents: number | null }
    cumulativeUnits += at.units
    cumulativeAmountCents += at.amountCents
    return {
      daysOut: day,
      units: at.units,
      cumulativeUnits,
      cumulativeAmountCents,
      unitAmountCents: at.unitAmountCents,
    }
  })

  const totals = entries.reduce(
    (acc, e) => {
      if (e.kind === 'sale' || e.kind === 'refund') {
        acc.units += e.quantity ?? 0
        acc.amountCents += e.amount_cents ?? 0
      }
      return acc
    },
    { units: 0, amountCents: 0, unitsReturned },
  )

  if (demand.checkoutsStarted > 0) {
    demand.abandonmentPercent = Math.round((demand.checkoutsAbandoned / demand.checkoutsStarted) * 1000) / 10
  }

  return {
    slotId: slot.id,
    category: slot.category,
    subcategory: slot.subcategory,
    capacity: slot.capacity,
    slotAt: slot.slot_at,
    onSaleAt: slot.on_sale_at,
    points,
    priceMoves,
    totals,
    demand,
    close,
  }
}
