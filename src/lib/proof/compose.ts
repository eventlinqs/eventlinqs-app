/**
 * THE PROOF AGGREGATION. Every figure, and where every figure came from.
 *
 * PURE. Rows in, figures out, no database and no clock, so every rule below is
 * testable at its boundary and the page cannot be right by accident.
 *
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE: A FIGURE THAT CANNOT NAME ITS
 * SOURCE DOES NOT RENDER. Not as a zero, not as an estimate, not as a dash. A
 * client will not keep paying a commission they cannot check, and the moment a
 * number appears that nobody can trace, the page stops being proof and becomes
 * a claim. So every figure is a `SourcedFigure`: either a value WITH the row ids
 * or the named query behind it, or an `unavailable` state carrying the reason
 * and, where the reason is a border, the border it points at.
 *
 * AND THE FEE IS WITHHELD RATHER THAN SHOWN PARTIAL. The fee due is quoted only
 * when the revenue it rests on ties out to the platform's own money ledger. An
 * event the ledger does not hold is an event whose revenue we cannot reconcile,
 * and quoting a commission against an unreconciled number is the thing an
 * accountant finds in month three.
 */

export const FIGURE = {
  PRODUCED_BY_US: 'producedByUsCents',
  PRODUCED_BY_US_ORDERS: 'producedByUsOrders',
  PRODUCED_ELSEWHERE: 'producedElsewhereCents',
  PRODUCED_ELSEWHERE_ORDERS: 'producedElsewhereOrders',
  REVERSED: 'reversedCents',
  REVERSED_ORDERS: 'reversedOrders',
  FEE_DUE: 'feeDueCents',
  COST_PER_SALE: 'costPerSaleCents',
  SENDS_DISPATCHED: 'sendsDispatched',
  LEDGER_NET: 'ledgerNetCents',
} as const

export type FigureKey = (typeof FIGURE)[keyof typeof FIGURE]

export const UNAVAILABLE = {
  NO_LEDGER_SLOT: 'the money ledger holds no slot for this event',
  NO_COMMISSION_RULE: 'no commission rate is configured for this campaign',
  NO_BILLABLE_SALES: 'this campaign has produced no chargeable sale yet',
  NO_SEND_COST: 'one of the channels used has no recorded cost per send',
  FEE_WITHHELD: 'the revenue this fee rests on could not be reconciled to the money ledger',
} as const

export type UnavailableReason = (typeof UNAVAILABLE)[keyof typeof UNAVAILABLE]

export const UNAVAILABLE_SENTENCE: Record<UnavailableReason, string> = {
  [UNAVAILABLE.NO_LEDGER_SLOT]:
    'The money ledger holds no slot for this event, so the revenue on this page cannot be reconciled against it.',
  [UNAVAILABLE.NO_COMMISSION_RULE]:
    'No commission rate is configured for this campaign, so there is no fee to quote.',
  [UNAVAILABLE.NO_BILLABLE_SALES]:
    'This campaign has produced no chargeable sale yet, so there is nothing to divide the send cost by.',
  [UNAVAILABLE.NO_SEND_COST]:
    'One of the channels this campaign sent on has no recorded cost per send, so cost per sale would be a guess.',
  [UNAVAILABLE.FEE_WITHHELD]:
    'The fee is withheld rather than shown partial: the revenue it rests on could not be reconciled to the money ledger.',
}

export interface FigureSource {
  /** The rows this figure is the sum or count of. */
  rowIds: string[]
  /** The named query, for a figure that is an aggregate rather than a list. */
  query: string
}

export interface SourcedFigure {
  value: number | null
  source: FigureSource | null
  unavailable: { reason: UnavailableReason; border: string | null } | null
}

export interface ProofOrder {
  id: string
  reference: string
  totalCents: number
  status: string
  /** GA3's stored decision for this order, or null when none exists. */
  attribution: {
    campaignId: string | null
    decision: 'attributed' | 'none'
    billable: boolean
    rung: number
    explanation: string
  } | null
  reversals: { id: string; amountCents: number; reason: string }[]
}

export interface ProofSend {
  id: string
  channelCode: string
  state: string
}

export interface ProofInput {
  campaignId: string
  /** Every order for this campaign's event inside the window. */
  orders: readonly ProofOrder[]
  /** Every send row for this campaign. */
  sends: readonly ProofSend[]
  /** Cost of one message per channel, in cents. null where none is recorded. */
  channelCostCents: Readonly<Record<string, number | null>>
  /** The commission rate from the pricing configuration. null when none resolves. */
  commissionPercent: number | null
  /** The net the money ledger holds for this event, or null when it holds no slot. */
  ledgerNetCents: number | null
  /** The ledger rows behind that net, for the evidence expansion. */
  ledgerEntryIds: readonly string[]
}

