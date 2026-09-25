/**
 * THE CONSENT STRIP IS DRIVEN, NOT DESCRIBED: IS IT THERE WHEN THE PAGE PAINTS,
 * IS IT ABSENT FOR SOMEBODY WHO ANSWERED, AND DOES EITHER BUTTON WORK BEFORE
 * THE JAVASCRIPT LANDS.
 *
 * WHY THIS EXISTS. `consent-banner-lcp-drive.mjs` measured the cost of the
 * banner arriving late and handed the finding over; this is the other half, the
 * proof that moving it into the first paint did what it claims and broke
 * nothing. Three things can go wrong with that move and all three are silent:
 *
 *   1. The strip is in the HTML but never revealed, so nobody is ever asked and
 *      the platform quietly stops collecting consent.
 *   2. The strip is revealed for somebody who answered months ago, which is the
 *      flash the old client-only shape existed to avoid.
 *   3. The strip paints early and its buttons do nothing until a deferred chunk
 *      arrives, which is a dead control on the one surface that must work.
 *
 * Each of those is a fact about a running browser, so each is driven here at
 * 390, 768 and 1440 rather than asserted from source.
 *
 * HOW THE THIRD ONE IS ACTUALLY REACHED. The window between first paint and
 * hydration is real but short on a warm local server, so it is WIDENED rather
 * than raced: every `/_next/static/chunks/` response is held for
 * CHUNK_DELAY_MS, the press happens inside that window, and the answer must
 * both take the strip down immediately and still reach the cookie once the
 * chunks land. That is the honest version of "it works before hydration".
 *
 * THE COOKIE IS READ OUT OF THE APPLICATION, NEVER TYPED HERE. The cookie name,
 * the version and the element id come from `@/lib/analytics/consent` and
 * `@/lib/analytics/consent-first-paint` through the alias loader, so a rename
 * moves this harness with the code instead of leaving it driving a string
 * nothing sets.
 *
 * PROVE THE INSTRUMENT. A page that does not answer 200, or a build whose HTML
 * does not contain the strip at all, exits 2 as a BROKEN DRIVE: a harness that
 * reports "the banner never flashed" because it could never find the banner is
 * how this repository lost a day to six proofs that all accused the product.
 *
 * Usage:
 *   node scripts/verify/consent-banner-first-paint-drive.mjs --serve --port=3210
 *   node scripts/verify/consent-banner-first-paint-drive.mjs http://127.0.0.1:3210
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { startGateServer, envFor } from '../ops/pre-push-gate.mjs'
import { refuseUnlessThePortIsFree } from './lib/port-is-ours.mjs'

const TAG = '[consent-first-paint]'
const args = process.argv.slice(2)
const SERVE = args.includes('--serve')
const PORT = Number(args.find((a) => a.startsWith('--port='))?.split('=')[1] ?? 3210)
const OUT = process.env.DRIVE_OUT ?? join('C:', 'dev', 'EVIDENCE', 'CONSENTLCP')
/** Paths arrive WITHOUT a leading slash: MSYS rewrites anything that looks like one. */
const PATHS = (() => {
  const given = args.filter((a) => a.startsWith('--path=')).map((a) => a.slice('--path='.length))
  const raw = given.length > 0 ? given : ['events']
  return raw.map((p) => (p === 'home' ? '/' : `/${p.replace(/^\/+/, '')}`))
})()
let BASE = args.find((a) => a.startsWith('http')) ?? `http://127.0.0.1:${PORT}`

const VIEWPORTS = [
  { label: '390', width: 390, height: 844 },
  { label: '768', width: 768, height: 1024 },
  { label: '1440', width: 1440, height: 900 },
]

/** Long enough that the press below lands before hydration on a warm server. */
const CHUNK_DELAY_MS = 2500

const results = []
let failures = 0
const check = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), detail: detail ?? '' })
  if (!ok) failures += 1
  console.log(`${TAG} ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`)
}
const broken = (why) => {
  console.error(`${TAG} BROKEN DRIVE: ${why}`)
  process.exit(2)
}

/* The contract, read out of the application. */
const probe = [
  "import { CONSENT_COOKIE, CONSENT_VERSION, allRefused, encodeConsent } from '@/lib/analytics/consent'",
  "import { CONSENT_SHELL_ID, CONSENT_ASK_ATTRIBUTE, CONSENT_ASK_VALUE, CONSENT_BANNER_HEIGHT_VAR, CONSENT_INTENT_ATTRIBUTE, CONSENT_INTENT_ACCEPT, CONSENT_INTENT_REFUSE } from '@/lib/analytics/consent-first-paint'",
  'console.log(JSON.stringify({',
  '  cookie: CONSENT_COOKIE,',
  '  version: CONSENT_VERSION,',
  '  refusedValue: encodeConsent(allRefused(new Date("2026-09-14T00:00:00.000Z"))),',
  '  id: CONSENT_SHELL_ID,',
  '  askAttr: CONSENT_ASK_ATTRIBUTE,',
  '  askValue: CONSENT_ASK_VALUE,',
  '  heightVar: CONSENT_BANNER_HEIGHT_VAR,',
  '  intentAttr: CONSENT_INTENT_ATTRIBUTE,',
  '  accept: CONSENT_INTENT_ACCEPT,',
  '  refuse: CONSENT_INTENT_REFUSE,',
  '}))',
  '',
].join('\n')
const loaded = spawnSync(
  process.execPath,
  ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--import', './scripts/lib/src-alias-loader.mjs', '--input-type=module', '-e', probe],
  { cwd: process.cwd(), encoding: 'utf8' },
)
if (loaded.status !== 0) broken(`could not read the consent contract out of src: ${(loaded.stderr || loaded.stdout).trim().slice(0, 400)}`)
const line = loaded.stdout.trim().split('\n').find((l) => l.startsWith('{'))
if (!line) broken(`the consent contract printed nothing: ${loaded.stdout.slice(0, 200)}`)
const C = JSON.parse(line)

