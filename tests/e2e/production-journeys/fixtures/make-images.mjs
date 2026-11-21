// The upload journeys' photographs, made fresh by sharp: test cards with a thick gold border and a label in each corner, so
// a false crop shows at a glance (a missing corner is a cropped picture), in every format and shape an organiser brings.
// EventLinqs' own drawings for its own unlisted test nights; no event's photograph.
//   node tests/e2e/production-journeys/fixtures/make-images.mjs [outDir]
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = process.argv[2] ?? 'test-results/journey-images'
// Every image carries this run's stamp, so no two runs make the same bytes: the platform refuses a photograph already
// used on another event (src/lib/images/photo-lock.ts). Two sets, one for the photo link (f1) and one for the wizard (b).
const STAMP = new Date().toISOString().slice(0, 19).replace('T', ' ')
let OUT = ROOT
let SET = ''

function card(w, h, label, bg) {
  const b = Math.round(Math.min(w, h) * 0.04)
  const fs = Math.round(Math.min(w, h) * 0.06)
  const corner = (x, y, anchor, text) =>
    `<text x="${x}" y="${y}" font-family="Arial" font-size="${fs}" font-weight="700" fill="#0A1628" text-anchor="${anchor}">${text}</text>`
  const pad = b + fs * 0.4
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="#D4A017"/>
  <rect x="${b}" y="${b}" width="${w - 2 * b}" height="${h - 2 * b}" fill="${bg}"/>
  <rect x="${b}" y="${b}" width="${w - 2 * b}" height="${h - 2 * b}" fill="none" stroke="#ffffff" stroke-width="${Math.max(2, b / 4)}"/>
  <rect x="${pad - fs * 0.2}" y="${pad - fs * 0.1}" width="${fs * 3.2}" height="${fs * 1.3}" fill="#ffffff"/>
  ${corner(pad, pad + fs, 'start', 'TOP L')}
  <rect x="${w - pad - fs * 3}" y="${pad - fs * 0.1}" width="${fs * 3.2}" height="${fs * 1.3}" fill="#ffffff"/>
  ${corner(w - pad, pad + fs, 'end', 'TOP R')}
  <rect x="${pad - fs * 0.2}" y="${h - pad - fs * 1.2}" width="${fs * 3.2}" height="${fs * 1.3}" fill="#ffffff"/>
  ${corner(pad, h - pad, 'start', 'BOT L')}
  <rect x="${w - pad - fs * 3}" y="${h - pad - fs * 1.2}" width="${fs * 3.2}" height="${fs * 1.3}" fill="#ffffff"/>
  ${corner(w - pad, h - pad, 'end', 'BOT R')}
  <text x="${w / 2}" y="${h / 2}" font-family="Arial" font-size="${fs * 1.4}" font-weight="700" fill="#ffffff" text-anchor="middle">${label}</text>
  <text x="${w / 2}" y="${h / 2 + fs * 1.6}" font-family="Arial" font-size="${fs * 0.8}" fill="#ffffff" text-anchor="middle">${w} x ${h}</text>
  <text x="${w / 2}" y="${h / 2 + fs * 2.8}" font-family="Arial" font-size="${fs * 0.55}" fill="#ffffff" text-anchor="middle">QA ${SET} ${STAMP} ${Math.random().toString(36).slice(2, 8)}</text>
</svg>`)
}

let made = []
async function make(name, w, h, label, bg, fmt, opts = {}) {
  const file = path.join(OUT, name)
  let img = sharp(card(w, h, label, bg))
  if (opts.noise) {
    // A phone photograph's weight: fine noise over the card does not compress, so the file is truly large.
    const noise = Buffer.alloc(w * h * 3)
    for (let i = 0; i < noise.length; i += 1) noise[i] = Math.floor(Math.random() * 112)
    const grain = await sharp(noise, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer()
    img = sharp(await img.png().toBuffer()).composite([{ input: grain, blend: 'overlay' }])
  }
  if (fmt === 'jpeg') img = img.jpeg({ quality: opts.quality ?? 90 })
  if (fmt === 'png') img = img.png()
  if (fmt === 'webp') img = img.webp({ quality: 88 })
  if (fmt === 'avif') img = img.avif({ quality: 60 })
  await img.toFile(file)
  made.push({ name, file: file.replace(/\\/g, '/'), w, h, fmt, bytes: statSync(file).size })
}

for (const set of ['f1', 'b']) {
  SET = set
  OUT = path.join(ROOT, set)
  mkdirSync(OUT, { recursive: true })
  made = []
  await make('landscape.jpg', 1600, 1000, 'LANDSCAPE JPG', '#1d3557', 'jpeg')
  await make('portrait.png', 1080, 1350, 'PORTRAIT PNG', '#2a6f4e', 'png')
  await make('square.webp', 1200, 1200, 'SQUARE WEBP', '#6b2d5c', 'webp')
  await make('wide.avif', 1600, 900, 'WIDE AVIF', '#7a3b0c', 'avif')
  // Aria's two photographs that the photo page refused on 19 November 2026 were 973 and 916 pixels wide.
  await make('aria-973.jpg', 973, 1297, 'NARROW 973', '#1b4965', 'jpeg')
  await make('aria-916.jpg', 916, 1221, 'NARROW 916', '#3d405b', 'jpeg')
  // A phone photograph, 12 megapixels, over 8 MB.
  await make('phone-8mb.jpg', 4032, 3024, 'PHONE 12MP', '#264653', 'jpeg', { noise: true, quality: 97 })

  const big = made.find((m) => m.name === 'phone-8mb.jpg')
  if (big.bytes < 8 * 1024 * 1024) throw new Error(`the phone photograph is ${(big.bytes / 1048576).toFixed(2)} MB, not over 8 MB`)
  writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(made, null, 2))
  console.log(`${set}:`)
  console.log(made.map((m) => `  ${m.name} ${m.w}x${m.h} ${(m.bytes / 1048576).toFixed(2)} MB`).join(String.fromCharCode(10)))
}
