import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { captureException } from '@/lib/observability/sentry'
import { heardFromLabel, HEARD_FROM_UNANSWERED_LABEL } from './heard-from'

/**
 * ORGANISER SIGNUPS THIS WEEK, BY SOURCE. One query, one line.
 *
 * Close-out AN1 step 3. The owner digest gains one weekly line saying where
 * this week's organisers came from. The DIGEST itself is lane C's territory, so
 * this lane writes the query and the sentence it returns and stops there; the
 * BORDER line naming the digest file is in C:\\dev\\REVIEW-QUEUE-B.md.
 *
 * WHY TWO ANSWERS AND NOT ONE. A link parameter and a person's own answer are
 * different facts and a single "source" column would have to pick one and lose
 * the other. `src` says which SURFACE was clicked, which is the only thing a
 * machine can know. `signup_heard_from` says who TOLD them, which is the only
 * thing a machine cannot know and is the number the growth plan's first lever
 * is spent on. A word of mouth arrives with no parameters at all, a week after
 * a DJ mentioned it, so counting only the clicks would report that the lever
 * that is working is doing nothing.
 *
 * UNANSWERED IS COUNTED, NEVER HIDDEN. A question that most people skip
 * produces a number that looks authoritative and is a minority report, so the
 * line says how many did not answer. A denominator is what makes the rest of it
 * readable.
 *
 * READS WITH THE SERVICE ROLE, because `profiles` is own-row under RLS and this
 * is an aggregate across every organiser. It returns nothing identifying: five
 * labels and their counts.
 */
export interface SignupSourceCounts {
  /** Organiser accounts created inside the window. */
  total: number
  /** Who told them, from the one question. Ordered by count, then by label. */
  heardFrom: Array<{ label: string; count: number }>
  /** Which surface was clicked, from the src on the link. Same ordering. */
  surfaces: Array<{ label: string; count: number }>
  /** True when the read failed, so the caller can say so rather than say zero. */
  unavailable: boolean
}

export const SIGNUP_SOURCE_DIRECT_LABEL = 'Arrived directly'

function tally(values: Array<string | null>, unknownLabel: string): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>()
  for (const value of values) {
    const label = value ?? unknownLabel
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

export async function getOrganiserSignupSources(opts?: {
  since?: Date
  now?: Date
}): Promise<SignupSourceCounts> {
  const now = opts?.now ?? new Date()
  const since = opts?.since ?? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('profiles')
      .select('signup_heard_from, signup_src')
      .eq('role', 'organiser')
      .gte('created_at', since.toISOString())
      .lt('created_at', now.toISOString())
    if (error) {
      console.error('[signup-sources] could not read the weekly organiser signups:', error)
      return { total: 0, heardFrom: [], surfaces: [], unavailable: true }
    }
    const rows = data ?? []
    return {
      total: rows.length,
      heardFrom: tally(
        rows.map(r => (r.signup_heard_from ? heardFromLabel(r.signup_heard_from) : null)),
        HEARD_FROM_UNANSWERED_LABEL,
      ),
      surfaces: tally(
        rows.map(r => r.signup_src ?? null),
        SIGNUP_SOURCE_DIRECT_LABEL,
      ),
      unavailable: false,
    }
  } catch (error) {
    captureException(error, { where: 'lib/growth/signup-sources' })
    return { total: 0, heardFrom: [], surfaces: [], unavailable: true }
  }
}

/**
 * THE ONE LINE the digest prints. Pure, so the sentence can be tested without a
 * database and so the digest is handed a string rather than a shape it has to
 * decide how to render.
 *
 * It says nothing rather than saying zero when the read failed, because "no
 * organisers signed up this week" and "we could not find out" are different
 * pieces of news and only one of them is about the platform.
 */
export function organiserSignupSourceLine(counts: SignupSourceCounts): string | null {
  if (counts.unavailable) return null
  if (counts.total === 0) return 'Organiser signups this week: none.'
  const top = counts.heardFrom
    .slice(0, 3)
    .map(entry => `${entry.label} ${entry.count}`)
    .join(', ')
  return `Organiser signups this week: ${counts.total}. Heard about us through: ${top}.`
}
