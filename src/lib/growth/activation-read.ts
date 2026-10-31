import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ORG_SALE_FIELDS_SELECT, ticketsOnSale, verifyOrgSaleFields } from '@/lib/payments/sale-status'
import type { ActivationFacts } from './activation'

/**
 * THE RECORDS BEHIND ONE ORGANISER'S ACTIVATION (V3 item 6; the rule is ./activation.ts). Every step's time is read
 * from a row the platform already writes, so nothing here is recorded twice and nothing is guessed:
 *
 *   claim          listing_claims: a claim by the organisation's owner (came by a claim), and its verified_at
 *   organisation   organisations.created_at
 *   payouts        the sale decision on the organisation's Stripe fields (sale-status.ts), at stripe_status_verified_at
 *   tickets        the earliest active paid tier on an upcoming night of theirs with no outside ticket link
 *   published      the earliest published_at among those ticketed nights
 *   checkout       a published ticketed night the sale decision puts on sale, at the later of payouts and its publication
 *   first_sale     the first confirmed order with a total above zero
 *
 * A read that fails throws: an organiser's checklist must never say "not done" because a socket dropped.
 */
export async function readActivationFacts(client: SupabaseClient, organisationId: string, now: Date = new Date()): Promise<ActivationFacts> {
  const must = <T>(label: string, r: { data: T; error: { message: string } | null }): T => {
    if (r.error) throw new Error(`activation: ${label}: ${r.error.message}`)
    return r.data
  }
  const org = must(
    'the organisation',
    await client.from('organisations').select(`id, owner_id, created_at, stripe_status_verified_at, ${ORG_SALE_FIELDS_SELECT}`).eq('id', organisationId).maybeSingle(),
  ) as { id: string; owner_id: string; created_at: string; stripe_status_verified_at: string | null } | null
  if (!org) throw new Error(`activation: no organisation ${organisationId}`)

  const [claims, nights, sale] = await Promise.all([
    client.from('listing_claims').select('status, verified_at').eq('claimant_user_id', org.owner_id).order('created_at'),
    client
      .from('events')
      .select('id, status, published_at, end_date, external_ticket_url, ticket_tiers(price, is_active, created_at)')
      .eq('organisation_id', organisationId)
      .gte('end_date', now.toISOString()),
    client
      .from('orders')
      .select('confirmed_at')
      .eq('organisation_id', organisationId)
      .gt('total_cents', 0)
      .not('confirmed_at', 'is', null)
      .order('confirmed_at')
      .limit(1),
  ])
  const claimRows = must('the claims', claims) as { status: string; verified_at: string | null }[]
  const nightRows = must('the upcoming nights', nights) as {
    id: string
    status: string
    published_at: string | null
    end_date: string
    external_ticket_url: string | null
    ticket_tiers: { price: number; is_active: boolean; created_at: string }[] | null
  }[]
  const saleRows = must('the first sale', sale) as { confirmed_at: string }[]

  const verdict = verifyOrgSaleFields(org)
  const orgFields = verdict.complete ? verdict.org : null
  const canTakeMoney = ticketsOnSale({ isPaidEvent: true, org: orgFields, event: null })
  const payoutsAt = canTakeMoney ? org.stripe_status_verified_at ?? org.created_at : null

  const earliest = (xs: (string | null)[]) => xs.filter((x): x is string => !!x).sort()[0] ?? null
  const latest = (xs: (string | null)[]) => (xs.some((x) => !x) ? null : xs.filter((x): x is string => !!x).sort().at(-1) ?? null)

  const ticketed = nightRows.filter((n) => !n.external_ticket_url && (n.ticket_tiers ?? []).some((t) => t.is_active && t.price > 0))
  const published = ticketed.filter((n) => n.status === 'published' && n.published_at)
  const onSale = published.filter((n) => ticketsOnSale({ isPaidEvent: true, org: orgFields, event: n }))

  const verified = claimRows.find((c) => c.status === 'verified' && c.verified_at)
  return {
    cameByClaim: claimRows.length > 0,
    claimVerifiedAt: verified?.verified_at ?? null,
    organisationAt: org.created_at,
    payoutsAt,
    ticketsAt: earliest(ticketed.flatMap((n) => (n.ticket_tiers ?? []).filter((t) => t.is_active && t.price > 0).map((t) => t.created_at))),
    publishedAt: earliest(published.map((n) => n.published_at)),
    checkoutAt: earliest(onSale.map((n) => latest([payoutsAt, n.published_at]))),
    firstSaleAt: saleRows[0]?.confirmed_at ?? null,
  }
}
