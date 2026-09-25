/**
 * GUARD: THE CONSENT BANNER IS IN THE SERVER HTML, AND IT IS REVEALED BEFORE
 * THE FIRST PAINT RATHER THAN AFTER HYDRATION.
 *
 * ============================================================================
 * WHY THIS EXISTS, WITH THE MEASUREMENT THAT PRODUCED IT
 * ============================================================================
 *
 * The AN1 consent banner landed on 13 September 2026 in commit 1dc2ca02 as a
 * client-only component inside the LAZILY FETCHED measurement tree
 * (`measurement-boot.tsx`). It therefore could not paint until React had
 * hydrated AND a second chunk had arrived, and it is a full width strip of
 * text at the foot of the window, which makes it the largest contentful
 * element on a mobile viewport.
 *
 * Eight days later the push gate refused every lane's push on it:
 *
 *     1 result(s) for http://127.0.0.1:63528/events :
 *       x  categories.performance failure for minScore assertion
 *             expected: >=0.88   found: 0.87
 *           all values: 0.87, 0.87, 0.85, 0.87, 0.87
 *
 * It was not one page, which is the part a single failing floor hides. Against
 * docs/perf/LIGHTHOUSE-12.6.1-REBASELINE-2026-09-07.md, the measurement the
 * floors were derived from, NOT ONE of the thirteen gated URLs had the banner
 * as its LCP element on 7 September. Eight days later FIVE did, and every one
 * of them lost points:
 *
 *     URL         7 Sep   21 Sep   LCP element on 7 Sep        on 21 Sep
 *     /help         94       92    h1 "How can we help?"       the banner
 *     /pricing      94       92    h1 "Simple. Transparent."   the banner
 *     /login        91       91    h1 "Welcome back"           the banner
 *     /signup       91       90    a form label span           the banner
 *     /events       91       87    the first rail card image   the banner
 *
 * /events is the one that broke, because its floor is 0.88 and it fell
 * furthest: LCP 3,279 ms to 4,007 ms. That page had DELIBERATELY engineered its
 * LCP anchor, rendering the popular rail inline and outside Suspense with a
 * comment recording that wrapping it regressed mobile LCP to about 5.2s. A
 * banner mounted from the root layout displaced that anchor and took the
 * engineering with it. /organisers shares the 0.88 floor, kept its hero raster
 * as its LCP element, and passed at 0.91: that contrast is the proof it was the
 * banner and not the page.
 *
 * ============================================================================
 * WHAT THE FIX IS, SO THIS GUARD HAS SOMETHING TO HOLD
 * ============================================================================
 *
 * The banner markup is emitted by a SERVER component in the root layout, so it
 * is in the initial HTML of every route and paints with the page. It is hidden
 * by default in CSS and REVEALED by a pre-paint inline script that reads the
 * consent cookie, which is the same shape the motion engine already uses for
 * `html[data-motion="1"]`: identical HTML for every viewer, so the cache key is
 * untouched, and a decision that lands before the first paint, so nobody sees a
 * flash in either direction.
 *
 * The client component in the deferred tree renders NOTHING. It wires the
 * server-rendered strip up to the consent provider once its chunk arrives, and
 * an inline bootstrap captures a press made before that, so neither button is
 * ever a control that does nothing.
 *
 * ============================================================================
 * AND WHY IT IS A GATE RATHER THAN A COMMENT
 * ============================================================================
 *
 * Because mounting a new overlay from the root layout is the ordinary way to
 * add one, it is invisible in review, it costs nothing anybody can see at the
 * call site, and the gate reports it as a two point drop on a page nobody
 * touched. It took eight days and a blocked push to be noticed, and four of the
 * five pages it damaged never failed anything at all: they simply became
 * slower and stayed passing. A number that moves on five pages at once with no
 * diff near any of them is exactly what a build-time gate is for.
 *
 * WHAT THIS CANNOT SEE. It judges source text, not a rendered page. It cannot
 * measure LCP, and it cannot stop a DIFFERENT client-only overlay being added
 * somewhere else; the Lighthouse step is still the thing that measures. What it
 * can do is refuse the specific regression that has already happened once: the
 * consent banner going back to painting after hydration.
 */
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const ROOT = process.cwd()
const CONTRACT = 'src/lib/analytics/consent-first-paint.ts'
const SHELL = 'src/components/analytics/consent-banner-shell.tsx'
const CLIENT = 'src/components/analytics/consent-banner.tsx'
const LAYOUT = 'src/app/layout.tsx'
const CSS = 'src/app/globals.css'

