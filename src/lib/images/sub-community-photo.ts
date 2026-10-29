/**
 * The photograph for a sub-community tile on a community page (Afrobeats, Soca, Fiesta and so on).
 *
 * STORED PHOTOGRAPHS ONLY, NEVER A REQUEST-TIME CALL (Lawal, 22:17 and 22:23 on 29 October 2026, through the project
 * manager's 22:20 and 22:24). This used to ask Pexels on every render and cache the answer for a week through
 * unstable_cache, a refusal included, so one refused lookup blanked a tile for a week. Of the 105 sub-community tiles
 * the community pages draw, 15 had a Pexels query; each of those photographs is now kept once in
 * public/images/library (the one the tile showed before, except reggae, whose old pick was a protest mask and was
 * replaced by a fitting one), with its photographer, page and licence in public/images/library/attribution.json,
 * fetched by scripts/ops/download-library-photos.mjs. Every other tile answers null as before, and
 * SubCommunityTileImage draws its designed navy tile.
 */

/** `${communitySlug}:${subCommunitySlug}` for each kept photograph. */
const KEPT = new Set([
  'african:afrobeats',
  'african:amapiano',
  'african:owambe',
  'african:west-african',
  'african:east-african',
  'caribbean:soca',
  'caribbean:dancehall',
  'caribbean:reggae',
  'caribbean:trinidadian',
  'caribbean:jamaican',
  'caribbean:afro-caribbean',
  'filipino:opm',
  'filipino:fiesta',
  'filipino:sinulog',
  'filipino:modern-filipino',
])

const keyOf = (communitySlug: string, subCommunitySlug: string) => `${communitySlug.toLowerCase()}:${subCommunitySlug.toLowerCase()}`

export async function getSubCommunityPhoto(communitySlug: string, subCommunitySlug: string): Promise<string | null> {
  const key = keyOf(communitySlug, subCommunitySlug)
  if (!KEPT.has(key)) return null
  return `/images/library/sub-${key.replace(':', '-')}.jpg`
}

export function isKnownSubCommunityKey(communitySlug: string, subCommunitySlug: string): boolean {
  return KEPT.has(keyOf(communitySlug, subCommunitySlug))
}
