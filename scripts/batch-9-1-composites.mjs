// Batch 9.1 - Side-by-side composites for visual regression report.
//
// Each composite is a 2×2 grid at 1440 viewport:
//   ┌──────────────────────────┬──────────────────────────┐
//   │ BEFORE - top of page     │ BEFORE - scrolled 600px  │
//   ├──────────────────────────┼──────────────────────────┤
//   │ AFTER  - top of page     │ AFTER  - scrolled 600px  │
//   └──────────────────────────┴──────────────────────────┘
//
// Each input cell is downscaled to 720px wide (50% of 1440) to keep the
// composite under ~2.5MB while remaining legible.
// Output: docs/redesign/batch-9-1-evidence/composites/{slug}-1440.png
import sharp from 'sharp'
import { existsSync, mkdirSync, statSync } from 'node:fs'

const IN  = 'docs/redesign/batch-9-1-evidence/screenshots'
const OUT = 'docs/redesign/batch-9-1-evidence/composites'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const PAGES = [
  { slug: 'home',            id: 'home' },
  { slug: 'culture-african', id: 'culture-african' },
  { slug: 'city-sydney',     id: 'city-sydney' },
  { slug: 'legal-terms',     id: 'legal-terms' },
]

const CELL_W = 720
const HEADER_H = 36
const LABEL = {
  bt: 'BEFORE - top',
  bs: 'BEFORE - scrolled',
  at: 'AFTER - top',
  as: 'AFTER - scrolled',
}

async function loadCell(path) {
  // Resize to 720 wide preserving aspect, fit on white.
  const buf = await sharp(path)
    .resize({ width: CELL_W, withoutEnlargement: true })
    .png()
    .toBuffer()
  const meta = await sharp(buf).metadata()
  return { buf, w: meta.width ?? CELL_W, h: meta.height ?? 0 }
}

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

for (const page of PAGES) {
  const paths = {
    bt: `${IN}/before/${page.id}-1440-top.png`,
    bs: `${IN}/before/${page.id}-1440-scrolled.png`,
    at: `${IN}/after/${page.id}-1440-top.png`,
    as: `${IN}/after/${page.id}-1440-scrolled.png`,
  }
  for (const k of Object.keys(paths)) {
    if (!existsSync(paths[k])) {
      console.log(`SKIP ${page.slug}: missing ${paths[k]}`)
      continue
    }
  }

  const cells = {}
  for (const k of Object.keys(paths)) {
    cells[k] = await loadCell(paths[k])
  }

  const colW = CELL_W
  const rowH = Math.max(cells.bt.h, cells.bs.h, cells.at.h, cells.as.h)
  const totalW = colW * 2
  const totalH = (HEADER_H + rowH) * 2

  const cellLabel = async (text) => sharp(labelSvg(text, colW)).png().toBuffer()

  const composite = await sharp({
    create: {
      width: totalW,
      height: totalH,
      channels: 4,
      background: { r: 250, g: 250, b: 247, alpha: 1 },
    },
  })
    .composite([
      // row 1 - BEFORE
      { input: await cellLabel(LABEL.bt), top: 0, left: 0 },
      { input: cells.bt.buf,              top: HEADER_H, left: 0 },
      { input: await cellLabel(LABEL.bs), top: 0, left: colW },
      { input: cells.bs.buf,              top: HEADER_H, left: colW },
      // row 2 - AFTER
      { input: await cellLabel(LABEL.at), top: HEADER_H + rowH, left: 0 },
      { input: cells.at.buf,              top: HEADER_H + rowH + HEADER_H, left: 0 },
      { input: await cellLabel(LABEL.as), top: HEADER_H + rowH, left: colW },
      { input: cells.as.buf,              top: HEADER_H + rowH + HEADER_H, left: colW },
    ])
    .png()
    .toBuffer()

  const outPath = `${OUT}/${page.slug}-1440.png`
  await sharp(composite).toFile(outPath)
  const size = statSync(outPath).size
  console.log(`composite ${outPath}  ${(size / 1024).toFixed(1)}KB`)
}
