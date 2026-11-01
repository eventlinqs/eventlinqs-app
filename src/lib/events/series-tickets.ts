import type { TierSaveInput } from '@/lib/events/save-tiers'

/**
 * EVERY NIGHT OF A SERIES TICKETED IN ONE STEP (V3 item 6, the CONTROLLER's 05:45 of 1 November 2026: 'recurring nights
 * in one step'). An organiser sets the tickets once on one night of a weekly series and puts the same ticket types on
 * every other upcoming night of it. This decides which nights take them; the action (dashboard/events/actions.ts,
 * ticketEverySeriesNight) checks who is asking and writes.
 *
 * A night is never overwritten: one that already has ticket types of its own keeps them. A night that has ended, one
 * sold on another site, and a free walk-in night (the publish gate refuses ticket types on those) are left as they are,
 * each with its reason, so the organiser is told what was not changed and why. A leaf, tested without a database.
 */

export type SeriesNight = {
  readonly id: string
  readonly start_date: string
  readonly end_date: string | null
  readonly entry_mode: string | null
  readonly external_ticket_url: string | null
  readonly tierCount: number
}

export type SkipReason = 'the night you are copying from' | 'already has tickets' | 'has ended' | 'sold on another site' | 'free walk-in night'

export function planSeriesTickets(input: { readonly templateId: string; readonly nights: readonly SeriesNight[]; readonly now: Date }): {
  ticket: string[]
  skipped: { id: string; reason: SkipReason }[]
} {
  const ticket: string[] = []
  const skipped: { id: string; reason: SkipReason }[] = []
  for (const n of input.nights) {
    const ends = new Date(n.end_date ?? n.start_date).getTime()
    const reason: SkipReason | null =
      n.id === input.templateId
        ? 'the night you are copying from'
        : ends < input.now.getTime()
          ? 'has ended'
          : n.external_ticket_url && n.external_ticket_url.trim()
            ? 'sold on another site'
            : n.entry_mode === 'walk_in'
              ? 'free walk-in night'
              : n.tierCount > 0
                ? 'already has tickets'
                : null
    if (reason) skipped.push({ id: n.id, reason })
    else ticket.push(n.id)
  }
  return { ticket, skipped }
}

/** One ticket type as the template night holds it: the columns the organiser's own Save writes, price in cents. */
export type TemplateTier = {
  readonly name: string
  readonly description: string | null
  readonly tier_type: string
  readonly access_mode: 'in_person' | 'virtual'
  readonly price: number
  readonly currency: string
  readonly total_capacity: number
  readonly sale_start: string | null
  readonly sale_end: string | null
  readonly min_per_order: number
  readonly max_per_order: number
  readonly sort_order: number
  readonly is_active: boolean
}

const shift = (at: string | null, ms: number) => (at ? new Date(new Date(at).getTime() + ms).toISOString() : null)

/**
 * The template's active ticket types as another night takes them, in the shape the organiser's own Save sends
 * (TierSaveInput, dollars), so they pass through the same database function and the same ledger rows. The sale window
 * moves with the night: sales that closed an hour before the template night close an hour before this one, rather
 * than on the template's date. Sales, holds and identity stay behind; every new type starts unsold.
 */
export function seriesTierInputs(tiers: readonly TemplateTier[], templateStart: string, nightStart: string): TierSaveInput[] {
  const ms = new Date(nightStart).getTime() - new Date(templateStart).getTime()
  return tiers
    .filter((t) => t.is_active)
    .map((t) => ({
      name: t.name,
      description: t.description ?? '',
      tier_type: t.tier_type,
      access_mode: t.access_mode,
      price: t.price / 100,
      currency: t.currency,
      total_capacity: t.total_capacity,
      sale_start: shift(t.sale_start, ms),
      sale_end: shift(t.sale_end, ms),
      min_per_order: t.min_per_order,
      max_per_order: t.max_per_order,
      sort_order: t.sort_order,
    }))
}
