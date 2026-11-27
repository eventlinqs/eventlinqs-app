import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * CAR T, T4 (the PM's 02:05 of 28 November 2026; the design posted at 01:57). Red on main, where the cloud studio had no
 * road for its rendered slides but the laptop inbox: now its shell sends each PNG to POST /api/studio/uploads, proved by
 * STUDIO_UPLOAD_TOKEN before anything is read, checked against one schema, and written into studio_uploads on the
 * server, where the table's own trigger judges it again; the move is unchanged after that.
 */
const read = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
const TOKEN = 'a'.repeat(64)
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(40).fill(7)])
const SHA = createHash('sha256').update(PNG).digest('hex')

const applyRateLimit = vi.fn(async (_p: string, _r: Request, _id?: string): Promise<Response | null> => null)
const writes: Record<string, unknown>[] = []
let piece: Record<string, unknown> | null = { brief_id: 'b1', canvas_url: 'https://canva.example/d', format: 'feed', slides: 3 }
let refusal: string | null = null
vi.mock('@/lib/rate-limit/middleware', () => ({ applyRateLimit: (...a: [string, Request, string?]) => applyRateLimit(...a) }))
vi.mock('@/lib/observability/sentry', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === 'studio_pieces' ? piece : null, error: null }) }) }),
      upsert: (row: Record<string, unknown>) => {
        writes.push(row)
        return { select: () => ({ single: async () => (refusal ? { data: null, error: { message: refusal } } : { data: { id: 'up-1', sha256: SHA }, error: null }) }) }
      },
    }),
  }),
}))

const { POST } = await import('@/app/api/studio/uploads/route')
const { parseStudioUpload, requireStudioToken } = await import('@/lib/social/studio-upload')

const form = (over: Record<string, string | null> = {}, bytes: Uint8Array = PNG) => {
  const f = new FormData()
  const fields: Record<string, string | null> = { piece_key: 'mel-comingsoon-2026-12-01', slide_no: '2', format: 'feed', view: 'phone', sha256: SHA, ...over }
  for (const [k, v] of Object.entries(fields)) if (v !== null) f.set(k, v)
  f.set('file', new Blob([bytes], { type: 'image/png' }), 'slide.png')
  return f
}
const post = (body: FormData | null, auth: string | null = `Bearer ${TOKEN}`) =>
  POST(new Request('https://www.eventlinqs.com.au/api/studio/uploads', { method: 'POST', headers: auth ? { authorization: auth } : {}, body: body ?? undefined }))

beforeEach(() => {
  vi.stubEnv('STUDIO_UPLOAD_TOKEN', TOKEN)
  writes.length = 0
  piece = { brief_id: 'b1', canvas_url: 'https://canva.example/d', format: 'feed', slides: 3 }
  refusal = null
  applyRateLimit.mockClear()
})
afterEach(() => vi.unstubAllEnvs())

describe('the door, in its order', () => {
  it('is off while the token is unset, and proves the caller before reading anything', async () => {
    vi.stubEnv('STUDIO_UPLOAD_TOKEN', '')
    expect((await post(form())).status).toBe(503)
    vi.stubEnv('STUDIO_UPLOAD_TOKEN', TOKEN)
    expect((await post(form(), null)).status).toBe(401)
    expect((await post(form(), `Bearer ${'b'.repeat(64)}`)).status).toBe(401)
    expect(applyRateLimit).not.toHaveBeenCalled()
    expect(writes).toHaveLength(0)
  })
  it('limits the one caller after the token, in its own bucket', async () => {
    applyRateLimit.mockResolvedValueOnce(new Response(null, { status: 429 }))
    expect((await post(form())).status).toBe(429)
    expect(applyRateLimit).toHaveBeenCalledWith('studio-upload', expect.any(Request), 'studio')
  })
  it('compares the token in constant time over both hashes, never a prefix', () => {
    expect(requireStudioToken(`Bearer ${TOKEN}`, TOKEN)).toBe(true)
    expect(requireStudioToken(`Bearer ${TOKEN.slice(0, 10)}`, TOKEN)).toBe(false)
    expect(requireStudioToken(TOKEN, TOKEN)).toBe(false)
    expect(read('src/lib/social/studio-upload.ts')).toContain('timingSafeEqual(createHash(\'sha256\').update(m[1]).digest(), createHash(\'sha256\').update(token).digest())')
  })
})

