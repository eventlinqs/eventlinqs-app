import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { createAdminClient } from '@/lib/supabase/admin'

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
  const term = `%${q}%`

  if (kind === 'organisation') {
    const { data, error } = await admin
      .from('organisations')
      .select('id, name')
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
    .select('id, title, slug, start_date, organisations(name)')
    .or(`title.ilike.${term},slug.ilike.${term}`)
    .order('start_date', { ascending: false })
    .limit(10)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    results: (data ?? []).map((e) => {
      const org = e.organisations as { name: string } | { name: string }[] | null
      const orgName = Array.isArray(org) ? org[0]?.name : org?.name
      const date = e.start_date ? new Date(e.start_date).toISOString().slice(0, 10) : ''
      return { id: e.id, label: e.title, sub: [orgName, date].filter(Boolean).join(' · ') }
    }),
  })
}
