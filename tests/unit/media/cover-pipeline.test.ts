import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import React from 'react'

import { sniffImageType } from '../../../src/lib/media/fetch-image'

/**
 * THE COVER PIPELINE MUST WORK TWICE.
 *
 * On 28 August 2026 the cover composer and every event's share card failed with
 * sharp's "Input buffer contains unsupported image format", and the shape of the
 * failure was the tell: it worked once in a server process and then failed for
 * the life of that process. An organiser with no artwork could not publish at
 * all, and every share preview on the platform was dead, which is the one
 * artefact whose whole job is to be seen.
 *
 * Two things are pinned here.
 *
 * 1. THE SECOND RENDER MUST MATCH THE FIRST IN KIND. A single render proves
 *    nothing about this class: the first one always worked. Anything held at
 *    module scope and consumed on first use - a response body, a font buffer, a
 *    decoded image - passes a one-render test and fails in production on the
 *    second request.
 *
 * 2. BYTES ARE SNIFFED, NOT TRUSTED. The share card used to hand satori a URL
 *    and let it fetch: one error body arriving labelled image/jpeg took the
 *    whole response down with "failed to pipe response", and the route's own
 *    documented no-cover fallback never got the chance to draw. A content-type
 *    header can lie. The first bytes cannot.
 */

const ROOT = join(__dirname, '..', '..', '..')
const JPEG = readFileSync(join(ROOT, 'public', 'images', 'hero', 'afrobeats.jpg'))

const isPng = (b: Buffer | Uint8Array) =>
  b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47

describe('what the bytes actually are', () => {
  test('recognises the formats the card renderer can draw', () => {
    expect(sniffImageType(JPEG)).toBe('image/jpeg')
    expect(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13]))).toBe('image/png')
    expect(sniffImageType(Buffer.from('GIF89a' + 'x'.repeat(8)))).toBe('image/gif')
    const webp = Buffer.alloc(16)
    Buffer.from('RIFF').copy(webp, 0)
    Buffer.from('WEBP').copy(webp, 8)
    expect(sniffImageType(webp)).toBe('image/webp')
  })

  test('refuses anything it cannot draw, however it is labelled', () => {
    // An HTML error page from an object store, which is what actually arrives
    // when a signed URL has expired.
    expect(sniffImageType(Buffer.from('<!doctype html><html><body>Not found'))).toBeNull()
    expect(sniffImageType(Buffer.from('{"error":"Object not found"}'))).toBeNull()
    // Truncated: too short for any magic number to be readable.
    expect(sniffImageType(JPEG.subarray(0, 4))).toBeNull()
    // AVIF is a real image this renderer cannot draw. Treating it as "no cover"
    // gives the reader a designed card rather than a dead one.
    const avif = Buffer.alloc(16)
    Buffer.from('ftypavif').copy(avif, 4)
    expect(sniffImageType(avif)).toBeNull()
  })
})

describe('the renderer survives being used twice in one process', () => {
  test('two renders in a row produce the same kind of image', async () => {
    const { ImageResponse } = await import('next/og')

    const fontDir = join(ROOT, 'src', 'assets', 'fonts')
    const fonts = (
      [
        ['Archivo-Bold.ttf', 'Archivo', 700],
        ['HankenGrotesk-Medium.ttf', 'Hanken Grotesk', 500],
      ] as const
    ).map(([file, name, weight]) => {
      const buf = readFileSync(join(fontDir, file))
      return {
        name,
        data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
        weight: weight as 500 | 700,
        style: 'normal' as const,
      }
    })

    // A cover embedded as a data URI, exactly as the share card now does it.
    const cover = `data:image/jpeg;base64,${JPEG.toString('base64')}`
    const element = React.createElement(
      'div',
      { style: { display: 'flex', width: '100%', height: '100%', background: '#0A1628' } },
      React.createElement('img', {
        src: cover,
        width: 600,
        height: 315,
        style: { width: '100%', height: '100%', objectFit: 'cover' },
      }),
      React.createElement(
        'div',
        { style: { display: 'flex', position: 'absolute', bottom: 24, left: 24, color: '#fff', fontSize: 32, fontFamily: 'Archivo' } },
        'EventLinqs',
      ),
    )

    const render = async () => {
      const res = new ImageResponse(element, { width: 600, height: 315, fonts })
      return Buffer.from(await res.arrayBuffer())
    }

    const first = await render()
    const second = await render()

    expect(isPng(first), 'the FIRST render is not a PNG').toBe(true)
    expect(isPng(second), 'the SECOND render is not a PNG: something was consumed on first use').toBe(true)

    // "In kind" rather than byte-identical: the encoder is free to differ, but a
    // second render collapsing to a fraction of the first is the signature of a
    // font or an image having been dropped.
    const ratio = second.byteLength / first.byteLength
    expect(
      ratio > 0.5 && ratio < 2,
      `the second render is ${second.byteLength}b against the first at ${first.byteLength}b`,
    ).toBe(true)
  }, 60000)
})
