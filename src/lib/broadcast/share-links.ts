import { createHash, randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSupabaseServiceRoleKey } from '@/lib/supabase/env'

/**
 * Broadcast Layer Stage 1 core: trackable share links.
 * SPEC: docs/EventLinqs-Broadcast-Layer-SPEC.md sections 2.3 and 2.5.
 *
 * A share link is a short opaque code (/s/[code]) tied to one event, one
 * channel, and optionally one artist (Stage 3). Clicks, event-page views,
 * and conversions land in share_link_events, so the reach panel shows only
 * measured numbers: honest by construction.
 *
 * Attribution integrity (the adversarial invariant): a code is validated
 * by STRICT format first and then by existence in share_links. A forged,
 * tampered, or expired code fails one of the two and writes nothing.
 * A conversion additionally requires the link's event to match the order's
 * event, and the (link_id, order_id) unique index caps every order at one
 * conversion per link. The order id is a read-only reference: this module
 * never writes to order, payment, or payout tables.
 */

export {
  SHARE_CHANNELS,
  SHARE_COOKIE,
  SHARE_COOKIE_MAX_AGE_SECONDS,
  SHARE_CODE_LENGTH,
  buildShortUrl,
  isShareChannel,
  isValidShareCode,
} from '@/lib/broadcast/share-codes'
export type { ShareChannel } from '@/lib/broadcast/share-codes'

import { CLICK_DEDUPE_WINDOW_SECONDS } from '@/lib/broadcast/crawler'
import { buildReadableCode, codeDateToken, isValidReadableCode } from '@/lib/broadcast/short-links'
import {
  SHARE_CODE_LENGTH as CODE_LENGTH,
  isValidShareCode as isValidCode,
  type ShareChannel,
} from '@/lib/broadcast/share-codes'

const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** Generate a cryptographically random base62 share code (62^10 > 8e17). */
export function generateShareCode(): string {
  const bytes = randomBytes(CODE_LENGTH)
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += BASE62[bytes[i] % 62]
  }
  return out
}

/**
 * Salted one-way hash identifying a visitor for de-duplication only (repeat
 * views and clicks). Never reversible to an identity and never joined to a
 * user. The salt is the service key's first bytes so the hash is stable per
 * deployment without a dedicated secret.
 */
export function visitorHash(ip: string | null, userAgent: string | null): string {
  // Resolver, not the raw base var: on a preview the raw var holds the
  // PRODUCTION service-role key, so preview visitor hashes were salted with a
  // production secret and collided with the production hash space.
  const salt = (getSupabaseServiceRoleKey() || 'el-broadcast').slice(0, 16)
  return createHash('sha256')
    .update(`${salt}|${ip ?? 'unknown'}|${userAgent ?? 'unknown'}`)
    .digest('hex')
    .slice(0, 32)
}

export type ShareLinkRow = {
  id: string
  event_id: string
  artist_id: string | null
  channel: ShareChannel
  code: string
  created_by: string | null
  created_at: string
}

export type BroadcastClient = Pick<ReturnType<typeof createAdminClient>, 'from'>

/**
 * Look up a share link by code. Strict format validation happens BEFORE the
 * database sees the value, so a forged code costs one regex test, not a query.
 */
export async function resolveShareLink(
  code: string,
  opts?: { client?: BroadcastClient },
): Promise<ShareLinkRow | null> {
  // BOTH formats. A readable code (basement-45-ig) is what is minted now; a
  // legacy random code is what is printed on posters already hanging in venue
  // windows, and those must resolve for as long as the paper lasts.
  if (!isValidCode(code) && !isValidReadableCode(code)) return null
  const client = opts?.client ?? createAdminClient()
  const { data, error } = await client
    .from('share_links')
    .select('id, event_id, artist_id, channel, code, created_by, created_at')
    .eq('code', code)
    .maybeSingle()
  if (error || !data) return null
  return data as ShareLinkRow
}

/**
 * Reuse an existing link for (event, channel, artist, creator) or mint a new
 * one. Reuse keeps one link per sharer per channel, so channel aggregates in
 * the reach panel stay clean and repeated shares do not mint junk rows.
 */
export async function getOrCreateShareLink(
  input: {
    eventId: string
    channel: ShareChannel
    artistId?: string | null
    createdBy?: string | null
    /**
     * The event slug, used to mint a READABLE code (basement-45-ig). Omit it
     * and the link falls back to a random code, which still works everywhere;
     * a code is only ever as readable as the information available when it was
     * minted.
     */
    eventSlug?: string | null
    /**
     * Start date and timezone. A recurring night collides with itself on the
     * plain name, and the answer to that collision is the DATE, so a weekly
     * event reads basement-45-26sep-ig rather than turning opaque.
     */
    eventStartDate?: string | null
    eventTimezone?: string | null
  },
  opts?: { client?: BroadcastClient },
): Promise<ShareLinkRow | null> {
  const client = opts?.client ?? createAdminClient()
  const artistId = input.artistId ?? null
  const createdBy = input.createdBy ?? null

  let lookup = client
    .from('share_links')
    .select('id, event_id, artist_id, channel, code, created_by, created_at')
    .eq('event_id', input.eventId)
    .eq('channel', input.channel)
  lookup = artistId === null ? lookup.is('artist_id', null) : lookup.eq('artist_id', artistId)
  lookup = createdBy === null ? lookup.is('created_by', null) : lookup.eq('created_by', createdBy)
  const { data: existing } = await lookup.limit(1).maybeSingle()
  if (existing) return existing as ShareLinkRow

  const code = await mintCode(
    client,
    input.eventId,
    input.channel,
    input.eventSlug ?? null,
    codeDateToken(input.eventStartDate ?? null, input.eventTimezone ?? null),
  )

  const { data: created, error } = await client
    .from('share_links')
    .insert({
      event_id: input.eventId,
      channel: input.channel,
      artist_id: artistId,
      created_by: createdBy,
      code,
    })
    .select('id, event_id, artist_id, channel, code, created_by, created_at')
    .single()
  if (error || !created) return null
  return created as ShareLinkRow
}

