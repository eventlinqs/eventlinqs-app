/**
 * Attribute every SCRIPT byte the page downloads to whatever asked for it.
 *
 * The Lighthouse budget that fails is resource-summary:script:size, a single
 * number. This prints the same total broken down per request, with the
 * initiator frame, so a fix can be aimed at a cause instead of guessed at.
 *
 * Mobile emulation matches Lighthouse's form factor, and the gather window is
 * modelled on lighthouserc.json (load + pauseAfterLoadMs 5000 + a further
 * networkQuietThreshold 5000), so late telemetry chunks count here exactly as
 * they count there.
 *
 * Usage: node tmp-script-attrib.mjs <absoluteUrl>
 */
import { chromium } from 'playwright'

const url = process.argv[2]
if (!url) { console.error('usage: node tmp-script-attrib.mjs <url>'); process.exit(1) }

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const context = await browser.newContext({
  viewport: { width: 412, height: 823 },
  deviceScaleFactor: 1.75,
  isMobile: true,
  hasTouch: true,
  extraHTTPHeaders: { Cookie: 'el-audit=1' },
})
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
await cdp.send('Network.enable')

const reqs = new Map()
cdp.on('Network.requestWillBeSent', (e) => {
  const init = e.initiator || {}
  const frame = init.stack?.callFrames?.[0]
  reqs.set(e.requestId, {
    url: e.request.url,
    type: e.type,
    initiatorType: init.type,
    initiatorUrl: init.url || (frame ? frame.url : ''),
    initiatorFn: frame ? frame.functionName : '',
    stack: (init.stack?.callFrames || []).slice(0, 5).map((f) => `${f.functionName || '(anon)'} @ ${f.url.split('/').pop()}:${f.lineNumber}`),
    t: e.timestamp,
  })
})
cdp.on('Network.loadingFinished', (e) => {
  const r = reqs.get(e.requestId)
  if (r) r.encoded = e.encodedDataLength
})

const t0 = Date.now()
await page.goto(url, { waitUntil: 'load', timeout: 60000 })
const loadAt = Date.now() - t0
await page.waitForTimeout(10000)

const scripts = [...reqs.values()].filter((r) => r.type === 'Script' && r.encoded)
scripts.sort((a, b) => b.encoded - a.encoded)
const total = scripts.reduce((s, r) => s + r.encoded, 0)
console.log(`${url}`)
console.log(`load event at ${loadAt}ms; window held open a further 10s`)
console.log(`SCRIPT total ${total} bytes across ${scripts.length} requests   (budget 491520)\n`)
for (const r of scripts) {
  const name = r.url.split('/').pop()
  console.log(`${String(r.encoded).padStart(8)}  ${name}`)
  console.log(`          initiator=${r.initiatorType} ${r.initiatorUrl.split('/').pop() || '-'}`)
  if (r.stack.length) console.log(`          stack: ${r.stack.join(' <- ')}`)
}
await browser.close()
