/**
 * A DISCOVERY REEL AS A 9:16 VIDEO FILE (the release checklist's C5 and the project manager's note 2 of 28 October
 * 2026: "The Reel is built from those photos with motion and type ... Music must be added inside Instagram's app from
 * its licensed library; we never embed a copyrighted track"). Joins a piece's own story frames, as the planner and
 * the slide renderer drew them, into one MP4: each frame held, then slid out to the left by the next, as a story is
 * swiped (a crossfade, tried first, laid one slide's type over the next), no audio.
 *
 *   node scripts/ops/reel-video.mjs <out.mp4> <frame1.jpg> <frame2.jpg> ... [--hold=2.6] [--fade=0.4]
 *
 * Needs ffmpeg on the PATH (this machine: ffmpeg 9.0.2). It writes one local file and touches nothing else. It is a
 * local tool: the production server has no ffmpeg, so the reel is not yet made inside /admin/social.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'

const args = process.argv.slice(2)
const flag = (name, fallback) => Number(args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback)
const [out, ...frames] = args.filter((a) => !a.startsWith('--'))
const hold = flag('hold', 2.6)
const fade = flag('fade', 0.4)
if (!out || frames.length < 2) {
  console.error('usage: node scripts/ops/reel-video.mjs <out.mp4> <frame1.jpg> <frame2.jpg> ... [--hold=2.6] [--fade=0.4]')
  process.exit(2)
}
for (const f of frames) if (!existsSync(f)) throw new Error(`no frame at ${f}`)

const seconds = frames.length * hold - (frames.length - 1) * fade
if (seconds < 15 || seconds > 30) console.warn(`[reel] ${seconds.toFixed(1)} s, outside the 15 to 30 s the checklist asks; change --hold`)

/* Each frame a still clip of its hold, scaled to exactly 1080 x 1920; then a chain of slides, one per join. */
const inputs = frames.flatMap((f) => ['-loop', '1', '-t', String(hold), '-i', f])
const scaled = frames.map((_, i) => `[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[s${i}]`)
const fades = []
let last = 's0'
for (let i = 1; i < frames.length; i++) {
  const offset = (i * (hold - fade)).toFixed(2)
  const label = i === frames.length - 1 ? 'out' : `x${i}`
  fades.push(`[${last}][s${i}]xfade=transition=slideleft:duration=${fade}:offset=${offset}[${label}]`)
  last = label
}
const run = spawnSync('ffmpeg', ['-y', ...inputs, '-filter_complex', [...scaled, ...fades].join(';'), '-map', '[out]', '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', '-an', out], { encoding: 'utf8' })
if (run.status !== 0) {
  console.error(run.stderr.split('\n').slice(-8).join('\n'))
  process.exit(1)
}
const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,codec_name:format=duration', '-of', 'json', out], { encoding: 'utf8' })
console.log(`[reel] ${out}: ${(statSync(out).size / 1e6).toFixed(1)} MB, ${frames.length} frames, ${seconds.toFixed(1)} s planned`)
console.log(probe.stdout.trim())