export interface ProofResult {
  campaignId: string
  figures: Record<FigureKey, SourcedFigure>
  /** Sends by channel, each with the rows behind it. */
  sendsByChannel: { channelCode: string; dispatched: number; sendIds: string[] }[]
  /** The evidence a person expands: one line per order we are charging for. */
  producedByUsOrders: { reference: string; totalCents: number; rung: number; explanation: string }[]
  /** The reversals behind the reversed figure. */
  reversalRows: { reference: string; amountCents: number; reason: string }[]
}

/** A figure that could not be sourced. It renders as words, never as a number. */
function unavailable(reason: UnavailableReason, border: string | null = null): SourcedFigure {
  return { value: null, source: null, unavailable: { reason, border } }
}

function sourced(value: number, rowIds: string[], query: string): SourcedFigure {
  return { value, source: { rowIds, query }, unavailable: null }
}

/**
 * The BORDER this page points at when the ledger cannot answer.
 *
 * `supabase/migrations/20260910000002_slot_ledger.sql` is lane A's and is read
 * only here. It is keyed by SLOT, which is the event, and carries no campaign
 * dimension, so it can reconcile an event's revenue and can never attribute it.
 * That is not a defect in the ledger; it is why GA3 exists.
 */
export const LEDGER_BORDER = 'REVIEW-QUEUE-B.md, BORDER: the slot ledger holds no campaign dimension'

const STATES_THAT_LEFT = ['sent', 'delivered']