mkdirSync(OUT, { recursive: true })

let stopServer = null
if (SERVE) {
  try {
    await refuseUnlessThePortIsFree(PORT, 'before the consent drive server was started', 'pass --port= for one this lane owns')
  } catch (error) {
    console.error(`${TAG} REFUSING: ${error.message}`)
    process.exit(1)
  }
  mkdirSync('.tmp', { recursive: true })
  const started = await startGateServer(envFor('local'), '.tmp/consent-first-paint-server.log', { port: PORT })
  if (started.error) broken(`could not serve the build: ${started.error}`)
  BASE = started.base
  stopServer = started.stop
  console.log(`${TAG} serving the production build on ${BASE}`)
}

/**
 * WATCHES THE STRIP FROM THE FIRST FRAME, because "it never flashed" is a claim
 * about frames nobody is looking at by the time a test usually asks.
 */
const WATCHER = `(() => {
  const ID = ${JSON.stringify(C.id)};
  window.__elStrip = { samples: [], paint: {}, lcp: [] };
  const visible = (el) => {
    if (!el) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.height > 0 && r.width > 0;
  };
  const tick = () => {
    const el = document.getElementById(ID);
    window.__elStrip.samples.push({ t: Math.round(performance.now()), present: Boolean(el), visible: visible(el) });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.name === 'first-contentful-paint') window.__elStrip.paint.fcp = Math.round(e.startTime);
    }).observe({ type: 'paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const el = e.element;
        window.__elStrip.lcp.push({
          t: Math.round(e.startTime),
          size: e.size,
          tag: el ? el.tagName.toLowerCase() : null,
          inStrip: Boolean(el && el.closest && el.closest('#' + ID)),
          text: el ? (el.textContent || '').trim().slice(0, 48) : '',
        });
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (error) {
    window.__elStrip.observerError = String(error);
  }
})()`

const readWatcher = (page) => page.evaluate('window.__elStrip')
const strip = (page) => page.locator(`#${C.id}`)
const cookieValue = async (context) => {
  const all = await context.cookies()
  return all.find((c) => c.name === C.cookie)?.value ?? null
}
const decodeDecision = (value) => {
  if (!value) return null
  try {
    return JSON.parse(decodeURIComponent(value))
  } catch {
    return { unparseable: value.slice(0, 40) }
  }
}

const browser = await chromium.launch()
const evidence = { base: BASE, paths: PATHS, widths: VIEWPORTS.map((v) => v.label), runs: [] }

