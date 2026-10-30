import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { lockPhotoToEvent, PHOTO_ALREADY_USED, photoLockedElsewhere } from '@/lib/images/photo-lock'

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
    const locked = SOURCE.indexOf('lockPhotoToEvent(')
    for (const at of [read, hashed, asked, stored, locked]) expect(at).toBeGreaterThan(-1)
    expect(read).toBeLessThan(hashed)
    expect(hashed).toBeLessThan(asked)
    expect(asked).toBeLessThan(stored)
    expect(stored).toBeLessThan(locked)
  })

  it('takes the stored file back out when the lock refuses', () => {
    const tail = SOURCE.slice(SOURCE.indexOf('lockPhotoToEvent('))
    expect(tail.slice(0, 600)).toMatch(/\.remove\(\[objectName\]\)/)
  })
})
