/**
 * A POST'S STATE, BY ITS PROVIDER'S OWN ID (Lawal's specification of 20 November 2026, 09:01, item 2: "drafted,
 * authorised, scheduled, submitted, provider-confirmed published (with public URL), failed (with reason), requires
 * investigation. Status by stable provider id, never caption matching").
 *
 * A piece's drafted and authorised states are its own (the admin's piece state). Once it has a schedule row, that row
 * says the rest, read only from what the provider gave back: a row published with a public post address is published;
 * one holding only Blotato's submission reference is submitted, its address not yet read back (store.ts
 * readBackPendingPosts); a held row whose provider id was never kept, or a published row with no reference at all, is
 * for a person to look up on the provider by its id or its time, never matched by its words; any other held row failed,
 * with its reason. On 20 November the admin called AMCF's Instagram post 'published' while it held only
 * 'blotato:af0253d4', read back by nothing. Pure.
 */
export type PostState = 'scheduled' | 'submitted' | 'published' | 'failed' | 'requires investigation'

export interface ScheduleFacts {
  readonly state: string
  readonly publishedRef: string | null
  readonly heldReason: string | null
}

/** A public post's own address, as the database's published_ref check reads it (store.ts PUBLIC_POST_URL). */
const PUBLIC_POST = /^https:\/\/(www\.)?(instagram\.com|facebook\.com|fb\.com)\//
/** A held row whose provider accepted the post but whose id was never kept (store.ts, 18 November 2026). */
export const LOST_ID = /social_piece_schedules_published_ref_check|^Sent as blotato:/

export function postState(s: ScheduleFacts): { readonly state: PostState; readonly words: string } {
  const ref = (s.publishedRef ?? '').trim()
  if (s.state === 'scheduled') return { state: 'scheduled', words: 'scheduled' }
  if (s.state === 'published') {
    if (PUBLIC_POST.test(ref)) return { state: 'published', words: `published, ${ref}` }
    if (ref.startsWith('blotato:')) return { state: 'submitted', words: `submitted to Blotato (${ref}), its public address not yet confirmed` }
    return { state: 'requires investigation', words: 'marked published with no provider id: requires investigation' }
  }
  if (s.state === 'held') {
    if (LOST_ID.test(s.heldReason ?? '')) return { state: 'requires investigation', words: 'accepted by Blotato but its id was never kept: requires investigation by its time on Blotato' }
    return { state: 'failed', words: `failed: ${s.heldReason ?? 'no reason recorded'}` }
  }
  return { state: 'requires investigation', words: `in an unknown state '${s.state}': requires investigation` }
}
