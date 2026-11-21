/**
 * THE PRE FLIGHT'S WORDS (the PM's 16:30 of 21 November 2026, items 2 and 4; AV (c) and (g)): the one line the 08:00
 * report carries, and the reason a whole day has nothing that can post, said once in that report. The run itself is
 * ./preflight.ts. Pure, so the report reads it without the store.
 */
export const PREFLIGHT_ACTION = 'system.social.preflight'

/** 'today: N pieces ready, M redrawn, K nights with no permitted photo'. Pure. */
export function preflightLine(p: { readonly ready: number; readonly redrawn: number; readonly photoless: number }): string {
  return `today: ${p.ready} pieces ready, ${p.redrawn} redrawn, ${p.photoless} nights with no permitted photo`
}

/** Why a whole day has nothing that can post, or null when something can. Pure. */
export function nothingCanPostReason(p: {
  readonly ready: number
  readonly wouldDraw: number
  readonly due: number
  readonly photoless: readonly string[]
  readonly notes: readonly string[]
}): string | null {
  if (p.ready > 0 || p.wouldDraw > 0) return null
  if (p.due === 0) return 'no night has a moment due today'
  if (p.photoless.length >= p.due) return `no night with a moment due today has a permitted photograph (${p.photoless.slice(0, 3).join(', ')}${p.photoless.length > 3 ? ', and more' : ''})`
  return p.notes.slice(0, 2).join('; ') || 'every moment due today was passed over'
}
