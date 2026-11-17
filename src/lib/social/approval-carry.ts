import { createHash } from 'node:crypto'
import type { Slide } from './campaign'

/**
 * LAWAL'S YES CARRIES OVER A ROUTINE CORRECTION, AND ONLY THAT (the PM's 07:05 of 18 November 2026, item 3, under Lawal's
 * operational directive of 18 November 2026, 00:12: routine corrections are made automatically and never put to him).
 *
 * The code binds an approval to its exact revision: scheduling skips an approval that is not of the newest revision
 * (store.ts), and the database refuses to publish one (social_piece_approvals_are_due). So a piece redrawn after his yes
 * ONLY for a routine correction (wording, a stale drawing, a label) keeps his yes on its new revision, recorded with the
 * old and new version hashes; a redraw that changes the night or the photograph needs a new yes.
 *
 * What this rule reads, and why only that: kind, city, partner and poster day are the same by how a redraw is matched
 * (olderLookRedraws); the slot is the schedule, which the carry keeps; the destination is the piece's own link, which a
 * redraw never changes. So the nights and the photographs are what a redraw can change that a yes was given for.
 *
 * Pure.
 */
type Drawn = { readonly eventIds: readonly string[]; readonly slides: readonly Slide[] }

const photosOf = (slides: readonly Slide[]): (string | null)[] =>
  slides.map((s) => ('photo' in s ? ((s as { photo?: string | null }).photo ?? null) : null))

/** Null where the yes carries over; otherwise why it does not, said plainly. */
export function carriesApproval(old: Drawn, fresh: Drawn): string | null {
  const nights = (ids: readonly string[]) => [...new Set(ids)].sort().join(',')
  if (nights(old.eventIds) !== nights(fresh.eventIds)) return 'the redraw changes the night, so it needs a new yes'
  if (JSON.stringify(photosOf(old.slides)) !== JSON.stringify(photosOf(fresh.slides))) return 'the redraw changes a photograph, so it needs a new yes'
  return null
}

/** A revision's hash: exactly what posts, its slides, its caption and both platform versions. */
export function revisionHash(r: { readonly slides: readonly Slide[]; readonly caption: string | null; readonly versions: unknown }): string {
  return createHash('sha256').update(JSON.stringify({ slides: r.slides, caption: r.caption ?? null, versions: r.versions ?? null })).digest('hex')
}