describe('the schema', () => {
  it('refuses each field with its reason', async () => {
    expect(await parseStudioUpload(form({ piece_key: 'Bad Key' }))).toEqual({ ok: false, reason: expect.stringMatching(/^piece_key/) })
    expect(await parseStudioUpload(form({ slide_no: '21' }))).toEqual({ ok: false, reason: expect.stringMatching(/^slide_no/) })
    expect(await parseStudioUpload(form({ format: 'reel' }))).toEqual({ ok: false, reason: expect.stringMatching(/^format/) })
    expect(await parseStudioUpload(form({ view: 'tablet' }))).toEqual({ ok: false, reason: expect.stringMatching(/^view/) })
    expect(await parseStudioUpload(form({ sha256: 'x' }))).toEqual({ ok: false, reason: expect.stringMatching(/^sha256/) })
    expect(await parseStudioUpload(form({}, new Uint8Array(40).fill(1)))).toEqual({ ok: false, reason: expect.stringMatching(/not a PNG/) })
    expect(await parseStudioUpload(form({ sha256: 'f'.repeat(64) }))).toEqual({ ok: false, reason: expect.stringMatching(/changed on the way/) })
    const ok = await parseStudioUpload(form({ view: null }))
    expect(ok.ok && ok.value.view).toBe('full')
  })
})

describe('the row, written on the server', () => {
  it("keeps the slide at its piece's brief and canvas, a view sent again replacing it, and answers its id and hash", async () => {
    const res = await post(form())
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 'up-1', sha256: SHA })
    expect(writes[0]).toMatchObject({ brief_id: 'b1', piece_key: 'mel-comingsoon-2026-12-01', slide_no: 2, format: 'feed', view: 'phone', canvas_url: 'https://canva.example/d' })
    expect(String(writes[0].png).startsWith('\\x89504e47')).toBe(true)
  })
  it("refuses an unknown piece, the wrong format, a slide past its count, and answers the table's own refusal", async () => {
    piece = null
    expect((await post(form())).status).toBe(404)
    piece = { brief_id: 'b1', canvas_url: 'https://canva.example/d', format: 'story', slides: 3 }
    expect((await post(form())).status).toBe(422)
    piece = { brief_id: 'b1', canvas_url: 'https://canva.example/d', format: 'feed', slides: 1 }
    expect((await post(form())).status).toBe(422)
    piece = { brief_id: 'b1', canvas_url: 'https://canva.example/d', format: 'feed', slides: 3 }
    refusal = 'refused: the phone view of slide 2 of mel-comingsoon-2026-12-01 is 400 x 500; it is the slide 390 px wide (780 or 1170 at 2x or 3x) in its proportion.'
    const res = await post(form())
    expect(res.status).toBe(422)
    expect((await res.json()).reason).toBe(refusal)
  })
})

describe('the registrations', () => {
  it('declares the token optional and sensitive, its fail-closed policy, the audit and the machine-caller review, and the mint script', () => {
    expect(read('src/lib/env/manifest.mjs')).toContain("name: 'STUDIO_UPLOAD_TOKEN',")
    expect(read('src/lib/rate-limit/policies.ts')).toMatch(/'studio-upload': \{\n    keyPrefix: 'studio-up',\n    limit: 120,\n    windowSec: 60,[\s\S]*?failClosed: true,/)
    expect(read('scripts/security/entrypoint-authz-audit.mjs').split('{ re: /requireStudioToken\\s*\\(/').length - 1).toBe(2)
    expect(read('scripts/guards/machine-callers-reachable.mjs')).toContain("'src/app/api/studio/uploads/route.ts':")
    expect(read('scripts/ops/mint-studio-upload-token.mjs')).toContain("const add = run('vercel', ['env', 'add', VAR, SCOPE, '--sensitive', '--force', '--yes'], { input: value })")
  })
})
