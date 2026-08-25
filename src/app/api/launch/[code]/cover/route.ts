import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { captureException } from '@/lib/observability/sentry'
// Named type imports, not the `sharp.Metadata` namespace form: sharp 0.35 replaced
// the 0.34 `export =` shape with real ESM named exports, so the qualified form is
// a compile error. See the same note in image-pipeline.ts.
import sharp, { type Metadata, type OutputInfo } from 'sharp'
import { createAdminClient } from '@/lib/supabase/admin'
import { KIT_DRAFT_COOKIE, isKitDraftToken } from '@/lib/growth/kit-draft'
import { attachDraftCover, isKitCode, readDraftByToken } from '@/lib/launch/draft-store'
 import { sniffImage } from '@/lib/launch/sniff-image'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { IMAGE_DOWNSCALE_LONG_EDGE, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS } from '@/lib/media/limits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * ANONYMOUS COVER ARTWORK UPLOAD for the public composer.
 *
 * This is the one thing that closes the gap with a design tool. A poster with
 * no photograph in it will never match what a promoter could make themselves,
 * and the two things that make a poster theirs are their artwork and their
 * name. Law 6 is why this is an UPLOAD and not a generator: the platform
 * renders what the organiser supplies, it never invents imagery for their night.
 *
 * OWNERSHIP, NOT AUTH. There is no account here by design, so the caller proves
 * they own the draft with the httpOnly el_kit_draft cookie, exactly as
 * emailKitToSelf does. The code in the URL is deliberately SHAREABLE and is
 * never sufficient on its own; attachDraftCover additionally refuses a token
 * that owns a different draft from the code being written to.
 *
 * WHY THERE IS NO ANONYMOUS INSERT POLICY ON THE BUCKET. The migration grants
 * public READ and no anonymous INSERT at all. The only writer is this route,
 * using the service role, after the bytes have passed every check below. That
 * leaves no anon-writable bucket anywhere in the project, which is both simpler
 * and stricter than granting anon INSERT and trying to constrain it in policy.
 *
 * VALIDATION ORDER IS CHEAPEST FIRST, so a flood is refused before it costs
 * anything: rate limit, then ownership, then byte length, then magic bytes,
 * then a metadata read, then the decompression-bomb guard, and only then a
 * decode.
 */

