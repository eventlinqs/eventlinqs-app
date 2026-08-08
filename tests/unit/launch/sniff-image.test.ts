import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { sniffImage } from '@/lib/launch/sniff-image'

/**
 * The first security control an untrusted upload meets on the anonymous
 * endpoint. Every accept case is built from REAL encoded bytes so the test
 * exercises what a browser would actually send, not a hand-written header that
 * happens to match the implementation.
 */

async function encoded(format: 'jpeg' | 'png' | 'webp' | 'avif') {
  const base = sharp({
    create: { width: 32, height: 32, channels: 3, background: { r: 10, g: 22, b: 40 } },
  })
  if (format === 'jpeg') return base.jpeg().toBuffer()
  if (format === 'png') return base.png().toBuffer()
  if (format === 'webp') return base.webp().toBuffer()
  return base.avif().toBuffer()
}

describe('sniffImage accepts the real formats a phone produces', () => {
  it('identifies a real JPEG', async () => {
    expect(sniffImage(await encoded('jpeg'))).toBe('jpeg')
  })

  it('identifies a real PNG', async () => {
    expect(sniffImage(await encoded('png'))).toBe('png')
  })

  it('identifies a real WebP', async () => {
    expect(sniffImage(await encoded('webp'))).toBe('webp')
  })

  it('identifies a real AVIF', async () => {
    expect(sniffImage(await encoded('avif'))).toBe('avif')
  })

  it('identifies an iPhone HEIC container by its brand', () => {
    // An ISO base media header with the heic brand. Built by hand because sharp
    // cannot ENCODE heic (patent-encumbered) even though libheif decodes it.
    const heic = Buffer.alloc(32)
    heic.write('ftyp', 4, 'latin1')
    heic.write('heic', 8, 'latin1')
    expect(sniffImage(heic)).toBe('heic')
  })
})

describe('sniffImage refuses what must never be hosted', () => {
  it('refuses SVG, which is XML and executes in a browser', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    expect(sniffImage(svg)).toBeNull()
  })

  it('refuses SVG with an XML declaration in front of it', () => {
    const svg = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>')
    expect(sniffImage(svg)).toBeNull()
  })

  it('refuses HTML', () => {
    expect(sniffImage(Buffer.from('<!doctype html><html><body>hello</body></html>'))).toBeNull()
  })

  it('refuses a Windows executable', () => {
    const exe = Buffer.alloc(64)
    exe.write('MZ', 0, 'latin1')
    expect(sniffImage(exe)).toBeNull()
  })

  it('refuses plain text and empty input', () => {
    expect(sniffImage(Buffer.from('this is not an image at all'))).toBeNull()
    expect(sniffImage(Buffer.alloc(0))).toBeNull()
    expect(sniffImage(Buffer.alloc(4))).toBeNull()
  })

  it('refuses a RIFF container that is not WebP, such as a WAV', () => {
    // RIFF alone is also WAV and AVI, so both halves of the signature matter.
    const wav = Buffer.alloc(32)
    wav.write('RIFF', 0, 'latin1')
    wav.write('WAVE', 8, 'latin1')
    expect(sniffImage(wav)).toBeNull()
  })

  it('refuses an ISO container whose brand is a video, not an image', () => {
    const mp4 = Buffer.alloc(32)
    mp4.write('ftyp', 4, 'latin1')
    mp4.write('isom', 8, 'latin1')
    expect(sniffImage(mp4)).toBeNull()
  })

  it('is not fooled by an image extension or a declared type: it reads bytes', () => {
    // The exact attack the sniffer exists to stop: a script named cover.jpg and
    // sent as image/jpeg. Nothing about the request is consulted, only content.
    const disguised = Buffer.from('<svg onload="fetch(`/steal`)"></svg>')
    expect(sniffImage(disguised)).toBeNull()
  })
})
