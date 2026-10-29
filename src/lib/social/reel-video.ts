import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'

/**
 * THE DISCOVERY REEL AS AN MP4, MADE ON THE SERVER (the register's row C5; Lawal's master mandate, section 7,
 * "Discovery Reel": "A video existing only on a developer laptop is not production completion").
 *
 * Wednesday's Discovery Reel is planned as 9:16 frames (src/lib/social/campaign.ts, 'discovery_reel'): a contents
 * cover, then one frame per night. Each frame is drawn by the same renderer and the same register check as its
 * download (src/app/admin/(authed)/social/piece/[pieceId]/[n]), and this module joins them into one H.264 MP4 at
 * Instagram's Reel size, each frame held and then crossfaded into the next. Nothing is generated: every pixel is a
 * frame the founder can already see on /admin/social (Law 6, render never generate).
 *
 * The encoder is ffmpeg, from the ffmpeg-static package (a static build for the platform it is installed on: Linux on
 * Vercel), run as a child process with its own arguments, never a shell, and the frames written to a fresh temporary
 * folder that is removed whatever happens. reelArguments is pure and tested exhaustively; encodeReel only runs it.
 */

export const REEL = {
  width: 1080,
  height: 1920,
  fps: 30,
  /** Seconds each frame is held still before the next fades in: long enough to read a night's title, date and place. */
  hold: 2.6,
  /** Seconds of each crossfade. */
  fade: 0.4,
  /** The most frames a Reel carries: the cover and five nights (campaign.ts MAX_NIGHTS is five). */
  maxFrames: 6,
  /** The encode is stopped after this long; a Reel of six frames takes a few seconds. */
  timeoutMs: 50_000,
} as const

/** How long the finished Reel runs, in seconds: every frame's hold, then the last fade's tail. */
export function reelSeconds(frames: number): number {
  if (frames < 1) return 0
  return Number((frames * REEL.hold + REEL.fade).toFixed(2))
}

/**
 * The ffmpeg arguments that join `frames` still images into the Reel at `out`. Each input is looped for its hold plus
 * the fade; each xfade starts where the previous frame's hold ends, so every frame is fully visible for REEL.hold
 * seconds. One frame is simply held. The output is H.264, yuv420p (the pixel format every phone plays), at the Reel's
 * exact size and frame rate, with its index at the front so a phone starts playing before the file has arrived.
 */
export function reelArguments(frames: readonly string[], out: string): string[] {
  if (frames.length === 0) throw new Error('a Reel needs at least one frame')
  if (frames.length > REEL.maxFrames) throw new Error(`a Reel carries at most ${REEL.maxFrames} frames, not ${frames.length}`)
  const clip = (REEL.hold + REEL.fade).toFixed(2)
  const inputs = frames.flatMap((f) => ['-loop', '1', '-framerate', String(REEL.fps), '-t', clip, '-i', f])
  const size = `scale=${REEL.width}:${REEL.height}:force_original_aspect_ratio=decrease,pad=${REEL.width}:${REEL.height}:(ow-iw)/2:(oh-ih)/2:color=0x0A1628,setsar=1,fps=${REEL.fps},format=yuv420p`
  const parts = frames.map((_, i) => `[${i}:v]${size}[f${i}]`)
  let last = 'f0'
  for (let i = 1; i < frames.length; i++) {
    const next = i === frames.length - 1 ? 'v' : `x${i}`
    parts.push(`[${last}][f${i}]xfade=transition=fade:duration=${REEL.fade}:offset=${(i * REEL.hold).toFixed(2)}[${next}]`)
    last = next
  }
  if (frames.length === 1) parts.push('[f0]null[v]')
  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    ...inputs,
    '-filter_complex', parts.join(';'),
    '-map', '[v]',
    '-t', reelSeconds(frames.length).toFixed(2),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-profile:v', 'high',
    '-pix_fmt', 'yuv420p', '-r', String(REEL.fps),
    '-movflags', '+faststart',
    '-an',
    out,
  ]
}

/** Joins the frames (JPEG or PNG bytes, in order) into the Reel's MP4 bytes. Throws with ffmpeg's own words on failure. */
export async function encodeReel(frames: readonly Uint8Array[]): Promise<Uint8Array> {
  if (!ffmpegPath) throw new Error('ffmpeg-static has no binary for this platform')
  const dir = await mkdtemp(join(tmpdir(), 'el-reel-'))
  try {
    const files: string[] = []
    for (const [i, bytes] of frames.entries()) {
      const file = join(dir, `frame-${String(i + 1).padStart(2, '0')}.jpg`)
      await writeFile(file, bytes)
      files.push(file)
    }
    const out = join(dir, 'reel.mp4')
    await run(ffmpegPath, reelArguments(files, out))
    return new Uint8Array(await readFile(out))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function run(binary: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
    let said = ''
    child.stderr.on('data', (chunk: Buffer) => {
      said = (said + chunk.toString()).slice(-2000)
    })
    const timer = setTimeout(() => child.kill('SIGKILL'), REEL.timeoutMs)
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg ended with ${signal ?? `code ${code}`}: ${said.trim() || 'it said nothing'}`))
    })
  })
}
