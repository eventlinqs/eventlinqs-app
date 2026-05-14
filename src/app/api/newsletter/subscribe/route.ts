import { NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * POST /api/newsletter/subscribe - city + suburb newsletter capture.
 *
 * v1 stub: validates input, logs the signup, returns 200. The downstream
 * provider integration (Resend audiences) is wired in M9 marketing.
 * Until then this endpoint returns success so the city CTA panel stays
 * functional without exposing a "feature not yet available" message on
 * a public marketing surface.
 *
 * Rate-limit and abuse protection are handled at the platform level
 * (Vercel + Upstash Redis fixed window) per the M5 hardening plan.
 */

const Body = z.object({
  email: z.string().email().max(254),
  source: z.enum(['city', 'suburb', 'culture', 'home']).optional(),
  city: z.string().max(120).optional(),
})

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  const parsed = Body.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 })
  }

  const { email, source, city } = parsed.data
  console.log(
    JSON.stringify({
      event: 'newsletter.subscribe.queued',
      email_hash_prefix: email.slice(0, 2) + '***',
      source: source ?? 'unknown',
      city: city ?? null,
      ts: new Date().toISOString(),
    }),
  )

  return NextResponse.json({ ok: true })
}
