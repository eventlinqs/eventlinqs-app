import { createHash, timingSafeEqual } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * THE STUDIO'S UPLOAD, DIRECT FROM THE CLOUD (car T, T4, the PM's 02:05 of 28 November 2026; the design posted at 01:57).
 * The cloud studio's shell sends each rendered PNG with curl to POST /api/studio/uploads, so its bytes never pass through
 * the model's text and the laptop leaves the path. The route proves the caller (requireStudioToken), validates the
 * payload against one schema (parseStudioUpload), and writes the row into studio_uploads on the server
 * (writeStudioUpload), where the table's own trigger judges the PNG again: its size for its view, never changed once it
 * has moved. After that the move is unchanged: JPEG to event-images/creative/<piece id>/, then the creative intake.
 */

/** The table's own check: octet_length(png) between 33 and 4194304 (migration 20261127140001). */
export const STUDIO_UPLOAD_MIN_BYTES = 33
export const STUDIO_UPLOAD_MAX_BYTES = 4 * 1024 * 1024

export const STUDIO_VIEWS = ['full', 'phone', 'grid', 'desktop'] as const
export type StudioUploadView = (typeof STUDIO_VIEWS)[number]

export type StudioUpload = {
  readonly pieceKey: string
  readonly slideNo: number
  readonly format: 'feed' | 'story'
  readonly view: StudioUploadView
  readonly sha256: string
  readonly bytes: Uint8Array
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
/** The table's own check on a piece's key (migration 20261127140001). */
const PIECE_KEY = /^[a-z0-9][a-z0-9-]{2,119}$/

/**
 * THE STUDIO'S TOKEN (STUDIO_UPLOAD_TOKEN, scoped to this one route): "Authorization: Bearer <token>", compared in
 * constant time over both values' SHA-256, so neither its length nor its prefix can be learned from the answer's time. Pure.
 */
export function requireStudioToken(header: string | null, token: string): boolean {
  const m = /^Bearer\s+(\S+)$/.exec((header ?? '').trim())
  if (!m || token.length === 0) return false
  return timingSafeEqual(createHash('sha256').update(m[1]).digest(), createHash('sha256').update(token).digest())
}

const field = (form: FormData, name: string): string | null => {
  const v = form.get(name)
  return typeof v === 'string' ? v.trim() : null
}

/**
 * THE ONE SCHEMA: piece_key (the table's own key shape), slide_no (1 to 20), format (feed or story), view (full, phone,
 * grid or desktop; full when left out), sha256 (64 hex characters), and file (a PNG of 33 bytes to 4 MB whose own
 * SHA-256 is the one sent). Every refusal says which field and why.
 */
export async function parseStudioUpload(form: FormData): Promise<{ readonly ok: true; readonly value: StudioUpload } | { readonly ok: false; readonly reason: string }> {
  const pieceKey = field(form, 'piece_key')
  if (!pieceKey || !PIECE_KEY.test(pieceKey)) return { ok: false, reason: 'piece_key: lower case letters, digits and hyphens, 3 to 120 characters' }
  const slide = field(form, 'slide_no')
  const slideNo = slide && /^\d{1,2}$/.test(slide) ? Number(slide) : NaN
  if (!(slideNo >= 1 && slideNo <= 20)) return { ok: false, reason: 'slide_no: a whole number from 1 to 20' }
  const format = field(form, 'format')
  if (format !== 'feed' && format !== 'story') return { ok: false, reason: 'format: feed or story' }
  const view = field(form, 'view') ?? 'full'
  if (!(STUDIO_VIEWS as readonly string[]).includes(view)) return { ok: false, reason: `view: one of ${STUDIO_VIEWS.join(', ')}` }
  const sha256 = field(form, 'sha256')?.toLowerCase() ?? ''
  if (!/^[0-9a-f]{64}$/.test(sha256)) return { ok: false, reason: 'sha256: the file\'s SHA-256, 64 hex characters' }
  const file = form.get('file')
  if (!(file instanceof Blob)) return { ok: false, reason: 'file: the rendered PNG, sent as a file' }
  if (file.size < STUDIO_UPLOAD_MIN_BYTES || file.size > STUDIO_UPLOAD_MAX_BYTES) return { ok: false, reason: `file: ${file.size} bytes; a slide is 33 bytes to 4 MB` }
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return { ok: false, reason: 'file: not a PNG (its first eight bytes are not the PNG signature)' }
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) return { ok: false, reason: 'sha256: the file\'s own SHA-256 is not the one sent, so it changed on the way' }
  return { ok: true, value: { pieceKey, slideNo, format, view: view as StudioUploadView, sha256, bytes } }
}

/**
 * THE ROW, WRITTEN ON THE SERVER: the piece is read by its key (it must exist, in this format, with this many slides),
 * then the upload is kept in studio_uploads, a slide's view sent again replacing its PNG until it has moved. The table's
 * trigger judges the PNG once more (its size for its view) and its refusal is answered as it reads; the stored SHA-256,
 * computed by the database, must be the one sent. A failed read or write throws.
 */
export async function writeStudioUpload(
  db: SupabaseClient,
  u: StudioUpload,
): Promise<{ readonly ok: true; readonly id: string; readonly sha256: string } | { readonly ok: false; readonly status: 404 | 422; readonly reason: string }> {
  const p = await db.from('studio_pieces').select('brief_id, canvas_url, format, slides').eq('piece_key', u.pieceKey).maybeSingle()
  if (p.error) throw new Error(`the studio piece ${u.pieceKey} could not be read: ${p.error.message}`)
  const piece = p.data as { brief_id: string; canvas_url: string; format: string; slides: number } | null
  if (!piece) return { ok: false, status: 404, reason: `no studio piece ${u.pieceKey}: write the piece before its slides` }
  if (piece.format !== u.format) return { ok: false, status: 422, reason: `the piece ${u.pieceKey} is a ${piece.format} piece, not ${u.format}` }
  if (u.slideNo > piece.slides) return { ok: false, status: 422, reason: `the piece ${u.pieceKey} has ${piece.slides} slides, so there is no slide ${u.slideNo}` }
  const w = await db
    .from('studio_uploads')
    .upsert(
      { brief_id: piece.brief_id, piece_key: u.pieceKey, slide_no: u.slideNo, format: u.format, view: u.view, png: `\\x${Buffer.from(u.bytes).toString('hex')}`, canvas_url: piece.canvas_url },
      { onConflict: 'piece_key,slide_no,format,view' },
    )
    .select('id, sha256')
    .single()
  if (w.error) {
    if (/^refused: /.test(w.error.message)) return { ok: false, status: 422, reason: w.error.message }
    throw new Error(`the slide could not be kept: ${w.error.message}`)
  }
  const row = w.data as { id: string; sha256: string }
  if (row.sha256 !== u.sha256) throw new Error(`the kept slide's SHA-256 ${row.sha256.slice(0, 12)} is not the one sent ${u.sha256.slice(0, 12)}`)
  return { ok: true, id: row.id, sha256: row.sha256 }
}
