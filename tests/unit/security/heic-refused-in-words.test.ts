import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HEIC_REFUSAL, isUndecodableHeif } from '@/lib/media/heic'
import { IMAGE_ACCEPT_ATTR } from '@/lib/media/limits'

/**
 * AN iPHONE HEIC IS REFUSED IN WORDS, BEFORE ANY DECODE (WINDOW 5C, 21 November 2026). The installed sharp reads a HEIC's
 * header ('heif', 'hevc') and cannot decode its pixels ('Support for this compression format has not been built in:
 * HEVC', probed on libheif's own example file); the encode sat outside the pipeline's try, so an organiser met an
 * unhandled error. HEIC cannot be ENCODED here either, so, as the dependency law says for a format no local encoder makes,
 * the decision is pinned in a pure function and tested exhaustively, and every path that decodes a person's photograph is
 * read to ask it before its encode.
 */
describe('which HEIF this platform can decode', () => {
  const cases: Array<[string | undefined, string | undefined, boolean]> = [
    ['heif', 'hevc', true], // an iPhone HEIC
    ['heif', undefined, true], // a HEIF whose codec sharp does not name: not decodable here, refused in words
    ['heif', 'av1', false], // AVIF, as sharp 0.35 reports it: decoded and kept
    ['jpeg', undefined, false],
    ['png', undefined, false],
    ['webp', undefined, false],
    [undefined, undefined, false],
  ]
  for (const [format, compression, refused] of cases) {
    it(`${format ?? 'unknown'} + ${compression ?? 'no codec'} is ${refused ? 'refused' : 'decoded'}`, () => {
      expect(isUndecodableHeif(format, compression)).toBe(refused)
    })
  }

  it('the refusal tells the organiser what to do, in plain words with no dash', () => {
    expect(HEIC_REFUSAL).toMatch(/HEIC/)
    expect(HEIC_REFUSAL).toMatch(/JPEG/)
    expect(HEIC_REFUSAL).not.toMatch(/[–—]| - /)
  })
})

describe('no chooser offers HEIC, and no copy promises it', () => {
  it('the shared accept list leaves HEIC and HEIF out and keeps AVIF', () => {
    expect(IMAGE_ACCEPT_ATTR).not.toMatch(/heic|heif/i)
    expect(IMAGE_ACCEPT_ATTR.split(',')).toEqual(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
  })

  for (const file of [
    'src/components/features/events/event-media-step.tsx',
    'src/components/launch/kit-artefacts.tsx',
    'src/components/listings/organiser-media-forms.tsx',
    'src/components/listings/venue-media-forms.tsx',
    'src/app/api/launch/[code]/cover/route.ts',
  ]) {
    it(`${file} promises no HEIC`, () => {
      expect(readFileSync(file, 'utf8')).not.toMatch(/(AVIF|WebP),? or HEIC|and iPhone HEIC also/)
    })
  }
})

describe('every path that decodes a person photograph asks before it encodes', () => {
  for (const [file, encode] of [
    ['src/lib/media/image-pipeline.ts', 'decideOutputEncoding(format, meta.compression)'],
    ['src/lib/media/logo-pipeline.ts', '.png({ compressionLevel: 9 })'],
    ['src/app/api/launch/[code]/cover/route.ts', '.webp({ quality: 82 })'],
  ] as const) {
    it(`${file} refuses an undecodable HEIF before its encode`, () => {
      const src = readFileSync(file, 'utf8')
      const ask = src.indexOf('isUndecodableHeif(')
      expect(ask, `${file} never asks`).toBeGreaterThan(-1)
      expect(ask, `${file} asks after it encodes`).toBeLessThan(src.indexOf(encode))
      expect(src).toContain('HEIC_REFUSAL')
    })
  }

  it('the event pipeline answers an encode that throws in words, never as an unhandled error', () => {
    const src = readFileSync('src/lib/media/image-pipeline.ts', 'utf8')
    const encode = src.slice(src.indexOf('let out: { data: Buffer; info: OutputInfo }'), src.indexOf('const { contentType, ext } = encoding'))
    expect(encode).toMatch(/try \{/)
    expect(encode).toMatch(/catch \(error\) \{[\s\S]*return \{ ok: false, error: REJECT_NOT_IMAGE \}/)
  })
})
