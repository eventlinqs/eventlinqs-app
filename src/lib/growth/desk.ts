import 'server-only'
import planJson from '../../../growth/plan.json'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'
import { planAgainstActual, todaysTasks, type GrowthPlan, type Scorecard, type Task } from './desk-math'

/**
 * THE GROWTH DESK'S ONE READ (Law 8, Lawal 1 November 2026 03:27; the CONTROLLER's 03:32 G2).
 *
 * /admin/growth and the founder's 11:40 email (WINDOW 2) both call this, so they cannot show different numbers. The
 * target is growth/plan.json (its dated versions held by scripts/guards/growth-plan-is-versioned.mjs); the actual is
 * growth_scorecard_read(), the one definition WINDOW 6's daily scorecard on production also reads; the trend is the
 * daily rows growth_scorecard_snapshot keeps. A failed read throws: an admin page that fails is honest, a desk that
 * shows zeros because a socket dropped is not.
 */
export interface TrendRow {
  day: string
  plan_version: number
  numbers: Scorecard
}

export interface GrowthDesk {
  plan: GrowthPlan
  card: Scorecard
  today: string
  progress: ReturnType<typeof planAgainstActual>
  tasks: Task[]
  trend: TrendRow[]
}

/** Melbourne's calendar day, YYYY-MM-DD. The platform zone is Sydney, which keeps Melbourne's clock all year, daylight
 *  saving included, so this is the same day growth_scorecard_snapshot keeps in SQL. */
export function melbourneDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: PLATFORM_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** How many days of daily rows the trend shows: eight weeks. */
export const TREND_DAYS = 56

export async function readGrowthDesk(now: Date = new Date()): Promise<GrowthDesk> {
  const plan = planJson as unknown as GrowthPlan
  const db = createAdminClient()
  const today = melbourneDay(now)
  const since = melbourneDay(new Date(now.getTime() - TREND_DAYS * 86_400_000))

  const card = (await readOrThrow('the growth scorecard', () => db.rpc('growth_scorecard_read'))) as unknown as Scorecard
  const rows = await readOrThrow('the growth scorecard trend', () =>
    db.from('growth_scorecard_daily').select('day, plan_version, numbers').gte('day', since).order('day', { ascending: true }).limit(TREND_DAYS + 1),
  )

  return {
    plan,
    card,
    today,
    progress: planAgainstActual(plan, card, today),
    tasks: todaysTasks(plan, card, today),
    trend: ((rows ?? []) as unknown as TrendRow[]),
  }
}
