// The anonymous cover upload route, driven for real.
//
// This is an UNAUTHENTICATED endpoint that writes bytes to a publicly readable
// bucket on our own domain, so every refusal in its validation ladder is a
// security control rather than a nicety. The handover for this work had to say
// "the HTTP route itself has never executed", which is exactly the state in
// which a validation ladder quietly has a rung missing.
//
// Driven against:
//   - the REAL draft store, over an in-memory Redis, so ownership is genuinely
//     exercised rather than mocked away. The case that matters is Mallory:
//     a valid cookie token for HER draft, plus Ruby's code, which is public by
//     design. That must not be enough.
//   - a storage mock that CAPTURES the uploaded bytes, so the re-encode can be
//     asserted on what would really be stored, not on what the route says it
//     did.
//
// Only the network edges are mocked: Supabase Storage, the rate limiter, and
// the cookie jar. Sharp, the sniffer, the downscale and the store are real.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import type { NextRequest } from 'next/server'

type Entry = { value: unknown; expiresAt: number }

class FakeRedis {
  store = new Map<string, Entry>()
  now = 1_000_000

  private live(key: string): Entry | null {
    const e = this.store.get(key)
    if (!e) return null
    if (e.expiresAt <= this.now) {
      this.store.delete(key)
      return null
    }
    return e
  }
  async get<T>(key: string): Promise<T | null> {
    return (this.live(key)?.value as T) ?? null
  }
  async setex(key: string, seconds: number, value: unknown): Promise<'OK'> {
    this.store.set(key, { value, expiresAt: this.now + seconds })
    return 'OK'
  }
  async ttl(key: string): Promise<number> {
    const e = this.live(key)
    return e ? Math.ceil(e.expiresAt - this.now) : -2
  }
}

const h = vi.hoisted(() => ({
  redis: null as FakeRedis | null,
  cookieValue: undefined as string | undefined,
  /** Set to a Response to simulate the rate limiter refusing. */
  rateLimited: null as Response | null,
  uploaded: null as { path: string; body: Buffer; contentType?: string } | null,
  uploadError: null as { message: string } | null,
}))

vi.mock('@/lib/redis/client', () => ({ getRedisClient: vi.fn(() => h.redis) }))

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (_name: string) => (h.cookieValue ? { value: h.cookieValue } : undefined) }),
}))

vi.mock('@/lib/rate-limit/middleware', () => ({
  applyRateLimit: vi.fn(async () => h.rateLimited),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    storage: {
      from: (_bucket: string) => ({
        upload: async (path: string, body: Buffer, opts?: { contentType?: string }) => {
          if (h.uploadError) return { error: h.uploadError }
          h.uploaded = { path, body, contentType: opts?.contentType }
          return { error: null }
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://test.supabase.co/storage/v1/object/public/kit-draft-covers/${path}` },
        }),
      }),
    },
  }),
}))

const { POST } = await import('@/app/api/launch/[code]/cover/route')
const { saveDraft, readDraftByCode, mintKitCode, mintKitToken } = await import(
  '@/lib/launch/draft-store'
)
const { IMAGE_DOWNSCALE_LONG_EDGE } = await import('@/lib/media/limits')

const payload = {
  // Internal ticketing: the cover-upload path is identical either way.
  externalTicketUrl: null,
  title: "Ruby's 16th",
  summary: 'A sixteenth at home.',
  description: 'A sixteenth at home.',
  startDate: '2026-09-20T18:00',
  endDate: '',
  venueName: 'Belmont Hall',
  venueSuburb: 'Belmont',
  venueCity: 'Geelong',
  categoryName: 'Family',
  isFree: true,
  price: null,
  capacity: null,
  billNames: [],
  visibility: 'unlisted' as const,
  visibilityReason: 'private residence',
  addressHeldBack: true,
  coverUrl: null,
  sourceText: 'Ruby turns 16.',
  unresolved: [],
}

/**
 * A real JPEG at real camera dimensions, carrying GPS EXIF.
 *
 * Copied into a freshly ALLOCATED Uint8Array rather than wrapping the Buffer,
 * because BlobPart requires a view over a plain ArrayBuffer and wrapping a
 * Buffer keeps the wider ArrayBufferLike that File will not accept.
 */
async function cameraPhoto(width = 3625, height = 4961): Promise<Uint8Array<ArrayBuffer>> {
  const buf = await sharp({
    create: { width, height, channels: 3, background: { r: 30, g: 60, b: 90 } },
  })
    .jpeg({ quality: 60 })
    .withExif({ IFD0: { Copyright: 'A Real Person' }, IFD3: { GPSLatitudeRef: 'S' } })
    .toBuffer()
  const copy = new Uint8Array(buf.byteLength)
  copy.set(buf)
  return copy
}

function post(code: string, file: File | null): Promise<Response> {
  const body = new FormData()
  if (file) body.append('file', file)
  const request = new Request('https://eventlinqs.com/api/launch/x/cover', {
    method: 'POST',
    body,
  }) as unknown as NextRequest
  return POST(request, { params: Promise.resolve({ code }) }) as unknown as Promise<Response>
}

async function seedDraft() {
  const token = mintKitToken()
  const draft = (await saveDraft({ code: mintKitCode(), token, payload }))!
  return { token, code: draft.code }
}

beforeEach(() => {
  h.redis = new FakeRedis()
  h.cookieValue = undefined
  h.rateLimited = null
  h.uploaded = null
  h.uploadError = null
})

