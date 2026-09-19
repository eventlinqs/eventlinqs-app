/**
 * THE LARGEST THING ON THE BROWSE PAGE IS THE COOKIE BANNER, AND THIS MEASURES IT.
 *
 * WHY THIS EXISTS. Close-out C8 asks for the mobile score on a production build
 * and C8B.1 says the table decides the work order, so the table has to be right
 * about what is actually costing the page. On 19 September 2026 and again on 20
 * September, Lighthouse named the largest contentful element on /events as:
 *
 *   body > div.fixed > div.mx-auto > p.max-w-3xl
 *   "We count how the site is used so we can make it better, and "
 *
 * That is the consent banner (src/components/analytics/consent-banner.tsx), a
 * fixed strip at the foot of the window, and it carried 1,172 ms of ELEMENT
 * RENDER DELAY in the median of five. It is not a chunk and no bundle work
 * reaches it: it is a large block of text that arrives late and is then the
 * biggest thing painted.
 *
 * WHY A DRIVE AND NOT A DELETION. The banner belongs to another lane. This lane
 * may measure it and must not change it, so the cost is established by
 * observation at the three widths the brief requires and handed over with a
 * number rather than an opinion.
 *
 * WHY NOT AN A/B. Because it was tried and it does not work, and recording that
 * is worth more than repeating it. Lighthouse's `extraHeaders` sets the HTTP
 * Cookie header; the banner reads its decision from `document.cookie` on the
 * client (consent-provider.tsx:70). Five runs of /events with a correctly
 * encoded recorded refusal in that header rendered the banner in all five and
 * named it the LCP element in all five, identically to the five runs with no
 * cookie at all. There was no treatment, so there is no delta to quote. The
 * note lives in scripts/perf/lh-local-median.mjs beside the flag.
 *
 * WHAT IT ASSERTS, AND WHAT IT DOES NOT. It reports geometry: the banner's
 * share of the viewport, and the largest element the page itself offers
 * underneath it. It does not judge a score, and it is NOT the evidence that the
 * banner won the LCP.
 *
 * THE CANDIDATE SET IS AN APPROXIMATION, said plainly so nobody quotes it as
 * more. Lighthouse's LCP algorithm considers images and block-level text with
 * its own rules for containing blocks; this walks `img, h1, h2, p, div`, keeps
 * images and LEAF text nodes inside the viewport, and takes the largest. A
 * heading wrapped in a band with siblings is therefore missed, so "the page's
 * largest" here can UNDERSTATE what the page really offers. That direction of
 * error matters: it makes "the banner outsizes the page" easier to say, not
 * harder, which is why that line is phrased as a hint to be confirmed rather
 * than a verdict.
 *
 * THE ACTUAL EVIDENCE that the banner won is Lighthouse's own
 * `largest-contentful-paint-element` audit, which named it on /events in ten of
 * ten runs on 19 and 20 September and on /pricing as well. This drive explains
 * WHY that happens - the page offers nothing bigger - and is read beside those
 * reports, never instead of them.
 *
 * PROVE THE INSTRUMENT, AND KNOW WHAT IS AN INSTRUMENT FAULT. A page that does
 * not answer 200 exits 2 as a BROKEN DRIVE immediately: nothing measured there
 * can be judged. A page with no banner is DIFFERENT - it is a finding about
 * that page, recorded, and the sweep continues; conflating the two is how a
 * thirteen page sweep gets aborted by the one page that legitimately has none.
 * The instrument is judged once, at the end: if the banner was never seen on
 * any page at any width, THAT exits 2, because a drive that can no longer find
 * its subject must not report a platform whose banner costs nothing. A harness
 * that fails quietly is how this repository lost a day to six proofs that all
 * accused the product.
 *
 * Usage:
 *   node scripts/verify/consent-banner-lcp-drive.mjs --serve --port=3200
 *   node scripts/verify/consent-banner-lcp-drive.mjs http://localhost:3200 --path=events
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { startGateServer, envFor } from '../ops/pre-push-gate.mjs'
import { refuseUnlessThePortIsFree } from './lib/port-is-ours.mjs'

const TAG = '[consent-banner-lcp]'
const args = process.argv.slice(2)
const SERVE = args.includes('--serve')
const PORT = Number(args.find(a => a.startsWith('--port='))?.split('=')[1] ?? 3200)
const OUT = process.env.DRIVE_OUT ?? join('C:', 'dev', 'EVIDENCE', 'C8-SCORE-20260920')
let BASE = args.find(a => a.startsWith('http')) ?? `http://127.0.0.1:${PORT}`
const PATHS = (() => {
  const given = args.filter(a => a.startsWith('--path=')).map(a => a.slice('--path='.length))
  if (given.length === 0) return ['/events']
  return given.map(p => (p === 'home' ? '/' : p.startsWith('/') ? p : `/${p}`))
})()

const VIEWPORTS = [
  { label: '390', width: 390, height: 844 },
  { label: '768', width: 768, height: 1024 },
  { label: '1440', width: 1440, height: 900 },
]

/** The banner's own selector, taken from the component rather than guessed. */
const BANNER = 'div[role="region"][aria-label="Cookies and measurement"]'

