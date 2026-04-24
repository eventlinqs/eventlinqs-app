import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, clientIp } from '@/lib/redis/rate-limit'

type LocationBody = {
  city: string
  country: string
  countryCode: string
  latitude?: number | null
  longitude?: number | null
}

export async function POST(request: NextRequest) {
  const rl = await checkRateLimit({
    key: `loc-set:${clientIp(request)}`,
    limit: 30,
    windowSec: 60,
  })
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'retry-after': String(Math.ceil(rl.resetMs / 1000)) } },
    )
  }

  const body = (await request.json()) as LocationBody
  const res = NextResponse.json({ ok: true })
  res.cookies.set(
    'el_city',
    JSON.stringify({
      city: body.city,
      country: body.country,
      countryCode: body.countryCode,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
    }),
    {
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
      sameSite: 'lax',
    },
  )
  return res
}
