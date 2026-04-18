import { NextRequest, NextResponse } from 'next/server'

type LocationBody = {
  city: string
  country: string
  countryCode: string
  latitude?: number | null
  longitude?: number | null
}

export async function POST(request: NextRequest) {
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
