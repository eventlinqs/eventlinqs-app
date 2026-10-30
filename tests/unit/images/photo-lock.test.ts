import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { lockIfSaved, lockPhotoToEvent, lockSavedEventPhotos, PHOTO_ALREADY_USED, photoLockedElsewhere } from '@/lib/images/photo-lock'

/*
 * AN EVENT'S PHOTO SET IS LOCKED TO IT AT UPLOAD (Lawal's 00:23 of 31 October 2026; the photo system's P8 and P9): a
 * photo already locked to another event is refused when it is added, in his words, never accepted and hidden later.
 * The database decides (photo_locked_elsewhere, photo_lock_for_event); this pins what the upload asks and says.
 */

const HASHES = { sha256: 'a'.repeat(64), dhash: '-4560432085932000617' }

function rpc(answer: (name: string) => { data: unknown; error: { code: string; message: string } | null }) {
  return { rpc: vi.fn(async (name: string) => answer(name)) }
}

describe('the lock an upload asks for', () => {
  it('asks whether the photo is locked to another event, for this event', async () => {
    const d = rpc(() => ({ data: true, error: null }))
    expect(await photoLockedElsewhere(HASHES, 'e1', d)).toBe(true)
    expect(d.rpc).toHaveBeenCalledWith('photo_locked_elsewhere', { p_sha256: HASHES.sha256, p_dhash: HASHES.dhash, p_event: 'e1' })
  })

  it('locks it to the event, cover or gallery alike', async () => {
    const d = rpc(() => ({ data: 'locked', error: null }))
    expect(await lockPhotoToEvent({ eventId: 'e1', hashes: HASHES, imageUrl: 'https://x/a.webp', role: 'gallery' }, d)).toEqual({ ok: true })
    expect(d.rpc).toHaveBeenCalledWith('photo_lock_for_event', {
      p_event: 'e1',
      p_sha256: HASHES.sha256,
      p_dhash: HASHES.dhash,
      p_image_url: 'https://x/a.webp',
      p_role: 'gallery',
    })
  })

  it("refuses one locked elsewhere in Lawal's words", async () => {
    const d = rpc(() => ({ data: null, error: { code: '23514', message: PHOTO_ALREADY_USED } }))
    expect(await lockPhotoToEvent({ eventId: 'e1', hashes: HASHES, imageUrl: 'https://x/a.webp', role: 'cover' }, d)).toEqual({ ok: false, error: PHOTO_ALREADY_USED })
    expect(PHOTO_ALREADY_USED).toBe('This photo is already used for another event. Please add a different one.')
  })

  it('any other fault is thrown, never read as a refusal', async () => {
    const d = rpc(() => ({ data: null, error: { code: '42883', message: 'function does not exist' } }))
    await expect(lockPhotoToEvent({ eventId: 'e1', hashes: HASHES, imageUrl: 'https://x/a.webp', role: 'cover' }, d)).rejects.toThrow('function does not exist')
  })
})

describe('the organiser media step, src/lib/upload.ts', () => {
  const SOURCE = readFileSync(join(process.cwd(), 'src/lib/upload.ts'), 'utf8')
  it('fingerprints the bytes the organiser chose, asks before it stores, and locks after', () => {
    const read = SOURCE.indexOf('await file.arrayBuffer()')
    const hashed = SOURCE.indexOf('photoHashes(')
    const asked = SOURCE.indexOf('photoLockedElsewhere(')
    const stored = SOURCE.indexOf('.upload(objectName')
    const locked = SOURCE.indexOf('lockIfSaved(')
    for (const at of [read, hashed, asked, stored, locked]) expect(at).toBeGreaterThan(-1)
    expect(read).toBeLessThan(hashed)
    expect(hashed).toBeLessThan(asked)
    expect(asked).toBeLessThan(stored)
    expect(stored).toBeLessThan(locked)
  })

  it('a public submission asks whether its photo is used for any event before it stores it', () => {
    const sub = readFileSync(join(process.cwd(), 'src/lib/listings/submission-store.ts'), 'utf8')
    const hashed = sub.indexOf('photoHashes(')
    const asked = sub.indexOf('photoLockedElsewhere(hashes, null')
    const stored = sub.indexOf('.upload(path')
    for (const at of [hashed, asked, stored]) expect(at).toBeGreaterThan(-1)
    expect(hashed).toBeLessThan(asked)
    expect(asked).toBeLessThan(stored)
    expect(sub).toContain("return { state: 'refused', reason: PHOTO_ALREADY_USED }")
  })

  it('a walk-in listing refuses a photo used elsewhere before storing it, and locks the set only once it is written', () => {
    const draft = readFileSync(join(process.cwd(), 'src/lib/walk-in/list-draft.ts'), 'utf8')
    const asked = draft.indexOf('photoLockedElsewhere(hashes, eventId, lockRpc)')
    const stored = draft.indexOf('.upload(name, processed.image.buffer')
    const published = draft.indexOf("publishUnlisted(client, plan, organisationId, eventId, 'draft')")
    const locked = draft.indexOf('lockPhotoToEvent({ eventId, hashes: p.hashes')
    for (const at of [asked, stored, published, locked]) expect(at).toBeGreaterThan(-1)
    expect(asked).toBeLessThan(stored)
    expect(published).toBeLessThan(locked)
  })

  it('takes the stored file back out when the lock refuses', () => {
    const tail = SOURCE.slice(SOURCE.indexOf('lockIfSaved('))
    expect(tail.slice(0, 600)).toMatch(/\.remove\(\[objectName\]\)/)
  })
})

