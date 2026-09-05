import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { isAcceptableStreamLink, STREAM_LINK_MAX_LENGTH } from './embed'

/**
 * THE ONLY READER AND WRITER OF THE STREAM LINK VAULT (Scope v5, 3.11).
 *
 * The link lives in event_stream_links, never on the events row, because the
 * events row is readable by anon for every published event and the link is
 * revealed only to a confirmed ticket holder (migration 20260903000002 and
 * scripts/guards/stream-link-never-public.mjs, which allows this file and the
 * organiser's own surfaces to name the table and nothing else).
 *
 * Callers pass the client they hold. The organiser dashboard passes the
 * session client, so RLS scopes the row to their own events. The bearer-gated
 * watch surface passes the service role AFTER src/lib/stream/access.ts has
 * decided the holder may see it. Neither path is ever handed the value early.
 */
type Db = SupabaseClient<Database>

export async function readStreamLink(db: Db, eventId: string): Promise<string | null> {
  const { data, error } = await db
    .from('event_stream_links')
    .select('url')
    .eq('event_id', eventId)
    .maybeSingle()
  if (error) {
    // Not swallowed: a discarded error reads as "no link" and the organiser is
    // told to add one they already added.
    console.error('[stream-link] read failed:', error)
    return null
  }
  return data?.url ?? null
}

export type WriteStreamLinkResult = { ok: true } | { ok: false; error: string }

/** A blank value removes the link. Anything else must be an acceptable stream address. */
export async function writeStreamLink(db: Db, eventId: string, raw: string | null | undefined): Promise<WriteStreamLinkResult> {
  const url = (raw ?? '').trim()
  if (!url) {
    const { error } = await db.from('event_stream_links').delete().eq('event_id', eventId)
    if (error) return { ok: false, error: `Could not clear the stream link: ${error.message}` }
    return { ok: true }
  }
  if (!isAcceptableStreamLink(url)) {
    return {
      ok: false,
      error: `Enter the link your viewers will open: an https address or an rtmp address, up to ${STREAM_LINK_MAX_LENGTH} characters.`,
    }
  }
  const { error } = await db
    .from('event_stream_links')
    .upsert({ event_id: eventId, url, updated_at: new Date().toISOString() }, { onConflict: 'event_id' })
  if (error) return { ok: false, error: `Could not save the stream link: ${error.message}` }
  return { ok: true }
}
