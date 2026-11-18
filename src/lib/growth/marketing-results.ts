import type { SupabaseClient } from '@supabase/supabase-js'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { formatMoneyDisplay } from '@/lib/money/format'
import { refundedOf, type OrderRow } from '@/lib/growth/weekly-math'
import { marketingResults, type ClickRow, type LetterRow, type MarketingResults } from '@/lib/growth/marketing-results-math'
import { LISTINGS_ORGANISATION_SLUG } from '@/lib/listings/shown-organiser'

/**
 * THE ORGANISER MARKETING RESULTS, READ FROM PRODUCTION'S ROWS ONLY (the PM's 12:40 of 18 November 2026, item 5). The
 * ACQ-FIRST letters are the touches made from the acq_first template (the ACQ go of 18 November); the counting is
 * marketing-results-math.ts. It reads no column the Centre's migration adds, so it stands on the database as it is.
 * Nothing here writes.
 */
type Db = SupabaseClient

export async function readMarketingResults(db: Db): Promise<MarketingResults> {
  const templates = await readEveryRow<{ id: string }>('the ACQ-FIRST templates', (a, b) =>
    db.from('outreach_templates').select('id').eq('key', 'acq_first').order('id').range(a, b) as never,
  )
  const templateIds = templates.map((t) => t.id)
  const letters: LetterRow[] = templateIds.length === 0 ? [] : (
    await readEveryRow<{ id: string; sent_at: string | null; half: string | null }>('the ACQ-FIRST letters sent', (a, b) =>
      db.from('outreach_touches').select('id, sent_at, half').in('template_id', templateIds).eq('state', 'sent').order('id').range(a, b) as never,
    )
  ).filter((t) => t.sent_at).map((t) => ({ id: t.id, sentAt: new Date(t.sent_at as string).toISOString(), half: t.half === 'a' || t.half === 'b' ? t.half : null }))

  const replies = await readEveryRow<{ touch_id: string | null; outcome: string }>('the replies', (a, b) =>
    db.from('outreach_replies').select('touch_id, outcome').order('id').range(a, b) as never,
  )
  const organisations = await readEveryRow<{ created_at: string; slug: string | null }>('the organisations', (a, b) =>
    db.from('organisations').select('created_at, slug').order('id').range(a, b) as never,
  )
  const activations = await readEveryRow<{ organiser_id: string | null }>('the ticketing activations', (a, b) =>
    db.from('ticketing_activations').select('organiser_id').order('id').range(a, b) as never,
  )
  const orders = await readEveryRow<{
    total_cents: number; platform_fee_cents: number; status: string; created_at: string; organisation_id: string; event_id: string | null
    platform_fee_retained_cents: number | null; stripe_processing_estimate_cents: number | null; refunds: { amount_cents: number; status: string }[] | null
  }>('the AUD orders', (a, b) =>
    db.from('orders')
      .select('total_cents, platform_fee_cents, status, created_at, organisation_id, event_id, platform_fee_retained_cents, stripe_processing_estimate_cents, refunds(amount_cents, status)')
      .eq('currency', 'AUD').order('id').range(a, b) as never,
  )
  const clickRows = await readEveryRow<{ piece_id: string }>('the post clicks', (a, b) =>
    db.from('share_link_events').select('piece_id').eq('kind', 'click').eq('is_test', false).not('piece_id', 'is', null).order('id').range(a, b) as never,
  )
  const pieceIds = [...new Set(clickRows.map((c) => c.piece_id))]
  const labels = new Map<string, string>()
  for (let i = 0; i < pieceIds.length; i += 100) {
    // At most 100 ids a batch, so at most 100 rows: the bound is stated, never Supabase's silent 1,000.
    const { data } = await db.from('social_pieces').select('id, partner_name, kind, city').in('id', pieceIds.slice(i, i + 100)).limit(100)
    for (const p of data ?? []) labels.set(p.id as string, (p.partner_name as string | null) ?? `${p.kind} ${p.city}`)
  }
  const clicks: ClickRow[] = clickRows.map((c) => ({ pieceId: c.piece_id, label: labels.get(c.piece_id) ?? 'a post' }))

  return marketingResults({
    letters,
    replies: replies.map((r) => ({ touchId: r.touch_id, outcome: r.outcome })),
    // The platform's own listings organisation is not an organiser that registered.
    organisations: organisations.filter((o) => o.slug !== LISTINGS_ORGANISATION_SLUG).map((o) => ({ createdAt: new Date(o.created_at).toISOString() })),
    activations: activations.map((a) => ({ organiserId: a.organiser_id })),
    orders: orders.map((o): OrderRow => ({
      totalCents: Number(o.total_cents ?? 0),
      platformFeeCents: Number(o.platform_fee_cents ?? 0),
      status: o.status,
      createdAt: new Date(o.created_at).toISOString(),
      organisationId: o.organisation_id,
      eventId: o.event_id,
      retainedCents: o.platform_fee_retained_cents === null ? null : Number(o.platform_fee_retained_cents),
      processingCents: o.stripe_processing_estimate_cents === null ? null : Number(o.stripe_processing_estimate_cents),
      refundedCents: refundedOf(o.refunds),
    })),
    clicks,
    money: (cents) => formatMoneyDisplay(cents, 'AUD'),
  })
}