mkdirSync(OUT, { recursive: true })

const results = []
let failures = 0
const check = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), detail })
  if (!ok) failures += 1
  console.log(`${TAG} ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`)
}

let stopServer = null
if (SERVE) {
  try {
    await refuseUnlessThePortIsFree(PORT, 'before the measurement server was started', 'pass --port= for one this lane owns')
  } catch (error) {
    console.error(`${TAG} REFUSING: ${error.message}`)
    process.exit(1)
  }
  mkdirSync('.tmp', { recursive: true })
  const started = await startGateServer(envFor('local'), '.tmp/consent-banner-server.log', { port: PORT })
  if (started.error) {
    console.error(`${TAG} could not serve the build: ${started.error}`)
    process.exit(1)
  }
  BASE = started.base
  stopServer = started.stop
  console.log(`${TAG} serving the production build on ${BASE}`)
}

/*
 * THE MEASUREMENT, RUN IN THE PAGE.
 *
 * `area` is what LCP actually compares, so it is what this reports. For the
 * banner it is the rendered box; for the page it is the largest element that is
 * a genuine LCP candidate (an image, or a text block), excluding anything
 * inside the banner itself so the two are not the same object.
 */
const MEASURE = `(() => {
  const banner = document.querySelector('${BANNER}');
  const vw = window.innerWidth, vh = window.innerHeight;
  const boxOf = (el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), area: Math.round(r.width * r.height) }; };

  const candidates = [...document.querySelectorAll('img, h1, h2, p, div')]
    .filter((el) => !banner || !banner.contains(el))
    .filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return false;
      if (r.top > vh || r.bottom < 0) return false;
      if (el.tagName === 'IMG') return true;
      return el.children.length === 0 && (el.textContent || '').trim().length > 0;
    })
    .map((el) => ({ tag: el.tagName.toLowerCase(), cls: (el.className && String(el.className).slice(0, 60)) || '', ...boxOf(el) }))
    .sort((a, b) => b.area - a.area);

  return {
    viewport: { vw, vh, area: vw * vh },
    bannerPresent: Boolean(banner),
    banner: banner ? boxOf(banner) : null,
    bannerText: banner ? (banner.textContent || '').trim().slice(0, 80) : null,
    topCandidates: candidates.slice(0, 3),
  };
})()`

let sawBannerSomewhere = false
const browser = await chromium.launch()
const report = { base: BASE, ranAt: new Date().toISOString(), paths: {} }

