import { rgb } from 'pdf-lib'

/**
 * POSTER PALETTES: a small set of NAMED schemes, and never a colour picker.
 *
 * ---------------------------------------------------------------------------
 * WHY NAMED AND NOT A PICKER. This is the one control on the tweak layer with
 * live evidence against the obvious implementation.
 *
 * Humanitix ships a free primary-colour field with a hex input. Their own help
 * page, `help.humanitix.com/en/articles/8951375-how-to-style-your-event-page`,
 * fetched 9 August 2026, carries this:
 *
 *   "Can I remove the colour gradient from my event page background? The colour
 *    gradient is added to your background when you select a custom primary
 *    colour. This currently cannot be removed independently."
 *
 * and the documented way back to the default is to type a hex code from memory:
 *
 *   "you can add our default colour HEX code: #FFB18F into the primary colour
 *    field"
 *
 * An unconstrained picker produced an artefact users want removed and a support
 * answer that says "type this hex". That is the "nothing may produce something
 * worse than the default" test failing in production at a direct competitor.
 * So: named schemes, every one of them designed, none of them a field.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE ARE ONLY THREE, which is a smaller list than it first looks like it
 * should be, and the reason is a law rather than a shortage of ideas.
 *
 * The design system is navy and gold and forbids new colours. A palette control
 * therefore cannot offer hues; what it can genuinely offer is FIELD, which is
 * the single biggest visual decision on a poster and the one a promoter
 * actually has an opinion about. Two dark schemes and one light one is the
 * honest extent of it, and each is built from tokens that already exist.
 *
 * The light scheme is not decoration: a poster printed on a mostly-white field
 * costs a fraction of a full-bleed dark one at a copy shop, which is exactly
 * where these go.
 *
 * ---------------------------------------------------------------------------
 * THE CONTRAST RULE IS ENFORCED HERE, NOT LEFT TO THE CALLER.
 *
 * globals.css: gold-400 fails 4.5:1 on white, so gold-800 (#6F5409) is the tier
 * for gold on a light surface, and --brand-accent (gold-400) is for dark
 * surfaces only. A scheme that let gold-400 land as text on the paper field
 * would be a person producing something worse than the default, which is the
 * thing this layer exists to prevent. Each scheme therefore carries its OWN
 * correct accent, and there is no way to select a field without also selecting
 * the accent that is legible on it.
 */

/** ink-900 #0A1628 */
const NAVY = rgb(0.039, 0.086, 0.157)
/** A deeper navy, already in the renderer. */
const NAVY_DEEP = rgb(0.02, 0.051, 0.094)
/** gold-400 #E8B738. Dark surfaces only. */
const GOLD_400 = rgb(0.909, 0.718, 0.22)
/** gold-800 #6F5409. The tier for gold as text on a light surface. */
const GOLD_800 = rgb(0.435, 0.329, 0.035)
/** #D4A017, the deeper gold the platform footer dot has always used. */
const GOLD_DEEP = rgb(0.831, 0.627, 0.09)
/** canvas #FAFAF7 */
const CANVAS = rgb(0.98, 0.98, 0.969)
const WHITE = rgb(1, 1, 1)
const WHITE_MUTED = rgb(0.85, 0.87, 0.9)
const WHITE_FAINT = rgb(0.62, 0.66, 0.72)
/** ink-900 as text on the paper field. */
const INK_TEXT = NAVY
const INK_MUTED = rgb(0.32, 0.36, 0.42)
const INK_FAINT = rgb(0.48, 0.52, 0.58)

export type PosterPalette = {
  /** The page field for the COVER composition. */
  field: ReturnType<typeof rgb>
  /**
   * The page field for the TYPOGRAPHIC composition, which has always run a
   * deeper navy than the cover one. Kept as its own slot rather than collapsed
   * into `field`, because collapsing them would silently restyle the no-artwork
   * poster the moment this module was wired in.
   */
  fieldDeep: ReturnType<typeof rgb>
  /** Accent: rules, the date line, the ticket bar fill. Legible on the field. */
  accent: ReturnType<typeof rgb>
  /** The deeper accent, used for the platform footer dot. */
  accentDeep: ReturnType<typeof rgb>
  /** Text drawn ON the accent (the ticket bar). */
  onAccent: ReturnType<typeof rgb>
  /** Primary text. */
  text: ReturnType<typeof rgb>
  /** Secondary text (locality, organiser name). */
  textMuted: ReturnType<typeof rgb>
  /** The platform footer line. */
  textFaint: ReturnType<typeof rgb>
  /** Whether the field is light. The QR needs a white tile only on a dark one. */
  isLight: boolean
}

export const POSTER_PALETTES = {
  /**
   * The default and the one every existing poster already uses. Listed first
   * because a person who opens the control and closes it again must land back
   * exactly where they started.
   */
  navy: {
    field: NAVY,
    fieldDeep: NAVY_DEEP,
    accent: GOLD_400,
    accentDeep: GOLD_DEEP,
    onAccent: NAVY,
    text: WHITE,
    textMuted: WHITE_MUTED,
    textFaint: WHITE_FAINT,
    isLight: false,
  },
  /** The same composition on a deeper field. Reads heavier, prints darker. */
  midnight: {
    field: NAVY_DEEP,
    fieldDeep: NAVY_DEEP,
    accent: GOLD_400,
    accentDeep: GOLD_DEEP,
    onAccent: NAVY_DEEP,
    text: WHITE,
    textMuted: WHITE_MUTED,
    textFaint: WHITE_FAINT,
    isLight: false,
  },
  /**
   * Light field. Cheap to print and legible in a bright window. The accent is
   * gold-800, NOT gold-400, because gold-400 fails 4.5:1 on white, and the
   * footer dot takes gold-800 too rather than gold-500, which fails at 2.27:1
   * on canvas by globals.css's own measurement.
   */
  paper: {
    field: CANVAS,
    fieldDeep: CANVAS,
    accent: GOLD_800,
    accentDeep: GOLD_800,
    onAccent: WHITE,
    text: INK_TEXT,
    textMuted: INK_MUTED,
    textFaint: INK_FAINT,
    isLight: true,
  },
} satisfies Record<string, PosterPalette>

export type PosterPaletteName = keyof typeof POSTER_PALETTES

export const POSTER_PALETTE_NAMES = Object.keys(POSTER_PALETTES) as PosterPaletteName[]

/** The default, named once so no caller has to remember which it is. */
export const DEFAULT_POSTER_PALETTE: PosterPaletteName = 'navy'

/**
 * Resolve a palette name to its scheme.
 *
 * An unknown or absent name resolves to the DEFAULT rather than throwing,
 * because this value arrives from a stored draft that may predate the control
 * or may have been edited by hand. A poster that renders in the default scheme
 * is a correct poster; a poster that fails to render is not.
 */
export function resolvePosterPalette(name?: string | null): PosterPalette {
  if (name && Object.prototype.hasOwnProperty.call(POSTER_PALETTES, name)) {
    return POSTER_PALETTES[name as PosterPaletteName]
  }
  return POSTER_PALETTES[DEFAULT_POSTER_PALETTE]
}

/** Human labels for the control. No hex is ever shown to a person. */
export const POSTER_PALETTE_LABELS: Record<PosterPaletteName, string> = {
  navy: 'Navy',
  midnight: 'Midnight',
  paper: 'Paper',
}
