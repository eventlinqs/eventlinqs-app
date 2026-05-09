// Batch 9.2.1 - one composite at 1440 viewport.
//
// Authenticated avatar (9.2.1) vs anonymous baseline (9.2 home capture).
// Demonstrates the avatar shell + dropdown trigger rendering correctly
// in the State A header chrome.
import sharp from 'sharp'
import { existsSync, mkdirSync, statSync } from 'node:fs'

const OUT = 'docs/redesign/batch-9-2-1-evidence/composites'
const ANON = 'docs/redesign/batch-9-2-evidence/screenshots/after/home-1440-top.png'
const AUTH = 'docs/redesign/batch-9-2-1-evidence/screenshots/after/home-authenticated-1440-top.png'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const CELL_W = 720
const HEADER_H = 36

function labelSvg(text, w) {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${HEADER_H}">
       <rect width="${w}" height="${HEADER_H}" fill="#0A1628"/>
       <text x="12" y="22" font-family="Inter, sans-serif" font-size="14" font-weight="700"
             fill="#E8B738">${escaped}</text>
     </svg>`
  )
}

async function loadCell(path) {
  const buf = await sharp(path).resize({ width: CELL_W, withoutEnlargement: true }).png().toBuffer()
  const meta = await sharp(buf).metadata()
  return { buf, w: meta.width ?? CELL_W, h: meta.height ?? 0 }
}

const left  = await loadCell(ANON)
const right = await loadCell(AUTH)
const rowH = Math.max(left.h, right.h)
const totalW = CELL_W * 2
const totalH = HEADER_H + rowH

const composite = await sharp({
  create: { width: totalW, height: totalH, channels: 4, background: { r: 250, g: 250, b: 247, alpha: 1 } },
}).composite([
  { input: await sharp(labelSvg('9.2 BEFORE - anonymous (Sign in / Get Started)', CELL_W)).png().toBuffer(), top: 0, left: 0 },
  { input: left.buf,  top: HEADER_H, left: 0 },
  { input: await sharp(labelSvg('9.2.1 AFTER - authenticated (avatar shell)', CELL_W)).png().toBuffer(), top: 0, left: CELL_W },
  { input: right.buf, top: HEADER_H, left: CELL_W },
]).png().toBuffer()

const outPath = `${OUT}/home-authenticated-vs-anonymous-1440.png`
await sharp(composite).toFile(outPath)
console.log(`composite ${outPath}  ${(statSync(outPath).size / 1024).toFixed(1)}KB`)
