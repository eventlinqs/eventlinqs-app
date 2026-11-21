import { NextResponse } from 'next/server'
import { z } from 'zod'

import { sendEmail } from '@/lib/email/send'
import { supportDestination } from '@/lib/env/destinations'
import { checkRateLimit, clientIp } from '@/lib/redis/rate-limit'
import { POLICIES } from '@/lib/rate-limit/policies'

/**
 * POST /api/contact - the /contact page's "Send us a message".
 *
 * WHAT THIS REPLACES (WINDOW 5C, 21 November 2026; Lawal, 09:02: "People have written to us that they are unable to
 * carry out functions on the website ... Every function works to completion"). The form used to set
 * window.location.href to a mailto: link and, half a second later, show "Message received. Thanks." whatever happened.
 * On a phone or a computer with no mail app set up nothing opens at all, so a visitor was told their message had arrived
 * when nothing had been sent: a false statement, and a function that never completed. Found by the production journey
 * tests/e2e/production-journeys/d3-forms.journey.ts.
 *
 * NOW: the message is delivered to the support inbox (SUPPORT_INBOX_EMAIL, otherwise hello@) through the platform's one
 * sender, with the visitor's own address in the body so a person can answer it, and the route answers ok ONLY when the
 * provider has accepted the email (a Resend id). The page says "Message received" only on that answer; on any other it
 * says plainly that the message was not sent and gives the address to write to.
 *
 * Public and unauthenticated, and it sends an email from our domain, so it is rate limited per network, failing closed
 * (POLICIES['contact-form']). A hidden field a person never fills (`website`) quietly drops a script's submission.
 */

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(2).max(5000),
  website: z.string().max(200).optional(),
})

export const runtime = 'nodejs'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

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
  const { name, email, subject, message, website } = parsed.data

  const policy = POLICIES['contact-form']
  const limited = await checkRateLimit({
    key: `${policy.keyPrefix}:${clientIp(request)}`,
    limit: policy.limit,
    windowSec: policy.windowSec,
    failClosed: policy.failClosed,
  })
  if (!limited.ok) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
  }

  // A script fills every field; a person never sees this one. Answer as if sent, send nothing.
  if (website && website.trim() !== '') {
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;">
    <h2 style="color:#0A1628;">A message from the contact page</h2>
    <p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;<br/>
       <strong>Subject:</strong> ${escapeHtml(subject)}</p>
    <div style="white-space:pre-wrap;color:#1f2937;border:1px solid #e5e7eb;padding:12px;">${escapeHtml(message)}</div>
    <p style="color:#6b7280;font-size:12px;">Sent from the contact page of EventLinqs. Answer the visitor at the address above.</p>
  </div>`

  try {
    const { id } = await sendEmail({
      to: supportDestination(),
      subject: `Contact page: ${subject.slice(0, 150)}`,
      messageType: 'support_contact',
      recipientRole: 'support',
      html,
      text: `A message from the contact page\nFrom: ${name} <${email}>\nSubject: ${subject}\n\n${message}`,
    })
    if (!id) return NextResponse.json({ ok: false, error: 'not_sent' }, { status: 502 })
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    console.error('[contact] the message could not be sent:', err instanceof Error ? err.message.slice(0, 200) : 'unknown')
    return NextResponse.json({ ok: false, error: 'not_sent' }, { status: 502 })
  }
}