try {
  for (const path of PATHS) {
    report.paths[path] = []
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 })
      const page = await ctx.newPage()
      const response = await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 90000 })
      const status = response?.status() ?? 0

      if (status !== 200) {
        console.error(`${TAG} BROKEN DRIVE: ${BASE}${path} answered ${status} at ${vp.label}. Nothing was judged.`)
        await ctx.close()
        await browser.close()
        if (stopServer) await stopServer()
        process.exit(2)
      }

      // The banner mounts only after the consent cookie is read on the client,
      // so waiting for it is part of the measurement, not a workaround.
      await page.waitForSelector(BANNER, { timeout: 15000 }).catch(() => {})
      /*
       * AND THEN LET THE PAGE SETTLE BEFORE MEASURING GEOMETRY. Without this,
       * two event-detail pages reported ZERO candidates at 768 and 1440 on two
       * consecutive sweeps: the scan ran while the hero was still being laid
       * out, so every box it looked at was outside the viewport or had no size.
       * That is the instrument measuring its own timing, which this repository
       * has paid for before, and it showed up as a fault rather than a silent
       * wrong number only because the no-candidate case is judged.
       */
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
      const m = await page.evaluate(MEASURE)

      /*
       * A PAGE WITHOUT THE BANNER IS A FINDING; A SWEEP WITHOUT IT ANYWHERE IS A
       * BROKEN INSTRUMENT. Those are different things, and conflating them is how
       * a sweep of thirteen pages gets aborted by the one page that legitimately
       * has no banner. So this records and continues, and the instrument is
       * judged once at the end on whether the banner was EVER seen.
       */
      if (!m.bannerPresent) {
        check(
          `${path} at ${vp.label}: the consent banner is not in the document`,
          true,
          'recorded, not judged: this page does not render the banner',
        )
        report.paths[path].push({ viewport: vp.label, status, shot: null, ...m })
        await ctx.close()
        continue
      }
      sawBannerSomewhere = true

      const slug = path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home'
      const shot = join(OUT, `consent-banner-${slug}-${vp.label}.png`)
      await page.screenshot({ path: shot, fullPage: false })

      const share = (m.banner.area / m.viewport.area) * 100
      const biggest = m.topCandidates[0]
      /*
       * NO CANDIDATE MEANS UNJUDGED, NOT A WIN. This previously defaulted to
       * "the banner is larger than anything the page offers" whenever the page
       * offered nothing measurable, which is the instrument asserting its own
       * blind spot as a finding. Two event pages at 768 hit it on the first
       * sweep. The row above already FAILS when there is no candidate; this one
       * now declines to give a verdict instead of inventing one.
       */
      const bannerWins = biggest ? m.banner.area > biggest.area : null

      check(
        `${path} at ${vp.label}: the banner is measured and the page's own largest candidate is named`,
        m.banner.area > 0 && Boolean(biggest),
        `banner ${m.banner.w}x${m.banner.h} = ${m.banner.area}px2, ${share.toFixed(1)}% of the ${m.viewport.vw}x${m.viewport.vh} viewport; ` +
          `page's largest: <${biggest?.tag}> ${biggest?.w}x${biggest?.h} = ${biggest?.area}px2`,
      )
      check(
        `${path} at ${vp.label}: ${
          bannerWins === null
            ? 'UNJUDGED, the page offered no measurable candidate'
            : bannerWins
              ? 'the banner outsizes the largest candidate this drive found'
              : 'the page offers something larger than the banner'
        }`,
        true,
        bannerWins === null
          ? 'no verdict: this drive found nothing on the page to compare against, which is its own limit rather than a fact about the page'
          : bannerWins
            ? `banner ${m.banner.area}px2 > page ${biggest.area}px2 - a strong hint that LCP lands on the banner, to be CONFIRMED by Lighthouse`
            : `banner ${m.banner.area}px2 < page ${biggest.area}px2 - the banner is not the largest here`,
      )

      report.paths[path].push({ viewport: vp.label, status, share: Number(share.toFixed(1)), bannerWins, shot, ...m })
      await ctx.close()
    }
  }
} finally {
  await browser.close()
  if (stopServer) await stopServer()
}

if (!sawBannerSomewhere) {
  console.error(
    `${TAG} BROKEN DRIVE: the consent banner was not found on ANY page at ANY width.` +
      ` Either it has been removed by the lane that owns it, or this drive is pointed at a build` +
      ` that does not carry it. Reported as a broken instrument rather than as a platform whose` +
      ` banner costs nothing.`,
  )
  process.exit(2)
}

const file = join(OUT, 'consent-banner-lcp.json')
writeFileSync(file, JSON.stringify({ ...report, results, failures }, null, 2))
console.log(`\n${TAG} ${failures === 0 ? 'PASS' : 'FAIL'} - ${results.length} assertion(s), ${failures} fault(s). Report: ${file}`)
process.exit(failures === 0 ? 0 : 1)
