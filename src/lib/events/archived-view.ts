import 'server-only'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOrThrow, type Read } from '@/lib/supabase/read-or-throw'
import { ARCHIVED_STATUS } from '@/lib/event-lifecycle'
import { SIGNED_IN_MARKER_COOKIE } from '@/lib/auth/signed-in-marker'

/**
 * AN ARCHIVED EVENT'S PAGE, FOR THE PEOPLE WHO HOLD A TICKET TO IT.
 *
 * docs/EVENT-LIFECYCLE.md, close-out C13.5 and C13.6: an archived event's URL
 * answers 404 to everyone EXCEPT a viewer who holds a ticket for it, because
 * archiving is a discovery change and never a ticket change. The public read
 * of the page runs as anon and row-level security keeps archived rows out of
 * it, which is exactly right for strangers. This module is the second look,
 * taken only when the public read found nothing.
 *
 * WHO COUNTS AS A HOLDER. The signed-in user with an order for the event
 * (orders.user_id), or with a ticket whose holder email is theirs (a guest
 * purchase later signed in with the same address). Both are read with the
 * service role after the session has identified the viewer.
 *
 * TWO CALLERS, ONE DECISION. src/app/events/[slug]/layout.tsx is the route's
 * existence guard: it renders outside the page's loading boundary so that its
 * notFound() is a real 404 rather than a streamed 200, and it therefore has to
 * make this decision FIRST (the first drive found the page's own holder branch
 * never ran, because the layout had already answered 404). The page then reads
 * the row through the same function. A decision made in two places would be
 * two decisions.
 */

/** The archived event at this slug, when the signed-in viewer holds a ticket to it; else null. */
async function archivedEventForViewer(slug: string): Promise<{ id: string } | null> {
  /*
   * EVERY READ ON THIS PATH THROWS WHEN IT FAILS. A null here is the layout's
   * 404 and the holder's refusal, so "could not ask" must never be folded into
   * it (src/lib/supabase/read-or-throw.ts, the fourth occurrence).
   */
  const admin = createAdminClient()
  const archived = await readOrThrow('archived-view lookup', () =>
    admin.from('events').select('id').eq('slug', slug).eq('status', ARCHIVED_STATUS).maybeSingle(),
  )
  if (!archived) return null

  /*
   * ONLY A REQUEST THE EDGE WILL NOT CACHE MAY SEE THE HOLDER'S PAGE. The
   * public CDN rule for /events/:slug applies to requests WITHOUT the signed-in
   * marker cookie (next.config.ts). A holder's request without it would be
   * served the page AND cached for every stranger for 300s, so it is refused
   * here, gets the anonymous 404, and the session middleware sets the marker
   * on that very response; the next request carries it and sees the page.
   * See src/lib/auth/signed-in-marker.ts.
   */
  const jar = await cookies()
  if (!jar.has(SIGNED_IN_MARKER_COOKIE)) return null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const holder = await viewerHoldsTicket(admin, archived.id, { userId: user.id, email: user.email ?? null })
  return holder ? { id: archived.id } : null
}

/** For the route's existence guard: may this viewer reach the archived event at this slug? */
export async function viewerMayReachArchivedEvent(slug: string): Promise<boolean> {
  return (await archivedEventForViewer(slug)) !== null
}

/**
 * The archived row itself, with the page's own column list, when the viewer
 * qualifies, so the page renders the same composition it would for a live
 * event, with the archived banner and no sale.
 */
export async function fetchArchivedEventForHolder<T>(slug: string, select: string): Promise<T | null> {
  const archived = await archivedEventForViewer(slug)
  if (!archived) return null
  const admin = createAdminClient()
  return readOrThrow(
    'archived-view row',
    () => admin.from('events').select(select).eq('id', archived.id).single() as unknown as Read<T>,
  )
}

/** Does this signed-in viewer hold a ticket to this event? Pure of session concerns. */
export async function viewerHoldsTicket(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
  viewer: { userId: string; email: string | null },
): Promise<boolean> {
  // A count that could not be taken is not a count of zero: a failed read here
  // would tell a real ticket holder they hold nothing, so it throws instead.
  const orders = await readOrThrow('archived-view holder orders', async () => {
    const { count, error } = await admin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('user_id', viewer.userId)
    return { data: count, error }
  })
  if ((orders ?? 0) > 0) return true
  if (!viewer.email) return false
  const tickets = await readOrThrow('archived-view holder tickets', async () => {
    const { count, error } = await admin
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .ilike('holder_email', viewer.email as string)
    return { data: count, error }
  })
  return (tickets ?? 0) > 0
}
