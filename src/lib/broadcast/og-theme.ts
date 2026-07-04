/**
 * OG share-card theme tokens.
 *
 * THE TAB 4 SWAP POINT: the share-card visual template
 * (src/app/api/og/event/[slug]/route.tsx) reads every colour, size, and
 * font stack from this one object. When the design-system branch
 * (feat/ui-upgrade) lands its final tokens, updating these values restyles
 * every share card with no template change. Values below are the current
 * live brand tokens from globals.css and the root opengraph-image.
 */

export const OG_THEME = {
  /** ink-900 / brand navy, the card canvas. */
  navy: '#0A1628',
  /** Gold for the eyebrow and accents on the dark card. */
  gold: '#D4A017',
  /** gold-400, the brighter accent for the wordmark full stop and glow. */
  goldBright: '#E8B738',
  /** Primary text on the dark card. */
  text: '#FFFFFF',
  /** Secondary text on the dark card. */
  textMuted: 'rgba(255,255,255,0.85)',
  /** Tertiary text (the footer strip). */
  textFaint: 'rgba(255,255,255,0.6)',
  /** ImageResponse renders with system fonts; matches the root brand card. */
  fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
  /** Card geometry: the OG standard every platform crops least. */
  width: 1200,
  height: 630,
} as const