describe('the upload refuses before it spends anything', () => {
  it('refuses a code that is not a kit code, without touching storage', async () => {
    const res = await post('../../etc/passwd', new File([await cameraPhoto(64, 64)], 'a.jpg'))
    expect(res.status).toBe(404)
    expect(h.uploaded).toBeNull()
  })

  it('honours the rate limiter before doing any work', async () => {
    h.rateLimited = new Response(JSON.stringify({ ok: false }), { status: 429 })
    const { code } = await seedDraft()
    const res = await post(code, new File([await cameraPhoto(64, 64)], 'a.jpg'))
    expect(res.status).toBe(429)
    expect(h.uploaded).toBeNull()
  })

  it('refuses with no ownership cookie at all', async () => {
    const { code } = await seedDraft()
    const res = await post(code, new File([await cameraPhoto(64, 64)], 'a.jpg'))
    expect(res.status).toBe(403)
    expect(h.uploaded).toBeNull()
  })

  it('refuses SVG, which would otherwise execute on our own domain', async () => {
    const { token, code } = await seedDraft()
    h.cookieValue = token
    const svg = new Uint8Array(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))
    // Declared as an image, named as an image. Neither is consulted.
    const res = await post(code, new File([svg], 'cover.jpg', { type: 'image/jpeg' }))
    expect(res.status).toBe(415)
    expect(h.uploaded).toBeNull()
  })

  it('refuses a file over the 10MB market cap', async () => {
    const { token, code } = await seedDraft()
    h.cookieValue = token
    const tooBig = new Uint8Array(11 * 1024 * 1024).fill(1)
    // Real JPEG magic in front, so the size gate is what refuses it, not sniffing.
    tooBig[0] = 0xff
    tooBig[1] = 0xd8
    tooBig[2] = 0xff
    const res = await post(code, new File([tooBig], 'big.jpg', { type: 'image/jpeg' }))
    expect(res.status).toBe(413)
    expect(h.uploaded).toBeNull()
  })

  it('refuses when no file is attached', async () => {
    const { token, code } = await seedDraft()
    h.cookieValue = token
    const res = await post(code, null)
    expect(res.status).toBe(400)
  })
})

describe('the upload accepts a real camera photo', () => {
  it("accepts the founder's 3625 x 4961 photo, downscales it, and attaches it", async () => {
    const { token, code } = await seedDraft()
    h.cookieValue = token

    const res = await post(code, new File([await cameraPhoto()], 'IMG_4821.JPG', { type: 'image/jpeg' }))
    expect(res.status).toBe(200)

    const json = (await res.json()) as { ok: boolean; coverUrl: string; width: number; height: number }
    expect(json.ok).toBe(true)
    expect(Math.max(json.width, json.height)).toBe(IMAGE_DOWNSCALE_LONG_EDGE)

    // One object per draft, named by the unguessable code.
    expect(h.uploaded!.path).toBe(`${code}/cover.webp`)
    expect(h.uploaded!.contentType).toBe('image/webp')

    // What would really be STORED is re-encoded WebP at the ceiling, with no
    // EXIF: this is the child-safety claim, asserted on the stored bytes.
    const storedMeta = await sharp(h.uploaded!.body).metadata()
    expect(storedMeta.format).toBe('webp')
    expect(Math.max(storedMeta.width ?? 0, storedMeta.height ?? 0)).toBe(IMAGE_DOWNSCALE_LONG_EDGE)
    expect(storedMeta.exif).toBeFalsy()

    // And the draft now points at it, so the poster and cards will pick it up.
    const draft = await readDraftByCode(code)
    expect(draft!.payload.coverUrl).toBe(json.coverUrl)
  })

  it('reports a storage failure rather than claiming success', async () => {
    const { token, code } = await seedDraft()
    h.cookieValue = token
    h.uploadError = { message: 'bucket not found' }

    const res = await post(code, new File([await cameraPhoto(1200, 800)], 'a.jpg'))
    expect(res.status).toBe(502)
    // The draft must not be left pointing at an object that was never written.
    expect((await readDraftByCode(code))!.payload.coverUrl).toBeNull()
  })
})

describe('the ownership rule, through the HTTP layer', () => {
  it("REFUSES Mallory: her own valid token, plus Ruby's shareable code", async () => {
    const ruby = await seedDraft()
    const mallory = await seedDraft()
    h.cookieValue = mallory.token

    const res = await post(ruby.code, new File([await cameraPhoto(1200, 800)], 'a.jpg'))
    expect(res.status).toBe(403)

    // Ruby's poster is untouched.
    expect((await readDraftByCode(ruby.code))!.payload.coverUrl).toBeNull()

    // AND NOTHING WAS WRITTEN TO STORAGE. Asserting only the draft pointer
    // above is not enough and is how this defect survived its first test: the
    // object path is <code>/cover.webp, derived from the code Mallory already
    // has, and the upload is an upsert. If the write happens before the
    // ownership check, Mallory silently REPLACES the artwork on Ruby's poster
    // even though the response says 403 and the pointer never moves.
    expect(h.uploaded).toBeNull()
  })

  it('refuses Mallory even when Ruby already has artwork, without replacing it', async () => {
    const ruby = await seedDraft()
    const mallory = await seedDraft()

    h.cookieValue = ruby.token
    const rubysPhoto = await post(ruby.code, new File([await cameraPhoto(1200, 800)], 'ruby.jpg'))
    expect(rubysPhoto.status).toBe(200)
    const rubysBytes = h.uploaded!.body
    h.uploaded = null

    h.cookieValue = mallory.token
    const attack = await post(ruby.code, new File([await cameraPhoto(800, 600)], 'mallory.jpg'))
    expect(attack.status).toBe(403)
    expect(h.uploaded).toBeNull()

    // Ruby's stored artwork is the artwork Ruby uploaded.
    const stillRubys = await readDraftByCode(ruby.code)
    expect(stillRubys!.payload.coverUrl).toContain(`${ruby.code}/cover.webp`)
    expect(rubysBytes.byteLength).toBeGreaterThan(0)
  })
})