/**
 * Choose the code for a new link.
 *
 * A readable code is preferred, because the address is the only thing a
 * stranger judges before tapping and "Rk9dW2xa" tells them nothing. A
 * collision is answered with the event's DATE rather than a number, because
 * the event that collides with itself is the weekly night, and a dated code
 * serves that case better than an undated one.
 *
 * A CODE IS NEVER REUSED. The unique index on share_links.code is what
 * guarantees it, and this loop only ever asks for codes the index says are
 * free. Luma publishes the opposite behaviour in their own help centre, where
 * a released address can be claimed by a stranger and the old link then points
 * at someone else's page. See docs/strategy/SHARE-LINK-SCHEME.md.
 */
async function mintCode(
  client: BroadcastClient,
  eventId: string,
  channel: ShareChannel,
  eventSlug: string | null,
  dateToken: string | null,
): Promise<string> {
  if (!eventSlug) return generateShareCode()

  // The ladder: the plain name, then the name with the date, then the dated
  // name numbered. The dated form is where a recurring night lands, and it
  // reads BETTER there than the undated one because it says which night.
  const candidates: string[] = [buildReadableCode(eventSlug, channel)]
  if (dateToken) {
    candidates.push(buildReadableCode(eventSlug, channel, { dateToken }))
    for (let n = 2; n <= 9; n += 1) {
      candidates.push(buildReadableCode(eventSlug, channel, { dateToken, disambiguator: n }))
    }
  } else {
    for (let n = 2; n <= 9; n += 1) {
      candidates.push(buildReadableCode(eventSlug, channel, { disambiguator: n }))
    }
  }

  for (const candidate of candidates) {
    if (!isValidReadableCode(candidate)) continue
    const { data: taken } = await client
      .from('share_links')
      .select('id, event_id')
      .eq('code', candidate)
      .maybeSingle()
    if (!taken) return candidate
    // Held by this same event under another creator: reuse is safe and keeps
    // one readable address per event per channel.
    if ((taken as { event_id: string }).event_id === eventId) return candidate
  }
  // Effectively unreachable: it needs the same event name, on the same day, in
  // the same channel, nine times over. A working opaque link still beats no
  // link, so this is a floor rather than a failure.
  return generateShareCode()
}

export type ShareLinkEventKind = 'view' | 'click' | 'conversion'

/**
 * Record one attribution event. For views the (link, visitor, day) is
 * de-duplicated so a refresh never inflates the panel; clicks are recorded
 * per hit; conversions are capped by the unique (link_id, order_id) index.
 */
export async function recordShareLinkEvent(
  input: {
    linkId: string
    kind: ShareLinkEventKind
    orderId?: string | null
    visitorHash?: string | null
  },
  opts?: { client?: BroadcastClient },
): Promise<boolean> {
  const client = opts?.client ?? createAdminClient()

  if (input.kind === 'view' && input.visitorHash) {
    const dayStart = new Date()
    dayStart.setUTCHours(0, 0, 0, 0)
    const { data: dupe } = await client
      .from('share_link_events')
      .select('id')
      .eq('link_id', input.linkId)
      .eq('kind', 'view')
      .eq('visitor_hash', input.visitorHash)
      .gte('occurred_at', dayStart.toISOString())
      .limit(1)
      .maybeSingle()
    if (dupe) return true
  }

  // Clicks de-duplicate on a shorter window than views. One person tapping the
  // same link twice inside an hour, or one phone re-scanning the same poster,
  // is one interested person. Views were already de-duplicated per day; clicks
  // were not de-duplicated at all, which is half of why the click number ran
  // so far ahead of the view number.
  if (input.kind === 'click' && input.visitorHash) {
    const since = new Date(Date.now() - CLICK_DEDUPE_WINDOW_SECONDS * 1000)
    const { data: recent } = await client
      .from('share_link_events')
      .select('id')
      .eq('link_id', input.linkId)
      .eq('kind', 'click')
      .eq('visitor_hash', input.visitorHash)
      .gte('occurred_at', since.toISOString())
      .limit(1)
      .maybeSingle()
    if (recent) return true
  }

  const { error } = await client.from('share_link_events').insert({
    link_id: input.linkId,
    kind: input.kind,
    order_id: input.orderId ?? null,
    visitor_hash: input.visitorHash ?? null,
  })
  // The partial unique index rejects a duplicate conversion; that is a
  // success from the caller's perspective (the sale is already counted).
  if (error) return error.code === '23505'
  return true
}
