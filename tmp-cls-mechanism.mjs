/**
 * NEGATIVE CONTROL for the SurfaceGuidance layout-shift fix.
 *
 * The claim is structural: a bottom-anchored fixed container that is SIZED BY
 * its children shifts when a child mounts after paint, and the same container
 * does not shift when that child is taken out of flow. This reproduces both
 * structures with the real class strings and measures the browser's own
 * layout-shift entries, so the "after" number is only trustworthy because the
 * "before" number can be seen to fail in the same harness.
 *
 * Usage: node tmp-cls-mechanism.mjs
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'

const CARD = '<div style="width:320px;height:360px;background:#fff;border:1px solid #ddd;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.15)">coach</div>'

// BEFORE: coach is a flex child, so the fixed container grows when it mounts.
const before = `
<div id="wrap" style="position:fixed;bottom:64px;right:16px;z-index:50;display:flex;flex-direction:column;align-items:flex-end;gap:8px;pointer-events:none">
  <div id="slot"></div>
  <button style="height:44px;width:44px;border-radius:9999px;background:#0A1628"></button>
</div>
<script>setTimeout(function(){document.getElementById('slot').innerHTML=${JSON.stringify(CARD)}},1200)<\/script>`

// AFTER: coach is created inside an absolutely positioned wrapper anchored to
// the container's top edge, so the container's own box never changes.
const after = `
<div id="wrap" style="position:fixed;bottom:64px;right:16px;z-index:50;display:flex;flex-direction:column;align-items:flex-end;gap:8px;pointer-events:none">
  <button style="height:44px;width:44px;border-radius:9999px;background:#0A1628"></button>
</div>
<script>setTimeout(function(){
  var w=document.createElement('div');
  w.style.cssText='position:absolute;bottom:100%;right:0;margin-bottom:8px;display:flex;flex-direction:column;align-items:flex-end;gap:8px';
  w.innerHTML=${JSON.stringify(CARD)};
  document.getElementById('wrap').appendChild(w);
},1200)<\/script>`

const page404Filler = '<div style="height:3000px;background:linear-gradient(#fff,#eee)"></div>'

// Served over real HTTP, not setContent/about:blank: the layout-shift
// PerformanceObserver reports nothing on a document with no real origin, which
// is exactly the kind of silently-empty measurement this harness exists to
// avoid.
const pages = new Map()
const server = createServer((req, res) => {
  const body = pages.get(req.url)
  res.writeHead(body ? 200 : 404, { 'content-type': 'text/html' })
  res.end(body || 'not found')
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const results = []
for (const [label, body] of [['BEFORE (flex child)', before], ['AFTER (absolute)', after]]) {
  const context = await browser.newContext({ viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  await page.addInitScript(() => {
    window.__cls = 0
    window.__n = 0
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__cls += e.value; window.__n += 1 }
    }).observe({ type: 'layout-shift', buffered: true })
  })
  const path = `/${encodeURIComponent(label)}`
  pages.set(path, `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">${page404Filler}${body}`)
  await page.goto(origin + path, { waitUntil: 'load' })
  await page.waitForTimeout(3500)
  const cls = await page.evaluate(() => ({ cls: window.__cls ?? -1, n: window.__n ?? -1 }))
  if (cls.cls < 0) throw new Error('observer never installed - harness is not measuring anything')
  results.push({ label, ...cls })
  await context.close()
}
await browser.close()
server.close()

console.log('layout-shift entries observed for each structure (same harness, same card, same timing):')
for (const r of results) console.log(`  ${r.label.padEnd(22)} entries=${r.n}  CLS=${r.cls.toFixed(4)}`)
const b = results[0], a = results[1]
console.log(`\ncontrol: BEFORE must be > 0 or this harness proves nothing -> ${b.cls > 0 ? 'OK, it shifts' : 'HARNESS BROKEN, it did not shift'}`)
console.log(`result:  AFTER  ${a.cls === 0 ? 'does not shift' : `still shifts by ${a.cls.toFixed(4)}`}`)
process.exit(b.cls > 0 && a.cls === 0 ? 0 : 1)