const faults = []
const fail = (message) => faults.push(message)

const read = (file) => {
  if (!existsSync(file)) {
    fail(`${file} does not exist. The consent banner's first-paint contract lives in these files and every one of them is required.`)
    return null
  }
  return readFileSync(file, 'utf8')
}

/*
 * THE CONTRACT IS LOADED, NEVER TYPED AGAIN HERE. The element id, the attribute
 * and the two inline scripts are read out of the module the application itself
 * uses, so a rename moves the guard with the code instead of leaving it
 * asserting a string nothing sets any more.
 */
const probe = [
  "import * as c from '@/lib/analytics/consent-first-paint'",
  "import { CONSENT_COOKIE, CONSENT_VERSION, allGranted, encodeConsent } from '@/lib/analytics/consent'",
  'console.log(JSON.stringify({',
  '  id: c.CONSENT_SHELL_ID,',
  '  attr: c.CONSENT_ASK_ATTRIBUTE,',
  '  value: c.CONSENT_ASK_VALUE,',
  '  heightVar: c.CONSENT_BANNER_HEIGHT_VAR,',
  '  intentAttr: c.CONSENT_INTENT_ATTRIBUTE,',
  '  accept: c.CONSENT_INTENT_ACCEPT,',
  '  refuse: c.CONSENT_INTENT_REFUSE,',
  '  flag: c.CONSENT_ASK_FLAG_SCRIPT,',
  '  bootstrap: c.CONSENT_SHELL_BOOTSTRAP_SCRIPT,',
  '  cookie: CONSENT_COOKIE,',
  '  version: CONSENT_VERSION,',
  '  decided: encodeConsent(allGranted(new Date("2026-09-14T00:00:00.000Z"))),',
  '}))',
  '',
].join('\n')

const loaded = spawnSync(
  process.execPath,
  ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--import', './scripts/lib/src-alias-loader.mjs', '--input-type=module', '-e', probe],
  { cwd: ROOT, encoding: 'utf8' },
)

let contract = null
if (loaded.status !== 0) {
  fail(`could not load ${CONTRACT} through the alias loader: ${(loaded.stderr || loaded.stdout).trim().slice(0, 400)}`)
} else {
  const line = loaded.stdout.trim().split('\n').find((l) => l.startsWith('{'))
  if (!line) fail(`${CONTRACT} printed nothing through the alias loader: ${loaded.stdout.slice(0, 200)}`)
  else contract = JSON.parse(line)
}

const shell = read(SHELL)
const client = read(CLIENT)
const layout = read(LAYOUT)
const css = read(CSS)

let clauses = 0

