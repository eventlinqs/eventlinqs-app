/**
 * Centralised quality tiers for next/image.
 *
 * Matches the legal `qualities` array in next.config.ts. Components must
 * reference these constants instead of hardcoding numbers - that way a
 * platform-wide quality retune touches one file.
 *
 * See docs/MEDIA-ARCHITECTURE.md §4.2 for policy.
 */
export const MEDIA_QUALITY = {
  /** Full-viewport hero - best perceived quality */
  hero: 80,
  /** Standard card / bento tile / category tile */
  card: 75,
  /** Small rail / marquee tile */
  rail: 70,
  /** Avatars - sharpness matters at small sizes */
  avatar: 75,
} as const

export type MediaQualityTier = keyof typeof MEDIA_QUALITY
