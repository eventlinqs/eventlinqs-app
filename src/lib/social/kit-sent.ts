import type { SupabaseClient } from '@supabase/supabase-js'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { readEveryRowIn } from '@/lib/supabase/read-every-row-in'

/**
 * WHEN A PARTNER KIT WENT (order 4, Release 2 item 9: "partner kits to every activated organiser, kit sent recorded
 * apart from kit used"; WINDOW 5A, 13 November 2026). A kit reaches its organiser in one of two ways, and either one
 * counts as SENT:
 *  - by hand: Lawal marks it sent on /admin/social (a social_piece_postings row, post_url 'sent');
 *  - by email: the message that carries it is drafted HELD with the kit's own tracked link (Message 7 today,
 *    src/lib/outreach/planner.ts), and Lawal sends it from his own mailbox; the Sent Items sync
 *    (src/lib/outreach/sent-sync.ts) then records that touch as 'sent', at the time he sent it. A draft never counts,
 *    and neither does a touch on any other link: only a touch in state 'sent' carrying this kit's own link.
 * It went at the earlier of the two. USED stays apart and is never read here: real taps on the kit's own link after it
 * went. Every reader of whether a kit went reads it through this module (scripts/guards/kit-sent-reads-the-touch.mjs),
 * so the founder dashboard, the social report and /admin/social can never disagree about it.
 */

export function kitWentAt(postedAt: string | null, touchSentAt: string | null): string | null {
  if (postedAt === null) return touchSentAt
  if (touchSentAt === null) return postedAt
  return Date.parse(touchSentAt) < Date.parse(postedAt) ? touchSentAt : postedAt
}

/** Each kit link's earliest touch Lawal sent, as an ISO time; a link with none is absent. A failed read throws, named. */
export async function readKitTouchesSent(db: SupabaseClient, links: readonly (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(links.filter((l): l is string => typeof l === 'string' && l.length > 0))]
  const rows = await readEveryRowIn<{ id: string; tracked_link: string; sent_at: string }>("the partner kits' sent messages", unique, (chunk, from, to) =>
    db
      .from('outreach_touches')
      .select('id, tracked_link, sent_at')
      .eq('state', 'sent')
      .not('sent_at', 'is', null)
      .in('tracked_link', chunk)
      .order('id', { ascending: true })
      .range(from, to),
  )
  const out = new Map<string, string>()
  for (const r of rows) {
    const at = new Date(r.sent_at).toISOString()
    const had = out.get(r.tracked_link)
    if (had === undefined || Date.parse(at) < Date.parse(had)) out.set(r.tracked_link, at)
  }
  return out
}

/**
 * The partner kits Lawal sent by email, by piece id: among the named pieces, or among every partner kit when none are
 * named. For the readers that judge whether ANY piece has gone (a withdrawn image's re-approval list, the withdrawal
 * message's wait): a kit sent by email has gone as surely as one marked sent, and is never asked for again.
 */
export async function readKitIdsSentByEmail(db: SupabaseClient, pieceIds?: readonly string[]): Promise<Set<string>> {
  const kits =
    pieceIds === undefined
      ? await readEveryRow<{ id: string; link: string | null }>('the partner kits', (from, to) =>
          db.from('social_pieces').select('id, link').eq('kind', 'partner_kit').order('id', { ascending: true }).range(from, to),
        )
      : await readEveryRowIn<{ id: string; link: string | null }>('the partner kits among the pieces', [...new Set(pieceIds)], (chunk, from, to) =>
          db.from('social_pieces').select('id, link').eq('kind', 'partner_kit').in('id', chunk).order('id', { ascending: true }).range(from, to),
        )
  const sent = await readKitTouchesSent(db, kits.map((k) => k.link))
  return new Set(kits.filter((k) => k.link !== null && sent.has(k.link)).map((k) => k.id))
}
