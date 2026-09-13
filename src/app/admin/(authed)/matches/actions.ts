'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { produceMatchRun } from '@/lib/matching/run'

export type ProduceMatchResult = { ok: boolean; message: string; runId?: string }

/**
 * Produce one matcher run for one published event.
 *
 * Admin only, and the refusals are returned as sentences rather than thrown, so
 * the screen can say WHY nothing happened: the switch is off, the event is not
 * published, or the weights do not sum to one and the method refuses to score
 * with a broken set. A button that fails silently is the defect the no-silent
 * -submit guard exists for.
 *
 * It sends nothing. The run is a ranked list and a funnel, and no transport is
 * reachable from here.
 */
export async function produceMatchRunAction(
  _previous: ProduceMatchResult | null,
  formData: FormData,
): Promise<ProduceMatchResult> {
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) {
    return { ok: false, message: 'Your role cannot produce a match run.' }
  }

  const eventId = String(formData.get('event_id') ?? '').trim()
  if (!eventId) return { ok: false, message: 'Pick an event first.' }

  const capRaw = String(formData.get('cap') ?? '').trim()
  const cap = capRaw ? Number(capRaw) : undefined
  if (cap !== undefined && (!Number.isFinite(cap) || cap < 1)) {
    return { ok: false, message: 'The cap must be a whole number of people, one or more.' }
  }

  const admin = createAdminClient()
  const result = await produceMatchRun(admin, {
    eventId,
    cap,
    actorUserId: session.userId,
  })

  await recordAuditEvent({
    action: 'admin.matches.run',
    session,
    targetType: 'event',
    targetId: eventId,
    metadata: { ok: result.ok, refusal: result.refusal ?? null, returned: result.returned ?? 0 },
  })

  revalidatePath('/admin/matches')

  if (!result.ok) {
    return { ok: false, message: `No run was produced: ${result.detail ?? result.refusal}.` }
  }
  return {
    ok: true,
    runId: result.runId,
    message: `Matched ${result.returned} of ${result.audienceConsidered} in the audience${result.truncated ? ', truncated at the cap' : ''}.`,
  }
}