export function composeProof(input: ProofInput): ProofResult {
  const ours = input.orders.filter(
    o => o.attribution?.campaignId === input.campaignId && o.attribution.billable,
  )
  const oursReversed = input.orders.filter(
    o =>
      o.attribution?.campaignId === input.campaignId &&
      o.attribution.decision === 'attributed' &&
      o.reversals.length > 0,
  )
  /*
   * PRODUCED ELSEWHERE is everything in the same event and window that this
   * campaign is not being paid for: orders no campaign produced, orders another
   * campaign produced, and orders of ours that fell to a rung we do not charge
   * on. It is on the page because a client who sees us claim only our share
   * trusts the share we claim.
   */
  const elsewhere = input.orders.filter(
    o => !(o.attribution?.campaignId === input.campaignId && o.attribution.billable),
  )

  const sum = (rows: readonly ProofOrder[]) => rows.reduce((total, o) => total + o.totalCents, 0)
  const producedByUsCents = sum(ours)

  const dispatched = input.sends.filter(s => STATES_THAT_LEFT.includes(s.state))
  const byChannel = new Map<string, string[]>()
  for (const send of dispatched) {
    byChannel.set(send.channelCode, [...(byChannel.get(send.channelCode) ?? []), send.id])
  }

  const figures = {} as Record<FigureKey, SourcedFigure>

  figures[FIGURE.PRODUCED_BY_US] = sourced(
    producedByUsCents,
    ours.map(o => o.id),
    'Read from orders joined to marketing_attribution, where the campaign matches and billable is true',
  )
  figures[FIGURE.PRODUCED_BY_US_ORDERS] = sourced(
    ours.length,
    ours.map(o => o.id),
    'The same orders, counted',
  )
  figures[FIGURE.PRODUCED_ELSEWHERE] = sourced(
    sum(elsewhere),
    elsewhere.map(o => o.id),
    'Read from orders for the same event in the same window that this campaign is not charged for',
  )
  figures[FIGURE.PRODUCED_ELSEWHERE_ORDERS] = sourced(
    elsewhere.length,
    elsewhere.map(o => o.id),
    'The same orders, counted',
  )
  figures[FIGURE.REVERSED] = sourced(
    oursReversed.reduce((total, o) => total + o.reversals.reduce((t, r) => t + r.amountCents, 0), 0),
    oursReversed.flatMap(o => o.reversals.map(r => r.id)),
    'Read from marketing_attribution_reversal, rows against orders this campaign was credited with',
  )
  figures[FIGURE.REVERSED_ORDERS] = sourced(
    oursReversed.length,
    oursReversed.map(o => o.id),
    'The same orders, counted',
  )
  figures[FIGURE.SENDS_DISPATCHED] = sourced(
    dispatched.length,
    dispatched.map(s => s.id),
    'Read from marketing_send, rows for this campaign that left',
  )

  if (input.ledgerNetCents === null) {
    figures[FIGURE.LEDGER_NET] = unavailable(UNAVAILABLE.NO_LEDGER_SLOT, LEDGER_BORDER)
  } else {
    figures[FIGURE.LEDGER_NET] = sourced(
      input.ledgerNetCents,
      [...input.ledgerEntryIds],
      'Read from ledger_entries, summed over the slot for this event and never written to',
    )
  }

  /*
   * THE FEE. Two things must both hold: a rate must be configured, and the
   * revenue must tie out to the ledger. Either missing withholds it, because a
   * partial fee on a proof page is a number somebody will quote.
   */
  if (input.ledgerNetCents === null) {
    figures[FIGURE.FEE_DUE] = unavailable(UNAVAILABLE.FEE_WITHHELD, LEDGER_BORDER)
  } else if (input.commissionPercent === null) {
    figures[FIGURE.FEE_DUE] = unavailable(UNAVAILABLE.NO_COMMISSION_RULE)
  } else {
    figures[FIGURE.FEE_DUE] = sourced(
      Math.round((producedByUsCents * input.commissionPercent) / 100),
      ours.map(o => o.id),
      'The commission rate configured in pricing_rules, applied to the chargeable revenue above',
    )
  }

  /*
   * COST PER SALE. It is here for our own sake as much as the client's: a
   * campaign that produced sales at a worse cost than the fee it earned is one
   * to stop running rather than celebrate.
   */
  const channelsUsed = [...byChannel.keys()]
  const missingCost = channelsUsed.some(code => input.channelCostCents[code] === null || input.channelCostCents[code] === undefined)
  if (ours.length === 0) {
    figures[FIGURE.COST_PER_SALE] = unavailable(UNAVAILABLE.NO_BILLABLE_SALES)
  } else if (missingCost) {
    figures[FIGURE.COST_PER_SALE] = unavailable(UNAVAILABLE.NO_SEND_COST)
  } else {
    const totalCost = channelsUsed.reduce(
      (total, code) => total + (byChannel.get(code)?.length ?? 0) * (input.channelCostCents[code] as number),
      0,
    )
    figures[FIGURE.COST_PER_SALE] = sourced(
      Math.round(totalCost / ours.length),
      dispatched.map(s => s.id),
      'The recorded cost per send on each channel used, times the messages that left, divided by the chargeable sales',
    )
  }

  return {
    campaignId: input.campaignId,
    figures,
    sendsByChannel: channelsUsed
      .map(code => ({ channelCode: code, dispatched: byChannel.get(code)?.length ?? 0, sendIds: byChannel.get(code) ?? [] }))
      .sort((a, b) => b.dispatched - a.dispatched),
    producedByUsOrders: ours.map(o => ({
      reference: o.reference,
      totalCents: o.totalCents,
      rung: o.attribution?.rung ?? 0,
      explanation: o.attribution?.explanation ?? '',
    })),
    reversalRows: oursReversed.flatMap(o =>
      o.reversals.map(r => ({ reference: o.reference, amountCents: r.amountCents, reason: r.reason })),
    ),
  }
}

/**
 * EVERY FIGURE CARRIES ITS SOURCE, asserted rather than assumed.
 *
 * The page calls this before it renders anything. A result that fails it is a
 * bug in the composer, and a bug in the composer must not reach a screen a fee
 * is defended on.
 */
export function everyFigureIsSourced(result: ProofResult): { ok: boolean; unsourced: FigureKey[] } {
  const unsourced = (Object.keys(result.figures) as FigureKey[]).filter(key => {
    const figure = result.figures[key]
    if (figure.unavailable) return false
    return figure.value === null || figure.source === null || figure.source.query.trim().length === 0
  })
  return { ok: unsourced.length === 0, unsourced }
}

/** The figures and their sources, in the shape the monthly snapshot stores. */
export function snapshotPayload(result: ProofResult): {
  figures: Record<string, number | null>
  sources: Record<string, FigureSource | { unavailable: string }>
} {
  const figures: Record<string, number | null> = {}
  const sources: Record<string, FigureSource | { unavailable: string }> = {}
  for (const key of Object.keys(result.figures) as FigureKey[]) {
    const figure = result.figures[key]
    figures[key] = figure.value
    sources[key] = figure.unavailable ? { unavailable: figure.unavailable.reason } : (figure.source as FigureSource)
  }
  return { figures, sources }
}
