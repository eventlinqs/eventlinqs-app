import type { SupabaseClient } from '@supabase/supabase-js'
import type { BlotatoPublishedSearch } from './blotato-publisher'

/**
 * THE READ ONLY BLOTATO RECONCILE (the PM's 09:55 of 22 November 2026, item 2; Lawal's hardening order, section 3:
 * "Reconcile uncertain submissions before retrying"). On 18 November five Instagram posts were accepted by Blotato and
 * then held, because the reference Blotato answered failed the column's check, so neither its address nor its submission
 * id was kept (5C's reconciliation of 22 November, part B). They stay held, never resent, until Blotato's own record says
 * what became of them. This reads every such held row, the caption its approval carried for that network, and Blotato's
 * published posts on that network, and answers each row's match: the post's address when one post carries that caption
 * within a day of the row's slot, else none, else more than one. It writes nothing.
 */

/** A held row whose reason says Blotato may have accepted it. */
export const MAY_HAVE_GONE = /published_ref_check|requires investigation|accepted by Blotato|Sent as /i

export type ReconcileAnswer = {
  readonly schedule: string
  readonly piece: string
  readonly platform: string
  readonly slot: string
  readonly found: 'one' | 'none' | 'more than one'
  readonly postUrls: readonly string[]
}

const DAY_MS = 86_400_000
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

/** One row's match among Blotato's posts: the same caption (its first 120 characters), within a day of the slot. Pure. */
export function matchHeld(row: { readonly caption: string; readonly slot: string }, posts: readonly { readonly content: string; readonly postUrl: string | null; readonly createdAt: string }[]): { found: ReconcileAnswer['found']; postUrls: string[] } {
  const want = norm(row.caption).slice(0, 120)
  const slot = Date.parse(row.slot)
  const hits = posts.filter((p) => want.length > 0 && norm(p.content).startsWith(want) && Math.abs(Date.parse(p.createdAt) - slot) <= DAY_MS)
  const urls = hits.map((h) => h.postUrl ?? '(no address yet)')
  return { found: hits.length === 0 ? 'none' : hits.length === 1 ? 'one' : 'more than one', postUrls: urls }
}

export async function reconcileHeld(db: SupabaseClient, search: BlotatoPublishedSearch): Promise<ReconcileAnswer[]> {
  const { data: rows, error } = await db.from('social_piece_schedules').select('id, piece_id, approval_id, platform, go_at, held_reason').eq('state', 'held').is('published_ref', null)
  if (error) throw new Error(`the held schedules could not be read: ${error.message}`)
  const held = ((rows ?? []) as Record<string, unknown>[]).filter((r) => MAY_HAVE_GONE.test(String(r.held_reason ?? '')))
  const postsOf = new Map<string, Awaited<ReturnType<BlotatoPublishedSearch>>>()
  const out: ReconcileAnswer[] = []
  for (const r of held) {
    const platform = String(r.platform)
    if (!postsOf.has(platform)) postsOf.set(platform, await search(platform))
    const { data: appr } = await db.from('social_piece_approvals').select('revision').eq('id', String(r.approval_id)).maybeSingle()
    const revision = (appr as { revision?: number } | null)?.revision ?? null
    const { data: rev } = revision === null ? { data: null } : await db.from('social_piece_revisions').select('versions, caption').eq('piece_id', String(r.piece_id)).eq('version', revision).maybeSingle()
    const versions = ((rev as { versions?: Record<string, { caption?: string }> } | null)?.versions ?? {}) as Record<string, { caption?: string }>
    const caption = versions[platform]?.caption ?? (rev as { caption?: string } | null)?.caption ?? ''
    const m = matchHeld({ caption, slot: String(r.go_at) }, postsOf.get(platform) ?? [])
    out.push({ schedule: String(r.id), piece: String(r.piece_id), platform, slot: String(r.go_at), ...m })
  }
  return out
}
