/**
 * Centralised `sizes` hints for next/image.
 *
 * `sizes` tells the browser which srcset candidate to download at which
 * viewport. Wrong hints = the image optimizer ships a 1920px asset for a
 * 300px tile (or vice versa). Components must reference these constants so
 * the same layout role gets the same hint everywhere on the platform.
 *
 * See docs/MEDIA-ARCHITECTURE.md §4.3 for policy.
 */
export const MEDIA_SIZES = {
  /** Above-fold full-bleed hero (HeroMedia default) */
  fullBleed: '(max-width: 768px) 100vw, 1920px',
  /** Bento grid hero tile */
  bentoHero: '(max-width: 1024px) 100vw, 720px',
  /** Bento grid supporting tile */
  bentoSupporting: '(max-width: 1024px) 50vw, 360px',
  /** Standard event card in a 1/2/3 column grid */
  card: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',
  /** Horizontal rail tile (this-week, by-city desktop, etc.) */
  rail: '(min-width: 1024px) 280px, 220px',
  /** Live-vibe horizontal marquee */
  marquee: '280px',
  /** Category landing tile */
  category: '(max-width: 768px) 50vw, 320px',
  /** Avatar — topbar (32px on every breakpoint) */
  avatarTopbar: '32px',
  /** Avatar — small (32px) */
  avatarSm: '32px',
  /** Avatar — medium (48px) */
  avatarMd: '48px',
  /** Avatar — large (96px) */
  avatarLg: '96px',
} as const

export type MediaSizeKey = keyof typeof MEDIA_SIZES