/*
 * A NEW EVENT's FIRST COVER (WINDOW 5's 06:20 on car 18's preview: every first cover in the create wizard answered
 * 'refused: no such event', so no organiser could publish). The wizard uploads before the event row exists: the door
 * still refuses a photo locked elsewhere, the lock waits, and the photos are locked the moment the event is saved.
 */
describe('a photo added before its event is saved', () => {
  it('is not locked at upload while the event has no row yet, and is locked as before once it has one', async () => {
    const d = rpc(() => ({ data: 'locked', error: null }))
    expect(await lockIfSaved({ eventId: 'new', saved: false, hashes: HASHES, imageUrl: 'https://x/a.webp', role: 'cover' }, d)).toEqual({ ok: true })
    expect(d.rpc).not.toHaveBeenCalled()
    expect(await lockIfSaved({ eventId: 'e1', saved: true, hashes: HASHES, imageUrl: 'https://x/a.webp', role: 'cover' }, d)).toEqual({ ok: true })
    expect(d.rpc).toHaveBeenCalledWith('photo_lock_for_event', expect.objectContaining({ p_event: 'e1', p_role: 'cover' }))
  })

  it('locks the saved event\'s cover and gallery from their own bytes, and reports one it could not lock without throwing', async () => {
    const d = rpc(() => ({ data: 'locked', error: null }))
    const hashesOf = vi.fn(async (url: string) => {
      if (url.endsWith('gone.webp')) throw new Error('HTTP 404')
      return HASHES
    })
    const result = await lockSavedEventPhotos(
      { eventId: 'e1', photos: [{ url: 'https://x/cover.webp', role: 'cover' }, { url: 'https://x/g1.webp', role: 'gallery' }, { url: 'https://x/gone.webp', role: 'gallery' }] },
      { ...d, hashesOf },
    )
    expect(d.rpc).toHaveBeenCalledTimes(2)
    expect(d.rpc).toHaveBeenCalledWith('photo_lock_for_event', expect.objectContaining({ p_event: 'e1', p_image_url: 'https://x/cover.webp', p_role: 'cover' }))
    expect(d.rpc).toHaveBeenCalledWith('photo_lock_for_event', expect.objectContaining({ p_event: 'e1', p_image_url: 'https://x/g1.webp', p_role: 'gallery' }))
    expect(result).toEqual({ locked: 2, notLocked: ['https://x/gone.webp: HTTP 404'] })
  })
})

describe('the upload door, as written in src/lib/upload.ts', () => {
  it('asks whether the event is saved and locks only through lockIfSaved', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/upload.ts'), 'utf8')
    expect(src).toContain('lockIfSaved(')
    expect(src).not.toMatch(/await lockPhotoToEvent\(/)
  })

  it('the create action locks the new event\'s photos right after its row is written', () => {
    // A checkout with core.autocrlf writes CRLF (the gate's tree does), so the source is read as LF before matching.
    const src = readFileSync(join(process.cwd(), 'src/app/(dashboard)/dashboard/events/actions.ts'), 'utf8').replace(/\r\n/g, '\n')
    const insert = src.indexOf(".from('events')\n    .insert({")
    const lock = src.indexOf('lockSavedEventPhotos(')
    expect(insert).toBeGreaterThan(-1)
    expect(lock).toBeGreaterThan(insert)
  })
})
