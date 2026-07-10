import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_PREFS } from '@/lib/notifications/policy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const hour = z.number().int().min(0).max(23).nullable()
const BodySchema = z.object({
  push_enabled: z.boolean().optional(),
  email_enabled: z.boolean().optional(),
  quiet_hours_start: hour.optional(),
  quiet_hours_end: hour.optional(),
  timezone: z.string().max(64).optional(),
})

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 })

  const { data } = await supabase
    .from('notification_prefs')
    .select('push_enabled, email_enabled, quiet_hours_start, quiet_hours_end, timezone')
    .eq('user_id', user.id)
    .maybeSingle()
  return NextResponse.json({ ok: true, prefs: data ?? DEFAULT_PREFS })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 })

  let body: z.infer<typeof BodySchema>
  try {
    body = BodySchema.parse(await request.json())
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid preferences' }, { status: 400 })
  }

  const { error } = await supabase.from('notification_prefs').upsert(
    {
      user_id: user.id,
      ...body,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )
  if (error) return NextResponse.json({ ok: false, error: 'Could not save preferences' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
