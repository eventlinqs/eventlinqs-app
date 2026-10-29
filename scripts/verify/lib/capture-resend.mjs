/**
 * NO EMAIL LEAVES THE MACHINE IN A DRIVE (window 2, 28 October 2026; the engine plan's rule "never send email").
 *
 *   NODE_OPTIONS="--import ./scripts/verify/lib/capture-resend.mjs" DRIVE_MAIL_CAPTURE=<file> next dev ...
 *
 * Loaded before the dev server, it answers every request to the email provider's API (api.resend.com, the address the
 * resend package calls) itself: the request body is appended to the capture file as one JSON line and a made-up id is
 * returned, so the product's own send path runs end to end and nothing is delivered. A drive reads the code from the
 * capture. Every other request goes out untouched. Without DRIVE_MAIL_CAPTURE set it refuses to load, so it can never
 * be left in place by accident.
 */
import { appendFileSync } from 'node:fs'

const capture = process.env.DRIVE_MAIL_CAPTURE
if (!capture) throw new Error('capture-resend: DRIVE_MAIL_CAPTURE is not set; refusing to load')

const realFetch = globalThis.fetch
let n = 0
globalThis.fetch = async function capturedFetch(input, init) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url.startsWith('https://api.resend.com/')) {
    n += 1
    const body = init?.body ?? (typeof input === 'object' && 'text' in input ? await input.text() : null)
    appendFileSync(capture, `${JSON.stringify({ at: new Date().toISOString(), url, body: typeof body === 'string' ? JSON.parse(body) : null })}\n`)
    return new Response(JSON.stringify({ id: `captured-${process.pid}-${n}` }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return realFetch(input, init)
}