/* 1. The markup is a SERVER component, so it is in the HTML rather than in a chunk. */
if (shell !== null) {
  clauses += 1
  if (/^\s*['"]use client['"]/m.test(shell)) {
    fail(
      `${SHELL} carries 'use client'. The banner markup must be server rendered: a client\n` +
        `      component cannot paint until React hydrates, which is the whole defect this guard exists for.`,
    )
  }
}

/* 2. The root layout renders it. A server component nobody renders is markup nobody sees. */
if (layout !== null) {
  clauses += 1
  if (!/<ConsentBannerShell\s*\/>/.test(layout)) {
    fail(`${LAYOUT} does not render <ConsentBannerShell />. The banner is only in the first paint if the root layout emits it.`)
  }
}

/* 3. The reveal decision is made BEFORE the first paint, in the head. */
if (layout !== null && contract !== null) {
  /*
   * A PLAIN INLINE SCRIPT, AND NOT `next/script`. This clause used to demand
   * `<Script strategy="beforeInteractive">`, which is the documented,
   * idiomatic, correct-looking way to run something early and which, in the App
   * Router, DOES NOT RUN AT PARSE TIME: Next emits it as a push onto
   * `self.__next_s` and replays that queue from its own runtime once the
   * framework chunk has loaded. Measured on this build, the strip was still
   * hidden when the parser reached it. The guard demanded the exact thing that
   * reintroduced the defect, so the clause is inverted and says why.
   */
  clauses += 1
  const flagAt = layout.indexOf('__html: CONSENT_ASK_FLAG_SCRIPT')
  if (flagAt < 0) {
    fail(`${LAYOUT} does not render CONSENT_ASK_FLAG_SCRIPT as an inline script. Without it the strip stays hidden for everybody and nobody is ever asked.`)
  }
  clauses += 1
  if (/<Script[^>]*>\s*\{CONSENT_ASK_FLAG_SCRIPT\}/.test(layout)) {
    fail(
      `the ask flag in ${LAYOUT} goes through next/script. In the App Router that is queued onto self.__next_s and\n` +
        `      replayed by the Next runtime, so it runs AFTER a JavaScript chunk rather than at parse time, and the strip is\n` +
        `      back to waiting on JavaScript. Render it as <script dangerouslySetInnerHTML={{ __html: ... }} />.`,
    )
  }
  /*
   * ORDER IS THE OTHER HALF. The flag reveals the strip and the bootstrap
   * measures it, so one must stand before the markup and the other after it.
   */
  clauses += 1
  const shellAt = layout.indexOf('<ConsentBannerShell />')
  const bootAt = layout.indexOf('__html: CONSENT_SHELL_BOOTSTRAP_SCRIPT')
  if (flagAt >= 0 && shellAt >= 0 && flagAt > shellAt) {
    fail(`the ask flag in ${LAYOUT} is rendered after the strip, so the strip is parsed while it is still hidden and paints a frame late.`)
  }
  if (bootAt >= 0 && shellAt >= 0 && bootAt < shellAt) {
    fail(`the bootstrap in ${LAYOUT} is rendered before the strip, so it measures an element that does not exist yet and returns without arming either button.`)
  }
  /*
   * THE RENDER SITE, NOT THE NAME. The first version asked whether the layout
   * mentioned CONSENT_SHELL_BOOTSTRAP_SCRIPT anywhere, and the drill that
   * deletes the element it is rendered in left the IMPORT line behind, so the
   * guard passed on a tree with no bootstrap at all. It was caught by the red
   * half of its own drill, which is the argument for writing one.
   */
  clauses += 1
  if (!/__html:\s*CONSENT_SHELL_BOOTSTRAP_SCRIPT/.test(layout)) {
    fail(
      `${LAYOUT} does not render CONSENT_SHELL_BOOTSTRAP_SCRIPT. It reserves the strip's height at first paint and\n` +
        `      captures a press made before the deferred chunk arrives, so neither button is ever a control that does nothing.`,
    )
  }
}

/* 4. The script asks the cookie, at the current version, and its failure direction is to ask. */
if (contract !== null) {
  clauses += 1
  if (!contract.flag.includes(`${contract.cookie}=`)) {
    fail(`CONSENT_ASK_FLAG_SCRIPT does not read the ${contract.cookie} cookie, so it cannot tell a decided visitor from an undecided one.`)
  }
  clauses += 1
  if (!contract.flag.includes(`===${contract.version}`) && !contract.flag.includes(`=== ${contract.version}`)) {
    fail(
      `CONSENT_ASK_FLAG_SCRIPT does not compare the stored version against CONSENT_VERSION (${contract.version}). A version bump\n` +
        `      exists to make every stored decision stale and ask again; a script that ignores it would keep the banner down.`,
    )
  }
  /*
   * THE SCRIPT IS RUN, NOT READ. A regex over the catch body cannot tell
   * `setAttribute(A,V)` from `setAttribute(A,'')`, and the first version of this
   * clause failed a correct tree for using a variable. Two executions settle
   * both directions in the space a pattern would have taken to describe one.
   */
  clauses += 1
  const askedWhen = (cookie) => {
    const attributes = new Map()
    const documentElement = {
      setAttribute: (name, value) => attributes.set(name, value),
      getAttribute: (name) => attributes.get(name) ?? null,
      removeAttribute: (name) => void attributes.delete(name),
      style: { setProperty: () => {}, removeProperty: () => {} },
    }
    const doc = { documentElement, getElementById: () => null }
    Object.defineProperty(doc, 'cookie', typeof cookie === 'function' ? { get: cookie } : { value: cookie })
    new Function('document', contract.flag)(doc)
    return attributes.get(contract.attr) === contract.value
  }
  const unreadable = askedWhen(() => {
    throw new Error('cookies are blocked in this context')
  })
  if (!unreadable) {
    fail(
      `CONSENT_ASK_FLAG_SCRIPT does not fall back to asking when the browser cannot be read. A browser this script\n` +
        `      cannot read has not been shown to have decided, so the failure direction is to ASK, never to stay silent.`,
    )
  }
  clauses += 1
  if (askedWhen(`${contract.cookie}=${contract.decided}`)) {
    fail(
      `CONSENT_ASK_FLAG_SCRIPT asks somebody who has already answered. The strip would be shown again to every\n` +
        `      visitor who has ever decided, which is the flash the old client-only shape existed to avoid.`,
    )
  }
  clauses += 1
  if (!askedWhen('other=1')) {
    fail(
      `CONSENT_ASK_FLAG_SCRIPT does not ask a visitor with no consent cookie at all, so nobody is ever asked and\n` +
        `      the platform quietly stops collecting consent while continuing to render the markup.`,
    )
  }
}

/* 5. Hidden by default in CSS, revealed only under the attribute the script sets. */
if (css !== null && contract !== null) {
  clauses += 1
  const hidden = new RegExp(`#${contract.id}\\s*\\{[^}]*display:\\s*none`).test(css)
  if (!hidden) {
    fail(
      `${CSS} does not hide #${contract.id} by default. Default hidden is what keeps the markup harmless with no\n` +
        `      JavaScript and for a visitor who has already answered: it is revealed, never hidden, by script.`,
    )
  }
  clauses += 1
  const revealed = new RegExp(`html\\[${contract.attr}=["']${contract.value}["']\\][^{]*#${contract.id}`).test(css)
  if (!revealed) {
    fail(`${CSS} has no rule revealing #${contract.id} under html[${contract.attr}="${contract.value}"], which is the attribute the pre-paint script sets.`)
  }
}

/* 6. The markup exists in exactly one place. Two copies is two banners on a screen. */
if (client !== null) {
  clauses += 1
  if (/<(p|button)[\s>]/.test(client)) {
    fail(
      `${CLIENT} renders banner markup (<p> or <button>). The deferred client component must render NOTHING and wire\n` +
        `      the server rendered strip instead, or the page shows two banners and the second one still arrives after hydration.`,
    )
  }
}

/* 7. The strip carries the intent attribute the bootstrap and the client both read. */
if (shell !== null && contract !== null) {
  clauses += 1
  const missing = [contract.refuse, contract.accept].filter((v) => !shell.includes(`${contract.intentAttr}="${v}"`))
  if (missing.length > 0) {
    fail(
      `${SHELL} has no ${contract.intentAttr}="${missing.join('" and no ' + contract.intentAttr + '="')}" control. The banner has two answers\n` +
        `      and both must be pressable before the deferred chunk lands. A refusal that cannot be pressed is worse than no banner.`,
    )
  }
}

console.log(
  `the-consent-banner-is-in-the-first-paint: did ${clauses} clause(s) checked across 5 file(s)` +
    (contract === null ? '' : `, contract id #${contract.id}, attribute ${contract.attr}="${contract.value}"`),
)
console.log(`the-consent-banner-is-in-the-first-paint: found ${faults.length} fault(s)`)

if (faults.length > 0) {
  console.error('')
  console.error('FAIL: the consent banner is not in the first paint.')
  for (const f of faults) console.error(`  - ${f}`)
  console.error('')
  console.error('A client-only banner mounted from the root layout became the LCP element on five of the thirteen')
  console.error('gated URLs and cost /events its performance floor (0.87 against 0.88). The strip is server rendered,')
  console.error('hidden by default, and revealed pre-paint by the cookie: see the header of this file for the')
  console.error('measurement and src/components/analytics/consent-banner-shell.tsx for the shape.')
  process.exit(1)
}

console.log('the-consent-banner-is-in-the-first-paint: PASS - the strip is in the server HTML and its reveal is decided before the first paint.')
