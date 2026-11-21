import { midnightIn } from '@/lib/dates/zone-midnight'

/**
 * THE PLAN FOR TOMORROW, DRAWN TODAY (the PM's 17:42 of 21 November 2026: Sunday's AMCF post "drawn, looked at, passed
 * by the policy dry run and SCHEDULED today"). The planner draws a day's moments as of a moment on that day; asked for
 * tomorrow, it plans as of tomorrow's 05:00 on Melbourne's clock, the hour before the day's own pre-flight and 06:40 run,
 * so the pieces it draws are tomorrow's own (their moment keys name tomorrow) and can be looked at and dry run tonight.
 * Only today or tomorrow: never a later day, never a past one. Pure.
 */
export const PLAN_ZONE = 'Australia/Melbourne'

export function planAsOf(request: { readonly for: string | null }, now: Date): Date {
  if (request.for !== 'tomorrow') return now
  const todayMidnight = midnightIn(now, PLAN_ZONE)
  // Tomorrow's midnight on Melbourne's clock, true across a daylight saving change: midnight of the instant 36 hours on.
  const tomorrowMidnight = midnightIn(new Date(todayMidnight.getTime() + 36 * 3_600_000), PLAN_ZONE)
  // Five hours on from midnight is 05:00 on most days; on a daylight saving day it reads 04:00 or 06:00, so move it by
  // what Melbourne's clock shows.
  const guess = new Date(tomorrowMidnight.getTime() + 5 * 3_600_000)
  const shown = Number(new Intl.DateTimeFormat('en-AU', { timeZone: PLAN_ZONE, hour: '2-digit', hourCycle: 'h23' }).format(guess))
  return new Date(guess.getTime() + (5 - shown) * 3_600_000)
}
