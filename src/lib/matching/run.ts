import 'server-only'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { captureException } from '@/lib/observability/sentry'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { normaliseSubjectEmail, LOCAL_DIGEST_PURPOSE } from '@/lib/consent/purposes'
import { filterPermittedRecipients } from '@/lib/consent/resolver'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { readMatchConfig, configSnapshot } from './config'
import { type AudienceRowForScoring, type EventForScoring, type MatchConfig } from './score'
import { composeRun } from './compose'
import { type SuppressionReason } from './suppress'

type Admin = SupabaseClient<Database>

/**
 * PRODUCING ONE MATCH RUN, WHICH IS THE ONLY PLACE THE MATCHER TOUCHES THE
 * DATABASE.
 *
 * The order is fixed and it is the whole design: read the configuration,
 * refuse if the switch is off or the event is not published, gather the facts,
 * SUPPRESS with a reason recorded per person, score whoever is left, rank,
 * truncate at the cap and RECORD the truncation, then write.
 *
 * NOTHING HERE SENDS. There is no transport import in this file and there is
 * not allowed to be one; the registered guard fails the build if that changes.
 * Sending is GA4, and it will read these rows rather than re-deciding.
 */

export type MatchRunRefusal =
  | 'matcher_disabled'
  | 'event_not_found'
  | 'event_not_published'
  | 'configuration_unusable'

export interface MatchRunResult {
  ok: boolean
  runId?: string
  refusal?: MatchRunRefusal
  detail?: string
  audienceConsidered?: number
  returned?: number
  truncated?: boolean
  suppressed?: Record<SuppressionReason, number>
}

/** The event facts the scorer needs, and the published check the run refuses on. */
async function loadEvent(admin: Admin, eventId: string) {
  /*
   * EVERY READ THROUGH THE DOOR, BECAUSE A MATCH RUN THAT FOUND NOBODY IS A
   * RESULT SOMEBODY ACTS ON.
   *
   * `null` from here makes the run refuse with "no such event". An empty tier
   * list silently changes the price band every candidate is scored against, and
   * an empty community map silently removes a whole scoring dimension. Each was
   * a discarded error, and none of them reads as a fault on /admin/matches: it
   * reads as a poor match.
   */
  const event = await readOrThrow('match run event', () =>
    admin
      .from('events')
      .select('id, slug, title, status, visibility, category_id, community_primary, city_primary, venue_postal_code, tags')
      .eq('id', eventId)
      .maybeSingle(),
  )
  if (!event) return null

  // Bound to a local so the narrowing survives into the closure: inside an
  // arrow, `event.category_id` is widened back to `string | null`.
  const categoryId = event.category_id
  const [category, tiers, communityMap] = await Promise.all([
    categoryId
      ? readOrThrow('match run category', () =>
          admin.from('event_categories').select('slug').eq('id', categoryId).maybeSingle(),
        )
      : Promise.resolve(null),
    // One event's active tiers. The bound is far above any real event and is
    // stated rather than left to the server's invisible 1,000-row ceiling.
    readOrThrow('match run ticket tiers', () =>
      admin.from('ticket_tiers').select('price').eq('event_id', eventId).eq('is_active', true).limit(500),
    ),
    readEveryRow('community_tag_map', (from, to) =>
      admin.from('community_tag_map').select('community_slug, tokens').order('community_slug').range(from, to),
    ),
  ])

  const prices = (tiers ?? []).map(t => t.price).sort((a, b) => a - b)
  const median = prices.length > 0 ? prices[Math.floor(prices.length / 2)] : null

  /*
   * THE COMMUNITY VALUE IS READ FROM THE TAXONOMY TABLE, never from a list in
   * this file. The organiser's own answer wins where they gave one; otherwise
   * the event's tags are intersected with public.community_tag_map, which is
   * the same resolution the audience row was built with, held equal to
   * src/lib/communities/tag-bridge.ts by a registered guard.
   */
  const tags = Array.isArray(event.tags) ? event.tags.map(String) : []
  const communities = new Set<string>()
  if (event.community_primary) communities.add(event.community_primary)
  for (const row of communityMap ?? []) {
    if (tags.some(tag => (row.tokens ?? []).includes(tag))) communities.add(row.community_slug)
  }

  return {
    row: event,
    scoring: {
      id: event.id,
      categorySlug: category?.slug ?? null,
      communitySlugs: [...communities],
      citySlug: event.city_primary,
      postcode: event.venue_postal_code,
      medianTierPriceCents: median,
    } satisfies EventForScoring,
  }
}

