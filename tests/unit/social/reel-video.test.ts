import { describe, expect, test } from 'vitest'
import sharp from 'sharp'
import { REEL, encodeReel, reelArguments, reelSeconds } from '@/lib/social/reel-video'

/*
 * THE DISCOVERY REEL, MADE ON THE SERVER (the register's row C5). The arguments are pure and judged exhaustively; then a
 * real encode through the installed ffmpeg-static binary, judged by reading the MP4's own boxes (its size, its codec,
 * its length), never by trusting that ffmpeg said nothing (CLAUDE.md, dependency bumps on a user-content path: assert
 * the output, not the call).
 */

const frameNames = (n: number) => Array.from({ length: n }, (_, i) => `f${i + 1}.jpg`)
const filterOf = (args: string[]) => args[args.indexOf('-filter_complex') + 1]

describe('reelArguments', () => {
  test('each frame is held for REEL.hold and fades into the next at the end of its hold', () => {
    const filter = filterOf(reelArguments(frameNames(4), 'out.mp4'))
    expect(filter).toContain(`[f0][f1]xfade=transition=fade:duration=${REEL.fade}:offset=${(1 * REEL.hold).toFixed(2)}[x1]`)
    expect(filter).toContain(`[x1][f2]xfade=transition=fade:duration=${REEL.fade}:offset=${(2 * REEL.hold).toFixed(2)}[x2]`)
    expect(filter).toContain(`[x2][f3]xfade=transition=fade:duration=${REEL.fade}:offset=${(3 * REEL.hold).toFixed(2)}[v]`)
  })

  test('every input is looped for its hold and its fade, and scaled and padded to the Reel size', () => {
    const args = reelArguments(frameNames(3), 'out.mp4')
    expect(args.filter((a) => a === '-loop')).toHaveLength(3)
    expect(args.filter((a) => a === (REEL.hold + REEL.fade).toFixed(2))).toHaveLength(3)
    expect(filterOf(args)).toContain(`scale=${REEL.width}:${REEL.height}:force_original_aspect_ratio=decrease,pad=${REEL.width}:${REEL.height}`)
  })

  test('one frame is held, with no crossfade', () => {
    const filter = filterOf(reelArguments(frameNames(1), 'out.mp4'))
    expect(filter).not.toContain('xfade')
    expect(filter).toContain('[f0]null[v]')
  })

  test('the output is H.264 in yuv420p at the Reel frame rate, index first, no audio, and runs the reel length', () => {
    const args = reelArguments(frameNames(6), 'out.mp4')
    expect(args.slice(args.indexOf('-c:v'), args.indexOf('-c:v') + 2)).toEqual(['-c:v', 'libx264'])
    expect(args).toContain('yuv420p')
    expect(args.slice(args.indexOf('-movflags'), args.indexOf('-movflags') + 2)).toEqual(['-movflags', '+faststart'])
    expect(args).toContain('-an')
    expect(args[args.indexOf('-t', args.indexOf('-map')) + 1]).toBe(reelSeconds(6).toFixed(2))
    expect(args.at(-1)).toBe('out.mp4')
  })

  test('no frames, or more than the cover, five nights and the close, is refused', () => {
    expect(() => reelArguments([], 'out.mp4')).toThrow(/at least one frame/)
    expect(() => reelArguments(frameNames(REEL.maxFrames + 1), 'out.mp4')).toThrow(/at most 7 frames/)
  })

  test('the reel length is every hold and the last fade', () => {
    expect(reelSeconds(0)).toBe(0)
    expect(reelSeconds(1)).toBe(3)
    expect(reelSeconds(6)).toBe(16)
    expect(REEL.maxFrames).toBe(7)
  })
})

/** Where an MP4 box's four-letter type first appears at or after `from`, or -1. */
const boxAt = (bytes: Uint8Array, type: string, from = 0) => Buffer.from(bytes).indexOf(type, from, 'latin1')

describe('encodeReel, through the real ffmpeg-static binary', () => {
  test('three story frames become one H.264 MP4 at 1080 x 1920 that runs the reel length', async () => {
    const frames = await Promise.all(
      ['#0A1628', '#E8B738', '#F7F5F0'].map((colour) =>
        sharp({ create: { width: REEL.width, height: REEL.height, channels: 3, background: colour } }).jpeg().toBuffer(),
      ),
    )
    const mp4 = await encodeReel(frames.map((b) => new Uint8Array(b)))
    const buf = Buffer.from(mp4)

    expect(buf.toString('latin1', 4, 8)).toBe('ftyp')
    // +faststart: the index (moov) sits before the picture data (mdat), so a phone plays before the file has arrived.
    expect(boxAt(mp4, 'moov')).toBeGreaterThan(-1)
    expect(boxAt(mp4, 'moov')).toBeLessThan(boxAt(mp4, 'mdat'))

    // The video sample entry: avc1 inside the sample descriptions (stsd), then 24 bytes, then width and height. Searched
    // from stsd, because the file's own header (ftyp) also names 'avc1' among its compatible brands.
    const avc1 = boxAt(mp4, 'avc1', boxAt(mp4, 'stsd'))
    expect(boxAt(mp4, 'stsd')).toBeGreaterThan(-1)
    expect(avc1).toBeGreaterThan(-1)
    expect(buf.readUInt16BE(avc1 + 4 + 24)).toBe(REEL.width)
    expect(buf.readUInt16BE(avc1 + 4 + 26)).toBe(REEL.height)

    // The movie header: version, flags, two times, then the timescale and the duration.
    const mvhd = boxAt(mp4, 'mvhd')
    const version = buf.readUInt8(mvhd + 4)
    const timescale = version === 1 ? buf.readUInt32BE(mvhd + 4 + 4 + 16) : buf.readUInt32BE(mvhd + 4 + 4 + 8)
    const duration = version === 1 ? Number(buf.readBigUInt64BE(mvhd + 4 + 4 + 16 + 4)) : buf.readUInt32BE(mvhd + 4 + 4 + 8 + 4)
    expect(duration / timescale).toBeCloseTo(reelSeconds(3), 1)
  }, 60_000)
})
