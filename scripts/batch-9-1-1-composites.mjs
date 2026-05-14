// Batch 9.1.1 - 4 side-by-side composites at 1440 viewport.
//
// 1. home-1440.png      : 9.1 BEFORE (top + scrolled) over 9.1.1 AFTER (top + scrolled)
// 2. cultures-1440.png  : NEW page (top + scrolled, AFTER only) - no BEFORE
// 3. cities-1440.png    : NEW page (top + scrolled, AFTER only) - no BEFORE
// 4. search-overlay-1440.png : 9.1 baseline (no highlight) vs 9.1.1 (with keyboard highlight)
import sharp from 'sharp'
import { existsSync, mkdirSync, statSync } from 'node:fs'

const OUT = 'docs/redesign/batch-9-1-1-evidence/composites'
const AFTER_911 = 'docs/redesign/batch-9-1-evidence/screenshots/after'
const AFTER_911_1 = 'docs/redesign/batch-9-1-1-evidence/screenshots/after'
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

async function buildComposite(name, cells) {
  const colW = CELL_W
  const rows = Math.ceil(cells.length / 2)
  const rowH = Math.max(...cells.map(c => c.cell.h))
  const totalW = colW * 2
  const totalH = (HEADER_H + rowH) * rows

  const ops = []
  for (let i = 0; i < cells.length; i++) {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = col * colW
    const yLabel = row * (HEADER_H + rowH)
    const yImage = yLabel + HEADER_H
    ops.push({ input: await sharp(labelSvg(cells[i].label, colW)).png().toBuffer(), top: yLabel, left: x })
    ops.push({ input: cells[i].cell.buf, top: yImage, left: x })
  }

  const composite = await sharp({
    create: {
      width: totalW,
      height: totalH,
      channels: 4,
      background: { r: 250, g: 250, b: 247, alpha: 1 },
    },
  }).composite(ops).png().toBuffer()

  const outPath = `${OUT}/${name}`
  await sharp(composite).toFile(outPath)
  console.log(`composite ${outPath}  ${(statSync(outPath).size / 1024).toFixed(1)}KB`)
}

// Composite 1: home before/after
{
  const beforeTop = await loadCell(`${AFTER_911}/home-1440-top.png`)
  const beforeScrolled = await loadCell(`${AFTER_911}/home-1440-scrolled.png`)
  const afterTop = await loadCell(`${AFTER_911_1}/home-1440-top.png`)
  const afterScrolled = await loadCell(`${AFTER_911_1}/home-1440-scrolled.png`)
  await buildComposite('home-1440.png', [
    { label: '9.1 BEFORE - top',     cell: beforeTop },
    { label: '9.1 BEFORE - scrolled', cell: beforeScrolled },
    { label: '9.1.1 AFTER - top',     cell: afterTop },
    { label: '9.1.1 AFTER - scrolled', cell: afterScrolled },
  ])
}

// Composite 2: cultures (NEW page, AFTER only)
{
  const top = await loadCell(`${AFTER_911_1}/cultures-1440-top.png`)
  const scrolled = await loadCell(`${AFTER_911_1}/cultures-1440-scrolled.png`)
  await buildComposite('cultures-1440.png', [
    { label: '9.1.1 NEW - top',     cell: top },
    { label: '9.1.1 NEW - scrolled', cell: scrolled },
  ])
}

// Composite 3: cities (NEW page, AFTER only)
{
  const top = await loadCell(`${AFTER_911_1}/cities-1440-top.png`)
  const scrolled = await loadCell(`${AFTER_911_1}/cities-1440-scrolled.png`)
  await buildComposite('cities-1440.png', [
    { label: '9.1.1 NEW - top',     cell: top },
    { label: '9.1.1 NEW - scrolled', cell: scrolled },
  ])
}

// Composite 4: search overlay before/after
{
  const before = await loadCell(`${AFTER_911_1}/search-overlay-1440-no-highlight.png`)
  const after  = await loadCell(`${AFTER_911_1}/search-overlay-1440-keyboard-highlight.png`)
  await buildComposite('search-overlay-1440.png', [
    { label: '9.1 BEFORE - no keyboard nav',         cell: before },
    { label: '9.1.1 AFTER - ArrowDown highlights',   cell: after },
  ])
}
