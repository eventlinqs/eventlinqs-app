/**
 * THE DEADLINE-AWARE STAGES (D2 of Lawal's final directive; the blueprint's section 4, 30 October 2026). Every night has
 * a closing date, so its stage comes from the days left alone: a night found three days out starts at the final week and
 * skips what came before. The blueprint: 'These windows are an initial operating design, not proven universal booking
 * patterns.' Pure.
 */

export type CampaignStage = 'launch' | 'consideration' | 'final_week' | 'last_mile' | 'reporting'

const DAY_MS = 86_400_000

function localDay(at: Date, zone: string): number {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
  return Date.parse(`${d}T00:00:00Z`)
}

/** Whole calendar days from `now` to the night's start, in the night's own zone; negative once its day has passed. */
export function daysToStart(night: { readonly startDate: string; readonly timezone: string | null }, now: Date): number {
  const zone = night.timezone?.trim() || 'Australia/Melbourne'
  return Math.round((localDay(new Date(night.startDate), zone) - localDay(now, zone)) / DAY_MS)
}

/** T-30 to 21 launch, T-20 to 8 consideration, T-7 to 2 final week, T-1 to 0 last mile, T+1 to 7 reporting, else none. */
export function campaignStageOf(night: { readonly startDate: string; readonly timezone: string | null }, now: Date): CampaignStage | null {
  const days = daysToStart(night, now)
  if (days > 30 || days < -7) return null
  if (days >= 21) return 'launch'
  if (days >= 8) return 'consideration'
  if (days >= 2) return 'final_week'
  if (days >= 0) return 'last_mile'
  return 'reporting'
}
