/** Message 8, the after your night report (planner.ts): due two days after the night, stale from seven. */
export const AFTER_YOUR_NIGHT_DUE_DAYS = 2
export const AFTER_YOUR_NIGHT_STALE_DAYS = 7

/** Why message 8 is not due for a night that ended at endedAt, or null when it is. Pure. */
export function afterYourNightRefusal(endedAt: Date, now: Date): string | null {
  const days = (now.getTime() - endedAt.getTime()) / 86_400_000
  if (days < AFTER_YOUR_NIGHT_DUE_DAYS) return 'the night ended under two days ago'
  if (days >= AFTER_YOUR_NIGHT_STALE_DAYS) return `the night ended ${Math.floor(days)} days ago, too late to report`
  return null
}
