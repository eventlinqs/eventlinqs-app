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

/**
 * A PIECE'S STATE IN PLAIN WORDS (the PM's 16:40 of 21 November 2026, AV (f): "states shown plainly: planned, ready,
 * scheduled, published (provider confirmed), blocked, failed, expired"). One mapping from the database's own fields, read
 * wherever the admin shows a piece:
 *   planned    drafted, not yet approved;
 *   ready      approved, waiting for its band;
 *   scheduled  given its moment, or submitted to the provider and its public address not yet confirmed;
 *   published  a post whose public address the provider confirmed (or a partner kit marked sent);
 *   blocked    held by one of our own rules, or rejected, with why;
 *   failed     an error from the provider, the database or the run, with why (an accepted post whose id was lost too);
 *   expired    its day passed before it could post (law 42), or its moment's day is gone while it waited.
 * Pure.
 */
export type PlainState = 'planned' | 'ready' | 'scheduled' | 'published' | 'blocked' | 'failed' | 'expired'

/** A held reason that is an error, not one of our rules refusing. */
const AN_ERROR = /could not|refused|HTTP \d|error|Blotato could not|no publisher is connected|database/i
/** Law 42's hold: a slot from an earlier day is never posted late. */
const DAY_PASSED = /passed before it could post|a missed day is never posted late/i

export function piecePlainState(p: {
  readonly state: 'drafted' | 'rejected' | 'approved' | 'gone'
  readonly postUrl: string | null
  readonly schedule: readonly (ScheduleFacts & { readonly goAt: string })[]
  readonly rejectedReason: string | null
  /** The day its moment names (social_pieces.moment_key), when it has one. */
  readonly momentDay: string | null
  /** Today on Melbourne's clock, YYYY-MM-DD. */
  readonly today: string
}): { readonly state: PlainState; readonly why: string } {
  const confirmed = p.schedule.find((s) => s.state === 'published' && PUBLIC_POST.test((s.publishedRef ?? '').trim()))
  if (confirmed) return { state: 'published', why: `published, confirmed by the provider: ${confirmed.publishedRef}` }
  if (p.postUrl && PUBLIC_POST.test(p.postUrl)) return { state: 'published', why: `published, confirmed by the provider: ${p.postUrl}` }
  if (p.state === 'gone') return { state: 'published', why: p.postUrl === 'sent' ? 'sent to the partner' : 'gone' }
  const submitted = p.schedule.find((s) => s.state === 'published')
  if (submitted) return { state: 'scheduled', why: postState(submitted).words }
  const lost = p.schedule.find((s) => s.state === 'held' && LOST_ID.test(s.heldReason ?? ''))
  if (lost) return { state: 'failed', why: postState(lost).words }
  const waiting = p.schedule.find((s) => s.state === 'scheduled')
  if (waiting) return { state: 'scheduled', why: `scheduled for ${waiting.goAt}` }
  const held = p.schedule.find((s) => s.state === 'held')
  if (held) {
    const why = held.heldReason ?? 'no reason recorded'
    if (DAY_PASSED.test(why)) return { state: 'expired', why }
    return { state: AN_ERROR.test(why) ? 'failed' : 'blocked', why }
  }
  if (p.state === 'rejected') return { state: 'blocked', why: `rejected: ${p.rejectedReason ?? 'no reason recorded'}` }
  if (p.momentDay !== null && p.momentDay < p.today) return { state: 'expired', why: `its day, ${p.momentDay}, passed before it could post` }
  if (p.state === 'approved') return { state: 'ready', why: 'approved, waiting for its band' }
  return { state: 'planned', why: 'drafted, waiting for its approval' }
}
