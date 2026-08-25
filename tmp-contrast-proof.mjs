/**
 * Prove the contrast fix on the REAL page rather than on arithmetic.
 *
 * Loads the live event-detail surface, finds the Join Waitlist control axe
 * flagged, and computes the composited foreground and background it actually
 * renders - first as shipped (an ancestor carrying `opacity-80`), then with
 * that one class removed and nothing else touched.
 *
 * Usage: node tmp-contrast-proof.mjs <absoluteUrl>
 */
import { chromium } from 'playwright'

const url = process.argv[2]
if (!url) { console.error('usage: node tmp-contrast-proof.mjs <url>'); process.exit(1) }

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, extraHTTPHeaders: { Cookie: 'el-audit=1' } })
const page = await context.newPage()
await page.goto(url, { waitUntil: 'load', timeout: 60000 })

const result = await page.evaluate(() => {
  // Resolve ANY CSS colour syntax through the canvas, not a regex. Chrome
  // serialises a Tailwind v4 token as oklch(...), and pulling the first three
  // numbers out of that string yields lightness/chroma/hue read as r/g/b -
  // which is how the first version of this harness reported a 1.7:1 ratio on a
  // button that renders brown on cream.
  const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  const parse = (css) => {
    probe.clearRect(0, 0, 1, 1)
    probe.fillStyle = '#000'
    probe.fillStyle = css
    probe.globalCompositeOperation = 'copy'
    probe.fillRect(0, 0, 1, 1)
    const d = probe.getImageData(0, 0, 1, 1).data
    return [d[0], d[1], d[2], d[3] / 255]
  }
  const over = (fg, bg, a) => fg.map((c, i) => c * a + bg[i] * (1 - a))
  const relLum = ([r, g, b]) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const contrast = (a, b) => { const [x, y] = [relLum(a), relLum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

  const btn = [...document.querySelectorAll('button')].find((b) => /^Join waitlist for /.test(b.getAttribute('aria-label') || ''))
  if (!btn) return { error: 'no Join Waitlist button on this page' }

  // Effective opacity is the product of every ancestor's opacity.
  const chain = []
  for (let el = btn; el && el !== document.documentElement; el = el.parentElement) {
    const o = Number(getComputedStyle(el).opacity)
    if (o < 1) chain.push({ tag: el.tagName, cls: el.className.slice(0, 60), opacity: o })
  }

  function measure() {
    let effective = 1
    for (let el = btn; el && el !== document.documentElement; el = el.parentElement) effective *= Number(getComputedStyle(el).opacity)
    const fgRaw = parse(getComputedStyle(btn).color)
    const bgRaw = parse(getComputedStyle(btn).backgroundColor)
    const white = [255, 255, 255]
    const bg = over(bgRaw.slice(0, 3), white, bgRaw[3] * effective)
    const fg = over(fgRaw.slice(0, 3), bg, fgRaw[3] * effective)
    return { effective, fg: hex(fg), bg: hex(bg), ratio: contrast(fg, bg), fontPx: getComputedStyle(btn).fontSize }
  }

  const asShipped = measure()

  // Remove ONLY the opacity utility from whichever ancestor carries it.
  let removedFrom = null
  for (let el = btn; el && el !== document.documentElement; el = el.parentElement) {
    if (Number(getComputedStyle(el).opacity) < 1) { el.style.opacity = '1'; removedFrom = el.className.slice(0, 70); break }
  }
  const withoutOpacity = measure()

  return { chain, asShipped, withoutOpacity, removedFrom }
})

console.log(url)
console.log(JSON.stringify(result, null, 2))
if (!result.error) {
  const a = result.asShipped, b = result.withoutOpacity
  console.log(`\nas shipped        ${a.fg} on ${a.bg} at ${a.fontPx} -> ${a.ratio.toFixed(2)}:1  ${a.ratio >= 4.5 ? 'PASS' : 'FAIL'}`)
  console.log(`ancestor opacity removed  ${b.fg} on ${b.bg} at ${b.fontPx} -> ${b.ratio.toFixed(2)}:1  ${b.ratio >= 4.5 ? 'PASS' : 'FAIL'}`)
  console.log(`\ncontrol: the shipped value must FAIL or this proves nothing -> ${a.ratio < 4.5 ? 'OK, it fails as shipped' : 'HARNESS SUSPECT'}`)
}
await browser.close()
