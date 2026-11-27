import { NextResponse } from 'next/server'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { captureException } from '@/lib/observability/sentry'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseStudioUpload, requireStudioToken, STUDIO_UPLOAD_MAX_BYTES, writeStudioUpload } from '@/lib/social/studio-upload'

/**
 * POST /api/studio/uploads: the cloud studio's rendered slide, one PNG a request, sent by its shell with curl (car T,
 * T4, the PM's 02:05 of 28 November 2026; src/lib/social/studio-upload.ts). Server to server only: no CORS headers, no
 * cookies read, nothing cached. In this order, so nothing is read or parsed before the caller is proved:
 *
 *   503 not-configured   while STUDIO_UPLOAD_TOKEN is unset: the route is off wherever the token is absent
 *   413 too-large        a declared body over 4 MB and its form fields, refused before it is read
 *   401 unauthorised     no bearer token, or not the studio's
 *   429                  the one caller's bucket, FAIL-CLOSED
 *   400 bad-request      the payload against the schema, with the field and the reason
 *   404 no-piece         no studio piece by that key
 *   422 refused          the piece's own rules (its format, its slides) or the table's trigger, as it reads
 *   201                  the row's id and the SHA-256 the database computed, equal to the one sent
 */

export const dynamic = 'force-dynamic'

/** The file and the five short fields of one multipart body. */
const MAX_BODY_BYTES = STUDIO_UPLOAD_MAX_BYTES + 64 * 1024

const refuse = (status: number, error: string, reason?: string) =>
  NextResponse.json(reason ? { error, reason } : { error }, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request) {
  const token = process.env.STUDIO_UPLOAD_TOKEN?.trim()
  if (!token) return refuse(503, 'not-configured')
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return refuse(413, 'too-large')
  if (!requireStudioToken(request.headers.get('authorization'), token)) return refuse(401, 'unauthorised')

  // One caller, so one bucket, keyed by the fact of a valid token and applied after it, so no other caller can empty it.
  const limited = await applyRateLimit('studio-upload', request, 'studio')
  if (limited) return limited

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return refuse(400, 'bad-request', 'the body is not multipart form data')
  }
  const parsed = await parseStudioUpload(form)
  if (!parsed.ok) return refuse(400, 'bad-request', parsed.reason)

  try {
    const written = await writeStudioUpload(createAdminClient(), parsed.value)
    if (!written.ok) return refuse(written.status, written.status === 404 ? 'no-piece' : 'refused', written.reason)
    return NextResponse.json({ id: written.id, sha256: written.sha256 }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), { where: 'api/studio/uploads' })
    return refuse(500, 'write-failed')
  }
}
