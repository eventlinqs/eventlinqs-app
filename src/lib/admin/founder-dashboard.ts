import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { PUBLIC_EVENT_MATCH } from '@/lib/events/public-visibility'
import { listingWindowOrPredicate } from '@/lib/events/listing-window'
import { countFrom, inventoryFigures } from './founder-dashboard-math'
import { readSupplyScorecard } from '@/lib/growth/supply-scorecard'
import { readOrganiserFunnel } from '@/lib/growth/organiser-funnel'
import { readGrowthWeek } from '@/lib/growth/weekly'
import { runAllChecks } from '@/lib/health/checks'
import { weekStartOf } from '@/lib/social/campaign'
import { formatMoneyDisplay } from '@/lib/money/format'
import { CREDIT_DAYS } from '@/lib/social/results'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { figuresFor, type OrderRow } from '@/lib/growth/weekly-math'
import { economicsFigures, kitsSentAndUsed, type Cadence, type DashboardFigure, type DashboardSection, type FigureKind } from './founder-dashboard-math'

/**
 * The founder dashboard's figures (the master mandate of 29 October 2026, section 14; the order and attention rules
 * are in ./founder-dashboard-math.ts), read now for /admin/today, under Lawal's queue. Read only. Each figure comes from
 * the table its owner keeps, or from a reader that already exists (the supply scorecard, the organiser funnel, the
 * growth week, the platform health checks); a source that cannot be read is NOT COUNTED with its reason, never 0, so
 * one broken table never blanks the page.
 */

const DAY_MS = 24 * 60 * 60 * 1000
/** A count in Australian digit grouping: a number, not a date, so it carries no time zone. */
const count = new Intl.NumberFormat('en-AU')

type Counted = { readonly value: number | null; readonly note?: string }
type CountAnswer = { count: number | null; error: { message: string } | null }

async function counted(read: () => PromiseLike<CountAnswer>): Promise<Counted> {
  try {
    return countFrom(await read())
  } catch (err) {
    return { value: null, note: `could not be read: ${err instanceof Error ? err.message : String(err)}` }
  }
}

async function settle<T>(read: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; note: string }> {
  try {
    return { ok: true, value: await read() }
  } catch (err) {
    return { ok: false, note: `could not be read: ${err instanceof Error ? err.message : String(err)}` }
  }
}

const fig = (label: string, c: Counted, asksForAPerson: boolean, href: string | null, note?: string): DashboardFigure => ({
  label,
  value: c.value,
  asksForAPerson,
  href,
  ...(c.note || note ? { note: c.note ?? note } : {}),
})

/** Its place in the view by exception and its cadence (founder-dashboard-math.ts byException and rhythm). */
const tag = (f: DashboardFigure, kind: FigureKind, cadence: Cadence): DashboardFigure => ({ ...f, kind, cadence })