try {
  /*
   * ONE: THE STRIP IS IN THE SERVER HTML. Fetched as bytes rather than read off
   * a rendered page, because the whole point of the change is that it arrives
   * with the document instead of with a chunk.
   */
  for (const path of PATHS) {
    const response = await fetch(`${BASE}${path}`, { headers: { Cookie: 'el-audit=1' } })
    if (response.status !== 200) broken(`${path} answered ${response.status}; nothing measured on it could be judged`)
    const html = await response.text()
    check(`${path}: the strip is in the server HTML`, html.includes(`id="${C.id}"`), `${html.length} bytes`)
    check(
      `${path}: the HTML does not vary by consent (no ask flag baked in)`,
      !html.includes(`${C.askAttr}="${C.askValue}"`),
      'the reveal is a pre-paint script, so the cache key stays viewer independent',
    )
  }

  for (const view of VIEWPORTS) {
    for (const path of PATHS) {
      const where = `${path} @ ${view.label}`

      /* TWO: AN UNDECIDED VISITOR SEES IT, AND SEES IT WITH THE PAGE. */
      {
        const context = await browser.newContext({ viewport: { width: view.width, height: view.height } })
        await context.addInitScript(WATCHER)
        const page = await context.newPage()
        await page.goto(`${BASE}${path}`, { waitUntil: 'load' })
        await page.waitForTimeout(500)
        const watched = await readWatcher(page)
        const firstVisible = watched.samples.find((s) => s.visible)
        const lastLcp = watched.lcp[watched.lcp.length - 1] ?? null
        check(`${where}: an undecided visitor is asked`, await strip(page).isVisible(), 'the strip is on screen')
        check(
          `${where}: it is up within one frame of the first paint`,
          Boolean(firstVisible) && typeof watched.paint.fcp === 'number' && firstVisible.t - watched.paint.fcp <= 250,
          firstVisible ? `visible at ${firstVisible.t}ms, FCP ${watched.paint.fcp}ms` : 'it was never visible',
        )
        const reserved = await page.evaluate(
          (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
          C.heightVar,
        )
        check(`${where}: it reserves its own height`, /^\d+px$/.test(reserved) && parseInt(reserved, 10) > 0, `${C.heightVar}: ${reserved || 'unset'}`)
        await page.screenshot({ path: join(OUT, `green-${view.label}-undecided${path.replace(/\//g, '-')}.png`) })
        evidence.runs.push({ where, case: 'undecided', fcp: watched.paint.fcp ?? null, firstVisible: firstVisible?.t ?? null, lcp: lastLcp })
        await context.close()
      }

      /* THREE: SOMEBODY WHO ANSWERED IS NOT ASKED AGAIN, AND NEVER SEES A FLASH. */
      {
        const context = await browser.newContext({ viewport: { width: view.width, height: view.height } })
        await context.addCookies([{ name: C.cookie, value: C.refusedValue, url: BASE }])
        await context.addInitScript(WATCHER)
        const page = await context.newPage()
        await page.goto(`${BASE}${path}`, { waitUntil: 'load' })
        await page.waitForTimeout(500)
        const watched = await readWatcher(page)
        const flashes = watched.samples.filter((s) => s.visible)
        check(
          `${where}: a recorded refusal is never asked again`,
          flashes.length === 0,
          `${watched.samples.length} frame(s) watched, ${flashes.length} with the strip visible`,
        )
        check(
          `${where}: and the watcher was actually watching`,
          watched.samples.length >= 5 && watched.samples.some((s) => s.present),
          `${watched.samples.length} frame(s), strip present in ${watched.samples.filter((s) => s.present).length}`,
        )
        await page.screenshot({ path: join(OUT, `green-${view.label}-decided${path.replace(/\//g, '-')}.png`) })
        await context.close()
      }

      /* FOUR: EITHER BUTTON ANSWERS BEFORE THE JAVASCRIPT LANDS. */
      for (const answer of [C.refuse, C.accept]) {
        const context = await browser.newContext({ viewport: { width: view.width, height: view.height } })
        await context.addInitScript(WATCHER)
        const page = await context.newPage()
        /*
         * THE JAVASCRIPT ONLY, AND THE `.js` IS THE WHOLE POINT.
         *
         * The first version of this held `**\/_next/static/chunks/**`, and this
         * build serves its STYLESHEET from that same prefix
         * (`/_next/static/chunks/40otuq_2tf86d.css`). Holding it back rendered
         * every page unstyled, which removed the `display: none` the strip is
         * hidden by, so the strip was "visible" for the wrong reason and the
         * press could not take it down because nothing was styling it. Twelve
         * checks failed and every one of them accused a correct product.
         */
        await page.route('**/_next/static/chunks/**.js', async (route) => {
          await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY_MS))
          await route.continue()
        })
        await page.goto(`${BASE}${path}`, { waitUntil: 'commit' })
        const button = page.locator(`#${C.id} [${C.intentAttr}="${answer}"]`)
        await button.waitFor({ state: 'visible', timeout: 10_000 })
        const pressedAt = Date.now()
        await button.click()
        const wentDown = await strip(page)
          .waitFor({ state: 'hidden', timeout: 2000 })
          .then(() => true)
          .catch(() => false)
        check(`${where}: "${answer}" pressed before hydration takes the strip down`, wentDown, `${Date.now() - pressedAt}ms after the press`)
        // The chunks are still held; the cookie can only appear once they land
        // and the provider writes it, which is the half that proves the answer
        // was not merely hidden.
        let decision = null
        for (let i = 0; i < 40 && decision === null; i += 1) {
          await page.waitForTimeout(250)
          decision = decodeDecision(await cookieValue(context))
        }
        check(
          `${where}: "${answer}" reaches the cookie once the chunk lands`,
          Boolean(decision) && decision.v === C.version && typeof decision.t === 'string',
          decision ? JSON.stringify(decision) : 'no consent cookie was ever written',
        )
        if (decision && typeof decision.a === 'number') {
          const expected = answer === C.accept ? 1 : 0
          check(
            `${where}: "${answer}" recorded the right answer`,
            decision.a === expected && decision.d === expected,
            `analytics=${decision.a} advertising=${decision.d}, expected ${expected}`,
          )
        }
        await context.close()
      }
    }
  }
} finally {
  await browser.close()
  if (stopServer) stopServer()
}

writeFileSync(join(OUT, 'first-paint-drive.json'), JSON.stringify({ ...evidence, results }, null, 2))

const seen = results.filter((r) => r.name.includes('an undecided visitor is asked'))
if (seen.length === 0 || seen.every((r) => !r.ok)) {
  broken('the strip was never seen on any page at any width, so this drive cannot report anything about it')
}

console.log(`${TAG} ${results.length - failures} of ${results.length} checks passed across ${VIEWPORTS.length} width(s)`)
console.log(`${TAG} evidence: ${OUT}`)
process.exit(failures > 0 ? 1 : 0)