export async function produceMatchRun(
  admin: Admin,
  params: { eventId: string; cap?: number; channel?: 'email' | 'sms'; actorUserId?: string | null; now?: Date },
): Promise<MatchRunResult> {
  const now = params.now ?? new Date()
  const channel = params.channel ?? 'email'

  if (!(await isFeatureEnabled('marketing_matcher_enabled'))) {
    return { ok: false, refusal: 'matcher_disabled', detail: 'the matcher is switched off' }
  }

  let config: MatchConfig
  try {
    config = await readMatchConfig(admin)
  } catch (error) {
    return {
      ok: false,
      refusal: 'configuration_unusable',
      detail: error instanceof Error ? error.message : 'the configuration could not be read',
    }
  }

  const event = await loadEvent(admin, params.eventId)
  if (!event) return { ok: false, refusal: 'event_not_found', detail: 'no event with that id' }
  if (event.row.status !== 'published') {
    return {
      ok: false,
      refusal: 'event_not_published',
      detail: `the event is ${event.row.status}, and a match is only produced for a published event`,
    }
  }

  const cap = Math.max(1, Math.min(params.cap ?? config.maxRecipientsPerRun, config.maxRecipientsPerRun))

  /*
   * THE WHOLE AUDIENCE, NOT THE FIRST THOUSAND OF IT. Unbounded until
   * 19 September 2026: past a thousand members the matcher would have scored
   * a thousand people and silently ignored everybody else, for ever, with the
   * run reporting a healthy match count the whole time.
   */
  const audience = await readEveryRow('audience_members', (from, to) =>
    admin
      .from('audience_members')
      .select(
        'id, email, category_slugs, community_slugs, city_slugs, postcode, price_band, last_order_at, lifetime_spend_cents, consent_channel',
      )
      .order('id', { ascending: true })
      .range(from, to),
  )

  // The facts suppression needs, gathered once for the whole audience rather
  // than per person: one query each instead of three per row.
  const emails = audience.map(m => normaliseSubjectEmail(m.email))
  const [permitted, ticketHolders, sends, suppressions] = await Promise.all([
    filterPermittedRecipients(admin, emails, { purpose: LOCAL_DIGEST_PURPOSE, channel, now }),
    /*
     * ALL THREE ARE SUPPRESSION LISTS, SO A SHORT READ SENDS RATHER THAN
     * WITHHOLDS. A sold-out event passes a thousand confirmed orders easily,
     * and a truncated holder list means mailing "come to this" to people
     * holding a ticket for it. A truncated recovery_suppressions means mailing
     * somebody who asked not to be. Paged, and the pager throws rather than
     * returning a short list.
     */
    readEveryRow('the event’s confirmed orders', (from, to) =>
      admin
        .from('orders')
        .select('guest_email, user_id')
        .eq('event_id', params.eventId)
        .eq('status', 'confirmed')
        .order('id', { ascending: true })
        .range(from, to),
    ).then(data => ({ data })),
    readEveryRow('recovery_sends', (from, to) =>
      admin.from('recovery_sends').select('contact_email, sent_at').order('id', { ascending: true }).range(from, to),
    ).then(data => ({ data })),
    readEveryRow('recovery_suppressions', (from, to) =>
      admin
        .from('recovery_suppressions')
        .select('contact_email, reason')
        .order('id', { ascending: true })
        .range(from, to),
    ).then(data => ({ data })),
  ])

  const permittedSet = new Set(permitted.permitted)
  const holderEmails = new Set(
    (ticketHolders.data ?? []).map(o => normaliseSubjectEmail(o.guest_email ?? '')).filter(Boolean),
  )
  const lastSent = new Map<string, string>()
  for (const row of sends.data ?? []) {
    const email = normaliseSubjectEmail(row.contact_email)
    const current = lastSent.get(email)
    if (!current || Date.parse(row.sent_at) > Date.parse(current)) lastSent.set(email, row.sent_at)
  }
  const bounced = new Set(
    (suppressions.data ?? [])
      .filter(row => row.reason === 'bounced' || row.reason === 'complained')
      .map(row => normaliseSubjectEmail(row.contact_email)),
  )
  const unsubscribed = new Set(
    (suppressions.data ?? [])
      .filter(row => row.reason === 'unsubscribed')
      .map(row => normaliseSubjectEmail(row.contact_email)),
  )

  const members: AudienceRowForScoring[] = audience.map(row => ({
    id: row.id,
    email: normaliseSubjectEmail(row.email),
    categorySlugs: row.category_slugs ?? [],
    communitySlugs: row.community_slugs ?? [],
    citySlugs: row.city_slugs ?? [],
    postcode: row.postcode,
    priceBand: (row.price_band ?? 'unknown') as AudienceRowForScoring['priceBand'],
    lastOrderAt: row.last_order_at,
    lifetimeSpendCents: row.lifetime_spend_cents ?? 0,
    consentChannel: (row.consent_channel ?? null) as AudienceRowForScoring['consentChannel'],
  }))

  const composed = composeRun(
    members,
    event.scoring,
    config,
    member => ({
      consentPermitted: permittedSet.has(member.email),
      unsubscribed: unsubscribed.has(member.email),
      holdsTicket: holderEmails.has(member.email),
      lastSentAt: lastSent.get(member.email) ?? null,
      bouncedOrComplained: bounced.has(member.email),
    }),
    { now, channel, cap },
  )
  const { funnel, truncated } = { funnel: composed.funnel, truncated: composed.truncated }
  const returned = composed.ranked

  const { data: run, error: runError } = await admin
    .from('marketing_match_run')
    .insert({
      event_id: params.eventId,
      method_name: config.methodName,
      method_version: config.methodVersion,
      config_snapshot: configSnapshot(config) as never,
      requested_cap: cap,
      audience_considered: composed.considered,
      suppressed_by_reason: funnel as never,
      returned_count: 0,
      truncated,
      actor_user_id: params.actorUserId ?? null,
    })
    .select('id')
    .single()

  if (runError || !run) {
    captureException(runError, { where: 'lib/matching/run:insert-run' })
    return { ok: false, refusal: 'configuration_unusable', detail: runError?.message ?? 'the run could not be written' }
  }

  if (returned.length > 0) {
    const { error: scoreError } = await admin.from('marketing_match_score').insert(
      returned.map((entry, index) => ({
        run_id: run.id,
        audience_member_id: entry.member.id,
        score: entry.score,
        breakdown: entry.breakdown as never,
        rank: index + 1,
      })),
    )
    if (scoreError) {
      captureException(scoreError, { where: 'lib/matching/run:insert-scores' })
      return { ok: false, runId: run.id, refusal: 'configuration_unusable', detail: scoreError.message }
    }
  }

  await admin
    .from('marketing_match_run')
    .update({ returned_count: returned.length, finished_at: new Date().toISOString() })
    .eq('id', run.id)

  return {
    ok: true,
    runId: run.id,
    audienceConsidered: composed.considered,
    returned: returned.length,
    truncated,
    suppressed: funnel,
  }
}