export async function readFounderDashboard(now: Date = new Date()): Promise<DashboardSection[]> {
  const admin = createAdminClient()
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS).toISOString()
  const dayAgo = new Date(now.getTime() - DAY_MS).toISOString()
  const head = { count: 'exact' as const, head: true }

  const [supply, funnel, growth, health, submissions, claims, media, permissions, pressesOut, claimsVerified, failedSends, sentThisWeek, reportsKept, loginFailures, campaign] =
    await Promise.all([
      settle(() => readSupplyScorecard(now)),
      settle(() => readOrganiserFunnel(now)),
      settle(() => readGrowthWeek(now)),
      settle(() => runAllChecks()),
      counted(() => admin.from('listing_submissions').select('id', head).eq('status', 'waiting')),
      counted(() => admin.from('listing_claims').select('id', head).eq('status', 'manual_open')),
      counted(() => admin.from('social_assets').select('id', head).eq('approval_status', 'pending')),
      counted(() => admin.from('organiser_permissions').select('id', head).is('withdrawn_at', null)),
      counted(() => admin.from('share_link_events').select('id', head).eq('kind', 'outbound').eq('is_test', false).gte('occurred_at', weekAgo)),
      counted(() => admin.from('listing_claims').select('id', head).in('status', ['verified', 'manual_approved']).gte('verified_at', weekAgo)),
      counted(() => admin.from('outreach_touches').select('id', head).not('failed_reason', 'is', null).gte('drafted_at', weekAgo)),
      counted(() => admin.from('outreach_touches').select('id', head).not('sent_at', 'is', null).gte('sent_at', weekAgo)),
      counted(() => admin.from('organiser_night_reports').select('id', head).gte('read_at', weekAgo)),
      counted(() => admin.from('audit_log').select('id', head).eq('action', 'admin.session.login.failure').gte('created_at', dayAgo)),
      settle(async () => {
        const { data, error } = await admin.from('social_campaigns').select('id').eq('week_start', weekStartOf(now)).limit(1)
        if (error) throw new Error(error.message)
        return data?.[0]?.id ?? null
      }),
    ])

  // The nights a visitor can find ahead at 7, 14 and 30 days, the booking links the daily check found dead on upcoming
  // nights, and the venue partners live (the DemandOS directive's section 11).
  const nightsAhead = (days: number) =>
    counted(() =>
      admin
        .from('events')
        .select('id', head)
        .match(PUBLIC_EVENT_MATCH)
        .or(listingWindowOrPredicate(now))
        .eq('is_seed_data', false)
        .lte('start_date', new Date(now.getTime() + days * DAY_MS).toISOString()),
    )
  const [next7, next14, next30, deadLinks, venuePartners] = await Promise.all([
    nightsAhead(7),
    nightsAhead(14),
    nightsAhead(30),
    counted(() =>
      admin
        .from('event_booking_links')
        .select('id, events!inner(id)', head)
        .eq('availability', 'dead')
        .match({ 'events.status': PUBLIC_EVENT_MATCH.status, 'events.visibility': PUBLIC_EVENT_MATCH.visibility })
        .gte('events.start_date', now.toISOString()),
    ),
    counted(() => admin.from('partners').select('id', head).eq('status', 'live').eq('kind', 'venue')),
  ])

  // This week's campaign, its pieces and where each stands.
  const marketing = await settle(async () => {
    if (!campaign.ok) throw new Error(campaign.note)
    if (campaign.value === null) return null
    const { data: pieces, error } = await admin.from('social_pieces').select('id, kind').eq('campaign_id', campaign.value).limit(500)
    if (error) throw new Error(error.message)
    const ids = (pieces ?? []).map((p) => p.id)
    if (ids.length === 0) return { pieces: 0, toApprove: 0, scheduled: 0, held: 0, posted: 0, kits: 0 }
    const [{ data: approvals, error: aErr }, { data: schedules, error: sErr }, { data: postings, error: pErr }] = await Promise.all([
      admin.from('social_piece_approvals').select('piece_id').in('piece_id', ids).limit(ids.length * 10),
      admin.from('social_piece_schedules').select('piece_id, state').in('piece_id', ids).limit(ids.length * 10),
      admin.from('social_piece_postings').select('piece_id').in('piece_id', ids).neq('post_url', 'sent').limit(ids.length * 10),
    ])
    if (aErr || sErr || pErr) throw new Error((aErr ?? sErr ?? pErr)?.message ?? 'unknown')
    const approved = new Set((approvals ?? []).map((a) => a.piece_id))
    return {
      pieces: ids.length,
      toApprove: ids.filter((id) => !approved.has(id)).length,
      scheduled: (schedules ?? []).filter((s) => s.state === 'scheduled').length,
      held: (schedules ?? []).filter((s) => s.state === 'held').length,
      posted: new Set((postings ?? []).map((p) => p.piece_id)).size,
      kits: (pieces ?? []).filter((p) => p.kind === 'partner_kit').length,
    }
  })

  // Partner kits sent in the credit window, and the real taps on each kit's own link since (the blueprint's 4D).
  const kits = await settle(async () => {
    const since = new Date(now.getTime() - CREDIT_DAYS * DAY_MS).toISOString()
    const sent = await readEveryRow<{ id: string; share_link_id: string | null; social_piece_postings: { posted_at: string } | { posted_at: string }[] }>('the partner kits sent', (from, to) =>
      admin.from('social_pieces').select('id, share_link_id, social_piece_postings!inner(posted_at)').eq('kind', 'partner_kit').gte('social_piece_postings.posted_at', since).order('id', { ascending: true }).range(from, to),
    )
    const rows = sent.map((k) => {
      const went = Array.isArray(k.social_piece_postings) ? k.social_piece_postings[0] : k.social_piece_postings
      return { sentAt: went ? new Date(went.posted_at).toISOString() : null, linkId: k.share_link_id }
    })
    const linkIds = [...new Set(rows.map((k) => k.linkId).filter((v): v is string => v !== null))]
    const taps =
      linkIds.length === 0
        ? []
        : await readEveryRow<{ id: string; link_id: string; occurred_at: string }>("the taps on the kits' own links", (from, to) =>
            admin.from('share_link_events').select('id, link_id, occurred_at').eq('kind', 'click').eq('is_test', false).in('link_id', linkIds).gte('occurred_at', since).order('id', { ascending: true }).range(from, to),
          )
    return kitsSentAndUsed(rows, taps.map((t) => ({ linkId: t.link_id, at: new Date(t.occurred_at).toISOString() })), now)
  })

  // The last 28 days' AUD orders, for the monthly contribution (the supreme specification, section 29), through the growth
  // page's own figuresFor so the month counts sold orders exactly as the week does.
  const month = await settle(async () => {
    const since = new Date(now.getTime() - 28 * DAY_MS).toISOString()
    const rows = await readEveryRow<{ total_cents: number; platform_fee_cents: number; status: string; created_at: string; organisation_id: string; event_id: string | null; platform_fee_retained_cents: number | null; stripe_processing_estimate_cents: number | null }>(
      'the orders of the last 28 days',
      (from, to) =>
        admin
          .from('orders')
          .select('total_cents, platform_fee_cents, status, created_at, organisation_id, event_id, platform_fee_retained_cents, stripe_processing_estimate_cents')
          .eq('currency', 'AUD')
          .gte('created_at', since)
          .order('id', { ascending: true })
          .range(from, to),
    )
    const orders: OrderRow[] = rows.map((o) => ({
      totalCents: Number(o.total_cents ?? 0),
      platformFeeCents: Number(o.platform_fee_cents ?? 0),
      status: o.status,
      createdAt: new Date(o.created_at).toISOString(),
      organisationId: o.organisation_id,
      eventId: o.event_id,
      retainedCents: o.platform_fee_retained_cents === null ? null : Number(o.platform_fee_retained_cents),
      processingCents: o.stripe_processing_estimate_cents === null ? null : Number(o.stripe_processing_estimate_cents),
    }))
    return figuresFor({ listings: [], visits: [], demand: [], saves: [], subscribers: [], orders, refunds: [] }, { from: since, to: now.toISOString(), monday: since.slice(0, 10) }).health
  })

  const sum = (pick: (c: { verifiedUpcoming: number; expiringSoon: number; awaitingVerification: number; missingCategory: number; cancelledThisWeek: number; newThisWeek: number; recurringSuppliers: number }) => number): Counted =>
    supply.ok ? { value: supply.value.cities.reduce((n, c) => n + pick(c), 0) } : { value: null, note: supply.note }
  const awaiting: Counted = supply.ok ? { value: sum((c) => c.awaitingVerification).value! + supply.value.waitingWithNoCity } : { value: null, note: supply.note }
  const step = (stage: string): Counted => {
    if (!funnel.ok) return { value: null, note: funnel.note }
    const s = funnel.value.steps.find((x) => x.stage === stage)
    return s?.organisers === null || s === undefined ? { value: null, note: 'its table is not on this database' } : { value: s.organisers }
  }
  const m = (pick: (v: { pieces: number; toApprove: number; scheduled: number; held: number; posted: number; kits: number }) => number): Counted =>
    !marketing.ok ? { value: null, note: marketing.note } : marketing.value === null ? { value: 0 } : { value: pick(marketing.value) }
  const g = growth.ok ? growth.value.lastFigures : null
  const failing = health.ok ? health.value.filter((r) => !r.ok) : null
  const commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 8)
  const environment = process.env.VERCEL_ENV ?? 'local'

  const notPlanned = marketing.ok && marketing.value === null
  const newNights = sum((c) => c.newThisWeek).value
  const posted = m((v) => v.posted).value

  // S16's measures that only the growth week and the organiser funnel hold (the supreme specification, section 16).
  const thisMonth = funnel.ok ? funnel.value.months[funnel.value.months.length - 1] ?? null : null
  const lastMonth = funnel.ok ? funnel.value.months[funnel.value.months.length - 2] ?? null : null
  const vic = growth.ok ? growth.value.victoria : null
  const notRead = growth.ok ? undefined : growth.note
  const money = (label: string, cents: number | null, note?: string): DashboardFigure => ({
    label,
    value: cents,
    asksForAPerson: false,
    href: '/admin/growth',
    ...(cents === null ? {} : { display: formatMoneyDisplay(cents, 'AUD') }),
    ...(note ? { note } : {}),
  })
  const economicsKind: Record<string, FigureKind> = {
    'Gross ticket sales last week': 'value',
    'Platform fee earned last week': 'value',
    'Payment cost last week': 'measure',
    'Contribution last week': 'value',
    'Break-even volume': 'measure',
  }
  const yesNo = (label: string, yes: boolean | null, note: string): DashboardFigure => ({
    label,
    value: yes === null ? null : yes ? 1 : 0,
    asksForAPerson: false,
    href: '/admin/growth',
    ...(yes === null ? { note: notRead ?? note } : { display: yes ? 'Yes' : 'No', note }),
  })

  return [
    {
      key: 'events',
      title: 'Events',
      figures: [
        tag(fig('Expiring in 7 days', sum((c) => c.expiringSoon), true, '/admin/collected', 'their source check lapses; re-check or they leave the site'), 'approve', 'daily'),
        tag(fig('Awaiting a check', awaiting, true, '/admin/collected'), 'approve', 'daily'),
        tag(fig('Missing a category', sum((c) => c.missingCategory), true, '/admin/events'), 'approve', 'weekly'),
        tag(fig('Cancelled this week', sum((c) => c.cancelledThisWeek), false, '/admin/events'), 'measure', 'daily'),
        tag(fig('Verified upcoming', sum((c) => c.verifiedUpcoming), false, '/admin/growth'), 'measure', 'weekly'),
        ...inventoryFigures({ next7, next14, next30, deadLinks, venuePartners }),
      ],
      done: newNights === null ? [] : [`${count.format(newNights)} ${newNights === 1 ? 'night' : 'nights'} published this week`],
    },
    {
      key: 'organisers',
      title: 'Organisers',
      figures: [
        tag(fig('Submissions waiting', submissions, true, '/admin/submissions'), 'approve', 'daily'),
        tag(fig('Claims to decide by hand', claims, true, null, 'listed in the queue above'), 'approve', 'daily'),
        tag(fig('Images awaiting approval', media, true, '/admin/social'), 'approve', 'daily'),
        tag(fig('Organisers found', step('found'), false, '/admin/growth'), 'measure', 'weekly'),
        tag(fig('Invited', step('invited'), false, '/admin/growth'), 'measure', 'weekly'),
        tag(fig('Claimed their listing', step('claimed'), false, '/admin/growth'), 'value', 'weekly'),
        tag(fig('Permissions given', permissions, false, null), 'measure', 'weekly'),
        tag(fig('Recurring partners', sum((c) => c.recurringSuppliers), false, '/admin/growth'), 'measure', 'weekly'),
        tag(
          fig(
            'Active organisers this month',
            thisMonth === null ? { value: null, note: funnel.ok ? 'no month read' : funnel.note } : { value: thisMonth.activeOrganisers },
            false,
            '/admin/growth',
            lastMonth === null ? 'an organiser with a public night this month' : `an organiser with a public night this month; ${count.format(lastMonth.activeOrganisers)} last month`,
          ),
          'measure',
          'monthly',
        ),
      ],
      done: [],
    },
    {
      key: 'marketing',
      title: 'Marketing',
      figures: [
        ...(notPlanned ? [tag(fig('This week not planned yet', { value: 1 }, true, '/admin/social', 'press Plan this week'), 'approve', 'weekly')] : []),
        tag(fig('Pieces to approve', m((v) => v.toApprove), true, '/admin/social'), 'approve', 'weekly'),
        tag(fig('Held from posting', m((v) => v.held), true, '/admin/social', 'a check stopped them; open each for its reason'), 'failed', 'daily'),
        tag(fig('Scheduled to post', m((v) => v.scheduled), false, '/admin/social'), 'scheduled', 'daily'),
        tag(fig('Pieces this week', m((v) => v.pieces), false, '/admin/social'), 'measure', 'weekly'),
        tag(fig('Partner kits this week', m((v) => v.kits), false, '/admin/social'), 'measure', 'weekly'),
        tag(fig(`Partner kits sent, ${CREDIT_DAYS} days`, kits.ok ? { value: kits.value.sent } : { value: null, note: kits.note }, false, '/admin/growth/social-report'), 'measure', 'weekly'),
        tag(
          fig(
            'Of those, used',
            kits.ok ? { value: kits.value.used } : { value: null, note: kits.note },
            false,
            '/admin/growth/social-report',
            kits.ok && kits.value.withoutALink > 0
              ? `its own link tapped at least once since it went; ${kits.value.withoutALink} sent without a link of its own cannot be judged`
              : 'its own link tapped at least once since it went; a kit sent is not a kit used',
          ),
          'value',
          'weekly',
        ),
      ],
      done: posted === null || posted === 0 ? [] : [`${count.format(posted)} ${posted === 1 ? 'piece' : 'pieces'} posted this week`],
    },
    {
      key: 'conversion',
      title: 'Revenue and conversion',
      figures: [
        tag(fig('Event page views last week', g ? { value: g.attention.views } : { value: null, note: notRead }, false, '/admin/growth'), 'measure', 'weekly'),
        tag(fig('Returning visitors last week', g ? { value: g.attention.returning } : { value: null, note: notRead }, false, '/admin/growth', 'seen in the 90 days before the week'), 'value', 'weekly'),
        tag(fig('Presses out to booking sites, 7 days', pressesOut, false, '/admin/growth', 'a press is a person heading to the tickets, never a sale'), 'value', 'weekly'),
        tag(fig('Paid orders last week', g ? { value: g.conversion.orders } : { value: null, note: notRead }, false, '/admin/growth'), 'value', 'weekly'),
        tag(fig('Claims verified, 7 days', claimsVerified, false, null), 'value', 'weekly'),
        tag(fig('New subscribers last week', g ? { value: g.engagement.subscribers } : { value: null, note: notRead }, false, '/admin/growth'), 'value', 'weekly'),
      ],
      done: [],
    },
    {
      key: 'economics',
      title: 'Economics',
      figures: [
        ...(g
          ? economicsFigures({ orderValueCents: g.conversion.orderValueCents, ...g.health }).map((f) => tag(f, economicsKind[f.label] ?? 'measure', f.label === 'Break-even volume' ? 'monthly' : 'weekly'))
          : [tag(money('Gross ticket sales last week', null, notRead), 'value', 'weekly')]),
        tag(
          money(
            'Net platform revenue last week',
            g ? g.health.marginCents + g.health.processingCents : null,
            g ? `the fee the platform kept, as each order records it${g.health.marginUnrecorded > 0 ? `; ${g.health.marginUnrecorded} left out` : ''}` : notRead,
          ),
          'value',
          'weekly',
        ),
        tag(money('Refunded to buyers last week', g ? g.health.refundedCents : null, g ? undefined : notRead), 'measure', 'weekly'),
        tag(
          money(
            'Contribution, last 28 days',
            month.ok ? month.value.marginCents : null,
            month.ok ? (month.value.marginUnrecorded > 0 ? `${month.value.marginUnrecorded} orders do not record it and are left out` : undefined) : month.note,
          ),
          'value',
          'monthly',
        ),
        tag({ label: 'Customer acquisition cost', value: null, asksForAPerson: false, href: null, note: 'not counted: no marketing spend is recorded, so none is assumed' }, 'measure', 'monthly'),
        tag({ label: 'Cash flow', value: null, asksForAPerson: false, href: null, note: 'not counted: the platform keeps no cash record; Stripe and the bank hold it' }, 'measure', 'monthly'),
      ],
      done: [],
    },
    {
      key: 'expansion',
      title: 'Expansion readiness (Victoria)',
      figures: [
        tag(
          {
            label: 'Recurring nights live',
            value: vic ? vic.recurringLive : null,
            asksForAPerson: false,
            href: '/admin/growth',
            ...(vic ? { display: `${count.format(vic.recurringLive)} of ${count.format(vic.recurringTarget)}` } : { note: notRead }),
          },
          'measure',
          'monthly',
        ),
        tag(fig('Repeat organisers', vic ? { value: vic.repeatOrganisers } : { value: null, note: notRead }, false, '/admin/growth', 'two or more real listings published in the state'), 'measure', 'monthly'),
        tag(yesNo('Returning visitors up', vic ? vic.returningUp : null, 'on the week before'), 'measure', 'monthly'),
        tag(yesNo('Margin positive', vic ? vic.marginPositive : null, 'last week, over the orders that record it'), 'measure', 'monthly'),
      ],
      done: [],
    },
    {
      key: 'operations',
      title: 'Operations',
      figures: [
        tag(fig('Health checks failing', failing === null ? { value: null, note: health.ok ? undefined : health.note } : { value: failing.length }, true, '/admin/health', failing && failing.length > 0 ? failing.map((f) => f.label).join(', ') : undefined), 'failed', 'daily'),
        tag(fig('Messages that failed to send, 7 days', failedSends, true, null), 'failed', 'daily'),
        tag(fig('Admin sign-in failures, 24 hours', loginFailures, true, '/admin/audit'), 'failed', 'daily'),
        tag({ label: 'Production', value: 0, asksForAPerson: false, href: null, display: commit ? `${environment}, ${commit}` : environment }, 'measure', 'daily'),
      ],
      done: [
        ...(reportsKept.value ? [`${count.format(reportsKept.value)} after-the-night ${reportsKept.value === 1 ? 'report' : 'reports'} kept`] : []),
        ...(sentThisWeek.value ? [`${count.format(sentThisWeek.value)} outreach ${sentThisWeek.value === 1 ? 'message' : 'messages'} sent`] : []),
      ],
    },
  ]
}
