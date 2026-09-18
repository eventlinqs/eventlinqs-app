import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  AUDIENCE_PRICE_BANDS,
  AUDIENCE_RECENCY_BANDS,
  recencyBandOf,
  type AudienceRecencyBand,
} from './segments'

/**
 * READING THE AUDIENCE ASSET. Counts only, and every one of them comes out of
 * the database.
 *
 * GA1 point 6 asks for an admin read-only view of the audience with counts by
 * city, community, price band and recency, plus the consent-state breakdown,
 * and it says "read from the database, nothing typed". So nothing here holds a
 * list of cities, communities or categories: the axes are whatever the rows
 * actually carry, and an axis with no rows behind it does not appear.
 *
 * NOTHING SENDS AND NOTHING EXPORTS, AND NO ADDRESS IS READ. GA1 point 6 says
 * counts only and point 7 says nothing sends, so this module returns numbers
 * and nothing else. A screen that can list the addresses is a sender in
 * everything but name, and the first draft of this file did exactly that
 * before it was cut: it selected `email` for a "ten newest joiners" panel that
 * nothing had asked for.
 */

export interface AudienceCount {
  key: string
  count: number
}

export interface AudienceConsentBreakdown {
  /** Rows in the audience: by construction every one of these is consented. */
  inAudience: number
  /** Subjects in the consent ledger, by their LATEST recorded decision. */
  granted: number
  withdrawn: number
  declined: number
  /** Consented but no confirmed order yet, so not an audience member. */
  grantedWithoutPurchase: number
  /**
   * Granted, but longer ago than the configured threshold, so the resolver
   * refuses them until they grant again. It is counted separately because it
   * is the only one of these numbers that changes on its own, with nobody
   * doing anything, and a list quietly ageing out is worth seeing coming.
   */
  awaitingReconfirmation: number
  /** The threshold those two numbers are measured against, from the database. */
  maxAgeMonths: number
}

export interface AudienceDashboard {
  total: number
  consent: AudienceConsentBreakdown
  byCity: AudienceCount[]
  byCommunity: AudienceCount[]
  byCategory: AudienceCount[]
  byPriceBand: AudienceCount[]
  byRecency: AudienceCount[]
  lifetimeSpendCents: number
  /** The opt-in rate over every answered question, GA1's reversal measure. */
  optInRate: { granted: number; asked: number; percent: number | null }
}

/** Tally a column of arrays into counts, highest first, then alphabetical. */
function tally(rows: (string[] | null)[]): AudienceCount[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    for (const value of row ?? []) {
      if (!value) continue
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

/**
 * The whole dashboard, in two reads.
 *
 * The rows are counted in the application rather than by a database view on
 * purpose: a view would be a second definition of the segmentation that could
 * drift from `src/lib/audience/segments.ts`, and the counts here are over
 * hundreds of rows, not millions. When that stops being true the answer is a
 * materialised view fed by the same function, not a second set of rules.
 */
export async function getAudienceDashboard(): Promise<AudienceDashboard> {
  const admin = createAdminClient()

  const [membersRes, eventsRes, policyRes] = await Promise.all([
    admin
      .from('audience_members')
      .select('city_slugs, community_slugs, category_slugs, price_band, last_order_at, lifetime_spend_cents'),
    /*
     * THE COUNTS COME OUT OF THE LEDGER, NOT OUT OF THE PROJECTION.
     *
     * public.marketing_consents holds the same answer and is easier to count,
     * but it is derived, and counting a derived table is how a screen ends up
     * reporting a number the resolver would disagree with. The state of a
     * person is the LATEST event for them, which is the same rule the send
     * path applies, so this page and the next send cannot tell different
     * stories about the same buyer.
     */
    admin
      .from('consent_events')
      .select('subject_email, decision, occurred_at')
      .order('occurred_at', { ascending: true }),
    admin.from('consent_policy').select('max_age_months').eq('id', true).maybeSingle(),
  ])

  const members = membersRes.data ?? []
  const maxAgeMonths = policyRes.data?.max_age_months ?? 24

  // Ordered oldest first above, so the last write per address wins.
  const latest = new Map<string, { decision: string; occurredAt: string }>()
  for (const row of eventsRes.data ?? []) {
    latest.set(row.subject_email, { decision: row.decision, occurredAt: row.occurred_at })
  }
  const states = [...latest.values()]

  const ageBoundary = new Date()
  ageBoundary.setMonth(ageBoundary.getMonth() - maxAgeMonths)

  const granted = states.filter(s => s.decision === 'granted').length
  const withdrawn = states.filter(s => s.decision === 'withdrawn').length
  const declined = states.filter(s => s.decision === 'declined').length
  const awaitingReconfirmation = states.filter(
    s => s.decision === 'granted' && Date.parse(s.occurredAt) < ageBoundary.getTime(),
  ).length

  const now = new Date()
  const recency = new Map<AudienceRecencyBand, number>()
  for (const band of AUDIENCE_RECENCY_BANDS) recency.set(band.band, 0)
  for (const m of members) {
    const band = recencyBandOf(m.last_order_at, now)
    recency.set(band, (recency.get(band) ?? 0) + 1)
  }

  const priceCounts = new Map<string, number>()
  for (const m of members) {
    priceCounts.set(m.price_band, (priceCounts.get(m.price_band) ?? 0) + 1)
  }

  const asked = granted + withdrawn + declined
  /*
   * The opt-in rate counts the GRANTS against every answer the platform has
   * on record, and a withdrawal counts as a grant that happened: they did opt
   * in, and then they left. Folding a withdrawal into the denominator alone
   * would quietly flatter the question by pretending it was never said yes to.
   */
  const optedIn = granted + withdrawn

  return {
    total: members.length,
    consent: {
      inAudience: members.length,
      granted,
      withdrawn,
      declined,
      grantedWithoutPurchase: Math.max(0, granted - members.length),
      awaitingReconfirmation,
      maxAgeMonths,
    },
    byCity: tally(members.map(m => m.city_slugs)),
    byCommunity: tally(members.map(m => m.community_slugs)),
    byCategory: tally(members.map(m => m.category_slugs)),
    // Cheapest band first, so the shape of the list reads as a distribution.
    // 'unknown' is a real answer the SQL can return (a buyer whose last order
    // has no countable ticket line) and it is shown last, never folded into
    // 'free', which would be a different and untrue claim about what they paid.
    byPriceBand: ([
      ...AUDIENCE_PRICE_BANDS.map(b => ({ key: b.band as string, count: priceCounts.get(b.band) ?? 0 })),
      { key: 'unknown', count: priceCounts.get('unknown') ?? 0 },
    ] satisfies AudienceCount[]).filter(b => b.count > 0),
    byRecency: AUDIENCE_RECENCY_BANDS.map(b => ({ key: b.band, count: recency.get(b.band) ?? 0 })).filter(
      b => b.count > 0,
    ),
    lifetimeSpendCents: members.reduce((sum, m) => sum + (m.lifetime_spend_cents ?? 0), 0),
    optInRate: {
      granted: optedIn,
      asked,
      percent: asked === 0 ? null : Math.round((optedIn / asked) * 1000) / 10,
    },
  }
}