const REFUSED = 'That file is not a photo we can use. Upload a JPEG, PNG, WebP, AVIF or HEIC image.'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const { code } = await params
  if (!isKitCode(code)) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  }

  const limited = await applyRateLimit('launch-upload', request)
  if (limited) return limited

  const jar = await cookies()
  const token = jar.get(KIT_DRAFT_COOKIE)?.value
  if (!isKitDraftToken(token)) {
    return NextResponse.json({ ok: false, error: 'not_your_draft' }, { status: 403 })
  }

  // OWNERSHIP IS CHECKED BEFORE ANY WRITE, not just before the pointer moves.
  //
  // The object path is <code>/cover.webp, derived from the code, which is
  // SHAREABLE by design, and the upload is an upsert. Checking ownership only
  // after the write (which is what this route did first) let anybody holding a
  // shared code REPLACE the owner's artwork: the response still said 403 and
  // the draft pointer never moved, so it looked refused, but the bytes behind
  // the owner's poster were the attacker's. attachDraftCover still re-checks
  // below; this is the check that has to happen first.
  const owned = await readDraftByToken(token)
  if (!owned || owned.code !== code) {
    return NextResponse.json({ ok: false, error: 'not_your_draft' }, { status: 403 })
  }

  let file: File | null = null
  try {
    const form = await request.formData()
    const candidate = form.get('file')
    file = candidate instanceof File ? candidate : null
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 })
  }
  if (!file) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 })
  }

  // 1. Byte length, before anything is read into memory as pixels. 10MB is the
  //    market standard: Eventbrite (help 682424) and Humanitix (help 8892493)
  //    both publish exactly this cap, both fetched 9 August 2026.
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        // The cap matches the market (Eventbrite help 682424, Humanitix help
        // 8892493, both fetched 9 August 2026) but the copy does not SAY so:
        // naming a competitor in a message an organiser reads is a copy defect,
        // and the copy-tell gate is right to refuse it. The citation belongs in
        // the code, where the next person changing the number will look.
        error: `That photo is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is ${MAX_IMAGE_BYTES / 1024 / 1024}MB, so try a smaller one.`,
      },
      { status: 413 },
    )
  }

  const input = Buffer.from(await file.arrayBuffer())
  if (input.byteLength > MAX_IMAGE_BYTES || input.byteLength < 12) {
    return NextResponse.json({ ok: false, error: REFUSED }, { status: 413 })
  }

  // 2. Magic bytes. The declared Content-Type is attacker-controlled and is
  //    never consulted.
  if (!sniffImage(input)) {
    return NextResponse.json({ ok: false, error: REFUSED }, { status: 415 })
  }

  // 3. Metadata, then the decompression-bomb guard, both before any decode.
  let meta: Metadata
  try {
    meta = await sharp(input, { failOn: 'error' }).metadata()
  } catch (error) {
    captureException(error, { where: 'app/api/launch/[code]/cover/route:125' })
    return NextResponse.json({ ok: false, error: REFUSED }, { status: 415 })
  }
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  if (width < 1 || height < 1 || width * height > MAX_IMAGE_PIXELS) {
    return NextResponse.json({ ok: false, error: REFUSED }, { status: 415 })
  }

  // 4. Downscale and FULLY RE-ENCODE.
  //
  //    Re-encoding is a security control before it is a size one. It strips
  //    EXIF, and the reason that matters is not abstract: this composer's
  //    typical event is a small community one, a birthday at somebody's house,
  //    and the GPS tag in a phone photo of that is a home address attached to a
  //    child's party on a publicly readable object. It also discards anything
  //    smuggled in the container, because nothing survives the round trip
  //    except pixels.
  //
  //    WebP at the long-edge ceiling is also the real storage lever: it takes a
  //    typical phone photo from roughly 2MB to 200-400KB, which matters far
  //    more than the sweep does.
  let output: { data: Buffer; info: OutputInfo }
  try {
    output = await sharp(input)
      .rotate()
      .resize({
        width: IMAGE_DOWNSCALE_LONG_EDGE,
        height: IMAGE_DOWNSCALE_LONG_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true })
  } catch (error) {
    captureException(error, { where: 'app/api/launch/[code]/cover/route:160' })
    return NextResponse.json({ ok: false, error: REFUSED }, { status: 415 })
  }

  // One object per draft, overwritten on re-upload, so a single draft can never
  // hold more than one object however many times the organiser changes their
  // mind. The code is already unguessable at 31^12, so the path inherits that.
  const objectName = `${code}/cover.webp`
  const admin = createAdminClient()
  const { error: storeError } = await admin.storage
    .from('kit-draft-covers')
    .upload(objectName, output.data, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: true,
    })
  if (storeError) {
    console.error('[launch.cover] storage error:', storeError)
    return NextResponse.json({ ok: false, error: 'upload_failed' }, { status: 502 })
  }

  const { data: publicUrl } = admin.storage.from('kit-draft-covers').getPublicUrl(objectName)

  const draft = await attachDraftCover({
    token,
    code,
    coverUrl: publicUrl.publicUrl,
    coverPath: objectName,
  })
  if (!draft) {
    // The token does not own this code, or the store is unavailable. The object
    // is left to the sweep rather than deleted here, because a failed attach on
    // a draft that DOES exist would otherwise race a concurrent legitimate
    // upload into deleting its artwork.
    return NextResponse.json({ ok: false, error: 'not_your_draft' }, { status: 403 })
  }

  return NextResponse.json(
    {
      ok: true,
      coverUrl: publicUrl.publicUrl,
      width: output.info.width,
      height: output.info.height,
    },
    { headers: { 'X-Robots-Tag': 'noindex, nofollow, noimageindex' } },
  )
}
