import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOrThrow, type Read } from '@/lib/supabase/read-or-throw'
import { PUBLIC_AFTER_THE_FACT_STATUSES } from '@/lib/event-lifecycle'

/**
 * AN EVENT THAT HAS BEEN PAUSED, POSTPONED, CANCELLED OR HAS HAPPENED, ON ITS
 * OWN PUBLIC PAGE, WHERE `docs/EVENT-LIFECYCLE.md` SAYS IT BELONGS.
 *
 * The full account of what was broken and why this is a code path rather than a
 * wider row-level security policy is in `src/lib/event-lifecycle.ts` beside
 * `PUBLIC_AFTER_THE_FACT_STATUSES`. The short version: the RLS policies admit
 * `status = 'published'` alone, so those four states answered a real 404 to
 * everyone, and the page's banner code for them had never once run.
 *
 * ============================================================================
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ============================================================================
 *
 * It is not a general back door around row-level security and it must never
 * become one. Four constraints, each of which is asserted by
 * `tests/unit/events/after-the-fact-view.test.ts` against this file's source,
 * because a comment is not a constraint:
 *
 *   1. STATUS is exactly the four in `PUBLIC_AFTER_THE_FACT_STATUSES`. Not
 *      `draft`, not `scheduled`, and NOT `archived`: an archived event's page
 *      is per viewer and belongs to `src/lib/events/archived-view.ts`, which
 *      asks who is reading and whether they hold a ticket.
 *   2. VISIBILITY is `public` or `unlisted`. A `private` event is invitation
 *      only in every state it can reach, and cancelling one does not publish it.
 *   3. It reads `events` and nothing else. The holder path needs `orders` and
 *      `tickets` to answer "is this you"; this path has no such question,
 *      because the answer is the same for everybody.
 *   4. The answer is IDENTICAL FOR EVERY VIEWER, so the response stays
 *      cacheable at the edge and none of the `el-signed-in` marker machinery
 *      that the archived path needs applies here.
 *
 * ============================================================================
 * WHY THE SERVICE ROLE, SAID PLAINLY
 * ============================================================================
 *
 * The page's own read runs as `anon` and is correct for the published case. The
 * rows this module returns are ones the constitution's own lifecycle document
 * says are public; RLS simply has not been told. Rather than change a policy a
 * hundred unaudited queries depend on, the narrow read is taken with the
 * service role and constrained here, in one file, with the two predicates above
 * written into the query itself.
 */

/** `private` never reaches a public page, whatever its status. */
const PUBLIC_VISIBILITIES = ['public', 'unlisted'] as const

/**
 * Does a page exist at this slug for one of the four after-the-fact states?
 *
 * Used by the route's existence guard, which answers BEFORE the page renders
 * and therefore has to make the same decision the page will. The archived path
 * records why that split exists: the first drive of it found the page's own
 * branch never ran because the layout had already answered 404.
 */
export async function afterTheFactEventExists(slug: string): Promise<boolean> {
  const admin = createAdminClient()
  // A read that could not be taken is not an absent event. readOrThrow retries a
  // transient fault and throws a real one, so a blink answers "ask again"
  // instead of "no such event" (src/lib/supabase/read-or-throw.ts).
  const row = await readOrThrow('after-the-fact lookup', () =>
    admin
      .from('events')
      .select('id')
      .eq('slug', slug)
      .in('status', [...PUBLIC_AFTER_THE_FACT_STATUSES])
      .in('visibility', [...PUBLIC_VISIBILITIES])
      .maybeSingle(),
  )
  return row !== null
}

/**
 * The row itself, with the page's own column list, so the page renders the same
 * composition it renders for a live event and its banner code finally runs.
 */
export async function fetchAfterTheFactEvent<T>(slug: string, select: string): Promise<T | null> {
  const admin = createAdminClient()
  return readOrThrow(
    'after-the-fact row',
    () =>
      admin
        .from('events')
        .select(select)
        .eq('slug', slug)
        .in('status', [...PUBLIC_AFTER_THE_FACT_STATUSES])
        .in('visibility', [...PUBLIC_VISIBILITIES])
        .maybeSingle() as unknown as Read<T>,
  )
}
