import { feeGivenBack, SOLD, type OrderRow } from '@/lib/growth/weekly-math'

/**
 * THE ORGANISER MARKETING RESULTS CARD (the PM's 12:40 of 18 November 2026, item 5; Lawal's item 7: measure what
 * happens). Pure counting from the rows the reader gives (marketing-results.ts). Every figure names the rows it was
 * counted from, and a figure with nothing behind it reads 0, never blank. Revenue is EventLinqs' own kept fee, less the
 * share refunds gave back, on sold orders only: never the ticket value (the directive: gross ticket sales are not
 * EventLinqs revenue).
 */

/** A reply that says yes to the listing, or asks for it: the two outcomes outreach_replies records as interest. */
export const POSITIVE_OUTCOMES: ReadonlySet<string> = new Set(['yes', 'interested'])

export type LetterRow = { readonly id: string; readonly sentAt: string; readonly half: 'a' | 'b' | null }
export type ReplyRow = { readonly touchId: string | null; readonly outcome: string }
export type ActivationRow = { readonly organiserId: string | null }
export type ClickRow = { readonly pieceId: string; readonly label: string }

export type Figure = { readonly key: string; readonly label: string; readonly value: string; readonly detail: string | null; readonly source: string }
export type VariantRow = { readonly variant: 'A' | 'B'; readonly sent: number; readonly replies: number; readonly positive: number; readonly rate: string }
export type PostRow = { readonly label: string; readonly clicks: number }
export type MarketingResults = { readonly figures: readonly Figure[]; readonly variants: readonly VariantRow[]; readonly posts: readonly PostRow[] }

/** n of d as a percentage with one decimal; 0% when there is nothing to divide by, never NaN. */
export function rate(n: number, d: number): string {
  if (d <= 0) return '0%'
  return `${Math.round((n * 1000) / d) / 10}%`
}

export function marketingResults(input: {
  readonly letters: readonly LetterRow[]
  readonly replies: readonly ReplyRow[]
  readonly organisations: readonly { readonly createdAt: string }[]
  readonly activations: readonly ActivationRow[]
  readonly orders: readonly OrderRow[]
  readonly clicks: readonly ClickRow[]
  readonly money: (cents: number) => string
}): MarketingResults {
  const letterIds = new Set(input.letters.map((l) => l.id))
  const answers = input.replies.filter((r) => r.touchId !== null && letterIds.has(r.touchId))
  const repliedTo = new Set(answers.map((r) => r.touchId as string))
  const positiveTo = new Set(answers.filter((r) => POSITIVE_OUTCOMES.has(r.outcome)).map((r) => r.touchId as string))
  const acceptedTo = new Set(answers.filter((r) => r.outcome === 'yes').map((r) => r.touchId as string))
  const sent = input.letters.length

  const firstSend = input.letters.reduce<string | null>((min, l) => (min === null || l.sentAt < min ? l.sentAt : min), null)
  const registeredSince = firstSend === null ? 0 : input.organisations.filter((o) => o.createdAt >= firstSend).length

  const activated = new Set(input.activations.map((a) => a.organiserId).filter((x): x is string => Boolean(x)))
  const sold = input.orders.filter((o) => SOLD.has(o.status))
  const keptCents = sold.reduce((n, o) => n + (o.retainedCents ?? 0) - feeGivenBack(o), 0)
  const unrecorded = sold.filter((o) => o.retainedCents === null).length
  const eventsBy = new Map<string, Set<string>>()
  // A wholly refunded order sold nothing in the end, so it never makes an organiser a repeat one.
  for (const o of sold.filter((x) => x.status !== 'refunded' && x.totalCents > 0 && x.eventId)) {
    const s = eventsBy.get(o.organisationId) ?? new Set<string>()
    s.add(o.eventId as string)
    eventsBy.set(o.organisationId, s)
  }
  const repeat = [...eventsBy.values()].filter((s) => s.size >= 2).length

  const figures: Figure[] = [
    { key: 'sent', label: 'First contact emails sent', value: String(sent), detail: firstSend ? `first sent ${firstSend.slice(0, 10)}` : null,
      source: "outreach_touches: state sent, template acq_first (the ACQ-FIRST letter)" },
    { key: 'positive', label: 'Positive reply rate', value: rate(positiveTo.size, sent), detail: `${positiveTo.size} of ${sent} letters, ${repliedTo.size} replied at all`,
      source: 'outreach_replies on those letters: outcome yes or interested' },
    { key: 'accepted', label: 'Listings accepted', value: String(acceptedTo.size), detail: null,
      source: 'outreach_replies on those letters: outcome yes (happy for us to prepare the listing)' },
    { key: 'registered', label: 'Organisers registered', value: String(registeredSince), detail: `${input.organisations.length} in all`,
      source: "organisations created since the first letter went, the platform's own listings organisation left out" },
    { key: 'activations', label: 'Native ticketing activations', value: String(activated.size), detail: `${input.activations.length} steps proved`,
      source: 'ticketing_activations: organisers with a proved ticketing step' },
    { key: 'revenue', label: 'Ticketing revenue, EventLinqs fees', value: input.money(keptCents), detail: unrecorded ? `${unrecorded} sold order(s) record no kept fee` : null,
      source: 'orders sold (confirmed, partially refunded, refunded): platform_fee_retained_cents less the share refunds gave back; never the ticket value' },
    { key: 'repeat', label: 'Repeat organisers', value: String(repeat), detail: null,
      source: 'orders sold and not wholly refunded: organisations with paid orders on two or more events' },
  ]

  const variants: VariantRow[] = (['a', 'b'] as const).map((h) => {
    const mine = input.letters.filter((l) => l.half === h)
    const replies = mine.filter((l) => repliedTo.has(l.id)).length
    const positive = mine.filter((l) => positiveTo.has(l.id)).length
    return { variant: h === 'a' ? 'A' : 'B', sent: mine.length, replies, positive, rate: rate(replies, mine.length) }
  })

  const byPiece = new Map<string, { label: string; clicks: number }>()
  for (const c of input.clicks) {
    const p = byPiece.get(c.pieceId) ?? { label: c.label, clicks: 0 }
    p.clicks += 1
    byPiece.set(c.pieceId, p)
  }
  const posts = [...byPiece.values()].sort((a, b) => b.clicks - a.clicks || a.label.localeCompare(b.label))
  return { figures, variants, posts }
}
