// Batch 9.2 - 3 side-by-side composites at 1440 viewport.
//
// 1. home-1440.png       : 9.1.1 BEFORE (top + scrolled) over 9.2 AFTER
// 2. cultures-1440.png   : 9.1.1 BEFORE chip vs 9.2 AFTER chip (chip-area zoom)
// 3. bright-hero-1440.png: 9.1.1 gradient BEFORE vs 9.2 gradient AFTER on /culture/african
import sharp from 'sharp'
import { existsSync, mkdirSync, statSync } from 'node:fs'

const OUT = 'docs/redesign/batch-9-2-evidence/composites'
const BEFORE_911 = 'docs/redesign/batch-9-1-1-evidence/screenshots/after'
const AFTER_92   = 'docs/redesign/batch-9-2-evidence/screenshots/after'
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
    create: { width: totalW, height: totalH, channels: 4, background: { r: 250, g: 250, b: 247, alpha: 1 } },
  }).composite(ops).png().toBuffer()
  const outPath = `${OUT}/${name}`
  await sharp(composite).toFile(outPath)
  console.log(`composite ${outPath}  ${(statSync(outPath).size / 1024).toFixed(1)}KB`)
}

// Composite 1: home before/after (1.1 BEFORE = 9.1.1 AFTER, 9.2 AFTER)
{
  const beforeTop = await loadCell(`${BEFORE_911}/home-1440-top.png`)
  const beforeScrolled = await loadCell(`${BEFORE_911}/home-1440-scrolled.png`)
  const afterTop = await loadCell(`${AFTER_92}/home-1440-top.png`)
  const afterScrolled = await loadCell(`${AFTER_92}/home-1440-scrolled.png`)
  await buildComposite('home-1440.png', [
    { label: '9.1.1 BEFORE - top',     cell: beforeTop },
    { label: '9.1.1 BEFORE - scrolled', cell: beforeScrolled },
    { label: '9.2 AFTER - top',         cell: afterTop },
    { label: '9.2 AFTER - scrolled',     cell: afterScrolled },
  ])
}

// Composite 2: cultures chip contrast - 1440 scrolled (where the cards are visible)
{
  const before = await loadCell(`${BEFORE_911}/cultures-1440-scrolled.png`)
  const after  = await loadCell(`${AFTER_92}/cultures-1440-scrolled.png`)
  await buildComposite('cultures-1440-chips.png', [
    { label: '9.1.1 BEFORE - chip 3.8:1 worst case', cell: before },
    { label: '9.2 AFTER - chip 9.4:1 frosted-glass',  cell: after },
  ])
}

// Composite 3: bright-hero gradient strengthen on /culture/african
{
  const before = await loadCell(`${BEFORE_911}/culture-african-1440-top.png`)
  const after  = await loadCell(`${AFTER_92}/culture-african-1440-top.png`)
  await buildComposite('bright-hero-1440.png', [
    { label: '9.1.1 BEFORE - gradient 0.45 mid-stop', cell: before },
    { label: '9.2 AFTER - gradient 0.65 mid-stop',     cell: after },
  ])
}
