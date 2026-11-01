import 'server-only'
import planJson from '../../../growth/plan.json'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import type { GrowthPlan } from './desk-math'
import { acquisitionDesk, type AcquisitionDesk, type AcquisitionFactsRow } from './acquisition-desk-math'

/**
 * THE GROWTH DESK'S ACQUISITION READ, V3 ITEM 10: growth_acquisition_facts() (20261101140001, service role only), one
 * row per organiser, each fact from its proving row, then ./acquisition-desk-math.ts for the numbers. A failed read
 * throws: an admin page that fails is honest, a desk that shows zeros because a socket dropped is not.
 */
export async function readAcquisitionDesk(now: Date = new Date()): Promise<AcquisitionDesk> {
  const plan = planJson as unknown as GrowthPlan
  const rows = (await readOrThrow('the acquisition facts', () => createAdminClient().rpc('growth_acquisition_facts'))) as unknown as AcquisitionFactsRow[]
  return acquisitionDesk(rows ?? [], now, plan.cities.open, plan.focus_market?.name)
}
