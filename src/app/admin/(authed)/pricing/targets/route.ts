import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatEventDate } from '@/lib/dates/event-time'
import { ilikeAnyOf } from '@/lib/supabase/or-filter'

export const dynamic = 'force-dynamic'

/**
 * Typeahead search for the pricing-override pickers. Returns organisations or
 * events matching a name query so the founder picks a target instead of pasting
 * a UUID. Admin-gated (auth route handlers are NOT covered by the layout, so we
 * gate here): a valid admin session with admin.pricing.manage, else 401/403.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  if (!can(session, 'admin.pricing.manage')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const kind = url.searchParams.get('kind')
  const q = (url.searchParams.get('q') ?? '').trim()
  if (kind !== 'organisation' && kind !== 'event') {
    return NextResponse.json({ error: 'bad kind' }, { status: 400 })
  }
  if (q.length < 2) return NextResponse.json({ results: [] })

  const admin = createAdminClient()
  /*
   * ESCAPED, because inside or(...) a comma is GRAMMAR. Until 19 September 2026
   * this was `%${q}%` dropped straight into the filter, so a query carrying a
   * comma answered PGRST100, the route answered 500, and the picker showed
   * nothing with no way to know a comma was the reason. Four of the first 320
   * event titles on TEST carry one and they are all of the shape
   * "Something Night, Geelong". See src/lib/supabase/or-filter.ts.
   */
  const term = `%${q}%`

  if (kind === 'organisation') {
    const { data, error } = await admin
      .from('organisations')
      .select('id, name')
      // .ilike() passes its value as its own parameter, so it is NOT the or()
      // grammar and a comma in it is data. Verified against TEST, not assumed.
      .ilike('name', term)
      .order('name', { ascending: true })
      .limit(10)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({
      results: (data ?? []).map((o) => ({ id: o.id, label: o.name, sub: o.id })),
    })
  }

  const { data, error } = await admin
    .from('events')
    .select('id, title, slug, start_date, timezone, organisations(name)')
    .or(ilikeAnyOf(['title', 'slug'], q))
    .order('start_date', { ascending: false })
    .limit(10)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    results: (data ?? []).map((e) => {
      const org = e.organisations as { name: string } | { name: string }[] | null
      const orgName = Array.isArray(org) ? org[0]?.name : org?.name
      /*
       * THE EVENT'S OWN ZONE, NEVER UTC. This date is the only thing that
       * separates two events with the same title in the fee-override picker,
       * and it used to slice the first ten characters off the stored instant,
       * which is the UTC calendar date.
       *
       * The stored instant is the local start minus the zone's offset, so the
       * UTC date is a day EARLY for every event whose local start is before its
       * own offset: before 10 am in Sydney, before 8 am in Perth. That is every
       * matinee, market, brunch, workshop and family show on the platform. The
       * picker was offering a fee override against the wrong night.
       */
      const date = e.start_date ? formatEventDate(e.start_date, e.timezone) : ''
      return { id: e.id, label: e.title, sub: [orgName, date].filter(Boolean).join(' · ') }
    }),
  })
}
