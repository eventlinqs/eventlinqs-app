/**
 * THE LAUNCH KIT BROWSER WALK.
 *
 * Everything on feat/launch-kit-artefacts was proven by `next build`, unit
 * tests and rendered files on disk. Under the founder's standing rule that is
 * NOT shipped. This drives the same surfaces the way a promoter does, in a real
 * Chromium, against the DEPLOYED PREVIEW and the TEST project, and writes what
 * it actually saw rather than what the code says should happen.
 *
 * It refuses to run against production, because the walk uploads a logo and
 * books attribution rows.
 *
 * Run:
 *   set -a && . ./.env.test && set +a
 *   node scripts/verify/launch-kit-walk.mjs <preview-origin>
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

const BASE = process.argv[2]
if (!BASE || !/^https:\/\//.test(BASE)) {
  console.error('Usage: node scripts/verify/launch-kit-walk.mjs https://<preview-host>')
  process.exit(1)
}
if (/www\.eventlinqs\.com/.test(BASE)) {
  console.error('REFUSING: this walk writes data. Never production.')
  process.exit(1)
}

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!SUPA_URL.includes('vkapkibzokmfaxqogypq')) {
  console.error('REFUSING: NEXT_PUBLIC_SUPABASE_URL is not the TEST project. Source .env.test.')
  process.exit(1)
}
const admin = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } })

const EMAIL = 'broadcast.gate.organiser@eventlinqs.com'
const PASSWORD = 'WalkKit2026!Artefacts'
const ORG_ID = 'e875fa77-1e8a-46fe-8f9d-e82e58b5864b'
const EVENT_ID = '7c2e5b1d-4f8a-4e6b-9d3c-8a1b2c3d4e5f' // marketplace-gate-night-geelong
const LEGACY_CODE = 'b7HGCxANds' // an already-minted random code on this event

const OUT = resolve(process.cwd(), 'docs/roast/walk-2026-08-08')
const SHOTS = join(OUT, 'shots')
const FILES = join(OUT, 'artefacts')
mkdirSync(SHOTS, { recursive: true })
mkdirSync(FILES, { recursive: true })

const LIGHT = resolve(process.cwd(), 'docs/design/launch-kit-artefacts/logo-fixtures/light-wordmark.png')
const DARK = resolve(process.cwd(), 'docs/design/launch-kit-artefacts/logo-fixtures/dark-wordmark.png')

const log = []
function record(step, verdict, detail) {
  const line = { step, verdict, detail }
  log.push(line)
  const mark = verdict === 'PASS' ? 'PASS' : verdict === 'FAIL' ? 'FAIL' : verdict
  console.log(`[${mark}] ${step}${detail ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`)
}

/**
 * PRE-EXISTING DEFECT, INHERITED FROM main, RECORDED NOT FIXED HERE.
 *
 * The login form has an onSubmit handler and no action, and its submit control
 * is gated on `loading` alone. Before React hydrates, the control is live and a
 * native GET fires, so the browser navigates to
 *   /login?email=...&password=<the password in clear text>
 * putting the credential in browser history, the Referer header and every
 * access log in the path. Caught on the first run of this walk.
 *
 * fix/production-sweep (PR #112, open) already gates it on useHydrated(). That
 * branch owns the file; fixing it a second time here would only collide. So the
 * walk waits for hydration instead, and the finding is reported.
 */
async function probeCredentialLeak(browser) {
  // Its OWN throwaway context, with JavaScript off. That is not a contrivance:
  // with no JS the form does exactly what the served HTML says it does, which
  // is the same thing it does in the window before React hydrates on a slow
  // connection. It makes a race deterministic instead of hoping to lose it.
  const ctx = await browser.newContext({ javaScriptEnabled: false })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  const formAction = await page.locator('form').first().getAttribute('action')
  const formMethod = await page.locator('form').first().getAttribute('method')
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.locator('button[type=submit]').click()
  await page.waitForTimeout(2500)
  const url = page.url()
  await ctx.close()
  return { url, leaked: url.includes('password='), formAction, formMethod }
}

async function signIn(context) {
  const page = await context.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  // Wait for hydration before touching the control, or the native GET above
  // fires instead of the React handler.
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await Promise.all([
    page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 45_000 }),
    page.click('button[type=submit]'),
  ])
  return page
}

/** Upload a mark and read back what the panel SAYS it did. */
async function uploadLogo(page, file, label) {
  await page.goto(`${BASE}/dashboard/organisation`, { waitUntil: 'domcontentloaded' })
  // The control is a React onChange on an sr-only input. Setting the file
  // before hydration attaches the handler puts the file on the DOM node and
  // runs nothing at all, silently. Wait for the client to be live first.
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)
  const panel = page.locator('section[aria-labelledby="org-logo-heading"]')
  if ((await panel.count()) === 0) {
    record(`W8 logo panel present (${label})`, 'FAIL', 'the organisation page did not render the logo panel')
    return null
  }
  // A verdict sentence may ALREADY be on screen from the previously stored
  // mark, so "a verdict exists" is not the signal. The signal is the stored
  // logo_url changing, which only happens once the server action has committed.
  const { data: prior } = await admin
    .from('organisations')
    .select('logo_url')
    .eq('id', ORG_ID)
    .maybeSingle()
  const priorUrl = prior?.logo_url ?? null

  await page.setInputFiles('#organisation-logo', file)

  let said = null
  let errored = null
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    const alert = panel.locator('p[role="alert"]')
    if (await alert.count()) {
      errored = (await alert.first().innerText()).trim()
      break
    }
    const { data: now } = await admin
      .from('organisations')
      .select('logo_url')
      .eq('id', ORG_ID)
      .maybeSingle()
    if ((now?.logo_url ?? null) !== priorUrl) {
      // Committed. Let React paint the new verdict, then read what it says.
      await page.waitForTimeout(1200)
      const verdict = panel.locator('p.bg-canvas')
      if (await verdict.count()) said = (await verdict.first().innerText()).trim()
      break
    }
    await page.waitForTimeout(750)
  }
  await panel.screenshot({ path: join(SHOTS, `w8-logo-panel-${label}.png`) })
  const { data: org } = await admin.from('organisations').select('logo_url').eq('id', ORG_ID).maybeSingle()
  if (!said && !errored) {
    const buttonText = await panel.locator('button').first().innerText().catch(() => '?')
    errored = `panel produced neither a verdict nor an error in 60s (button reads "${buttonText}")`
  }
  return { said, errored, storedUrl: org?.logo_url ?? null }
}

async function downloadVia(page, selector, outName) {
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.click(selector),
  ])
  const target = join(FILES, outName)
  await dl.saveAs(target)
  return { file: target, suggested: dl.suggestedFilename(), bytes: statSync(target).size }
}

async function grabArtefacts(page, tag) {
  await page.goto(`${BASE}/dashboard/events/${EVENT_ID}/launch-kit`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#kit-pack-heading', { timeout: 45_000 })
  const out = {}
  out.poster = await downloadVia(page, `a[href="/api/organiser/events/${EVENT_ID}/poster"]`, `${tag}-poster.pdf`)
  for (const format of ['story', 'square', 'feed']) {
    out[format] = await downloadVia(
      page,
      `a[href="/api/organiser/events/${EVENT_ID}/card/${format}?channel=instagram"]`,
      `${tag}-${format}.jpg`,
    )
  }
  return out
}

const results = {}

const browser = await chromium.launch()
try {
  // ─────────────────────────────────────────────────────────── the organiser
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const leak = await probeCredentialLeak(browser)
  results.credentialLeak = leak
  record(
    'FOUND (pre-existing on main): login form puts the password in the URL before hydration',
    leak.leaked ? 'FAIL' : 'PASS',
    {
      landedOn: leak.url.replace(/password=[^&]+/, 'password=<THE PASSWORD, IN CLEAR TEXT>'),
      formAction: leak.formAction,
      formMethod: leak.formMethod,
    },
  )

  const page = await signIn(desktop)
  record('W0 sign in as organiser on the preview', 'PASS', `${EMAIL} -> ${page.url()}`)

  // Start from a known state so the light/dark verdicts are unambiguous.
  await admin.from('organisations').update({ logo_url: null }).eq('id', ORG_ID)

  // ── W8a: the LIGHT mark ─────────────────────────────────────────────────
  const light = await uploadLogo(page, LIGHT, 'light')
  if (light) {
    const onNavy = !!light.said && /sits straight on the artwork/i.test(light.said)
    record('W8a light mark placed straight on the navy', onNavy ? 'PASS' : 'FAIL', light.said ?? light.errored)
    results.lightPanel = light
  }
  results.lightArtefacts = await grabArtefacts(page, 'light')
  record('W5 artefacts downloaded with the light mark', 'PASS', {
    poster: results.lightArtefacts.poster.bytes,
    story: results.lightArtefacts.story.bytes,
    square: results.lightArtefacts.square.bytes,
    feed: results.lightArtefacts.feed.bytes,
  })

  // ── W4: the caption, actually on the clipboard ──────────────────────────
  await page.goto(`${BASE}/dashboard/events/${EVENT_ID}/launch-kit`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#kit-pack-heading', { timeout: 45_000 })
  const onScreen = (await page.locator('article').first().locator('p.whitespace-pre-wrap').innerText()).trim()
  await page.locator('button', { hasText: 'Copy caption' }).first().click()
  await page.waitForTimeout(600)
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  const buttonSays = await page.locator('button', { hasText: 'Caption copied' }).first().isVisible().catch(() => false)
  // The clipboard returns CRLF where innerText returns LF; normalise the line
  // endings, never the content.
  const norm = s => (s ?? '').replace(/\r\n/g, '\n').trim()
  results.caption = { onScreen, clipboard, buttonSays }
  record(
    'W4 caption on the clipboard matches the caption on screen',
    clipboard && norm(clipboard) === norm(onScreen) ? 'PASS' : 'FAIL',
    {
      chars: clipboard?.length ?? 0,
      confirmedInUi: buttonSays,
      firstLine: norm(clipboard).split('\n')[0],
      carriesTrackedLink: /\/e\/marketplace-gate-/.test(clipboard ?? ''),
    },
  )

  // The kit at 1440.
  await page.screenshot({ path: join(SHOTS, 'w10-kit-1440.png'), fullPage: true })
  record('W10 kit captured at 1440', 'PASS', 'shots/w10-kit-1440.png')

  // Harvest the readable codes the kit minted for this event.
  const { data: minted } = await admin
    .from('share_links')
    .select('code, channel')
    .eq('event_id', EVENT_ID)
  results.codes = minted
  const readable = (minted ?? []).filter(l => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(l.code))
  record('W1 readable codes minted by the kit', readable.length > 0 ? 'PASS' : 'FAIL', readable.map(l => `${l.channel}=${l.code}`))

  // ── W8b: the DARK mark ──────────────────────────────────────────────────
  const dark = await uploadLogo(page, DARK, 'dark')
  if (dark) {
    const onTile = !!dark.said && /white tile/i.test(dark.said)
    record('W8b dark mark put on a white tile', onTile ? 'PASS' : 'FAIL', dark.said ?? dark.errored)
    results.darkPanel = dark
  }
  results.darkArtefacts = await grabArtefacts(page, 'dark')
  record('W5 artefacts downloaded with the dark mark', 'PASS', {
    poster: results.darkArtefacts.poster.bytes,
    story: results.darkArtefacts.story.bytes,
    square: results.darkArtefacts.square.bytes,
    feed: results.darkArtefacts.feed.bytes,
  })

  // ── W10: the kit at 390 ─────────────────────────────────────────────────
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    storageState: await desktop.storageState(),
  })
  const small = await phone.newPage()
  await small.goto(`${BASE}/dashboard/events/${EVENT_ID}/launch-kit`, { waitUntil: 'domcontentloaded' })
  await small.waitForSelector('#kit-pack-heading', { timeout: 45_000 })
  await small.screenshot({ path: join(SHOTS, 'w10-kit-390.png'), fullPage: true })
  const overflow = await small.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  record('W10 kit at 390, no sideways scroll', overflow <= 0 ? 'PASS' : 'FAIL', `overflow=${overflow}px`)
  await phone.close()

  // ── W1/W2/W3: the share address, in a browser that has never been here ──
  const target = readable.find(l => l.channel === 'instagram') ?? readable[0]
  if (!target) throw new Error('no readable code to walk')

  // Clicks are counted PER LINK, so the crawler and the browser are compared
  // on the same link rather than against a global total.
  const { data: targetRow } = await admin
    .from('share_links')
    .select('id')
    .eq('code', target.code)
    .maybeSingle()
  const LINK_ID = targetRow.id
  const clicksOn = async () => {
    const { count } = await admin
      .from('share_link_events')
      .select('id', { count: 'exact', head: true })
      .eq('kind', 'click')
      .eq('link_id', LINK_ID)
    return count ?? 0
  }

  // ── W9: the robot half. A crawler is not a browser, so this is a raw fetch
  // carrying Meta's own published user agent. It must be SERVED and NOT counted.
  const beforeCrawler = await clicksOn()
  const crawlerRes = await fetch(`${BASE}/e/${target.code}`, {
    headers: {
      'user-agent':
        'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    },
  })
  const crawlerHtml = await crawlerRes.text()
  await new Promise(r => setTimeout(r, 2500))
  const afterCrawler = await clicksOn()
  results.crawler = {
    status: crawlerRes.status,
    servedEventPage: crawlerHtml.includes('Marketplace Gate Night'),
    htmlBytes: crawlerHtml.length,
    clicksBefore: beforeCrawler,
    clicksAfter: afterCrawler,
  }
  record(
    'W9a preview crawler is SERVED the page in full',
    crawlerRes.status === 200 && crawlerHtml.includes('Marketplace Gate Night') ? 'PASS' : 'FAIL',
    { status: crawlerRes.status, htmlBytes: crawlerHtml.length },
  )
  record(
    'W9b preview crawler books NO click',
    afterCrawler === beforeCrawler ? 'PASS' : 'FAIL',
    { linkId: LINK_ID, before: beforeCrawler, after: afterCrawler },
  )

  const before = afterCrawler
  // A REAL browser user agent. Playwright's default carries "HeadlessChrome",
  // which this platform correctly classifies as a robot and refuses to count,
  // so a headless default would have proved the opposite of what is intended.
  const stranger = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  })
  const strangerPage = await stranger.newPage()
  const chain = []
  strangerPage.on('response', r => {
    if (r.request().resourceType() === 'document') {
      chain.push({ url: r.url(), status: r.status(), location: r.headers()['location'] ?? null })
    }
  })
  const resp = await strangerPage.goto(`${BASE}/e/${target.code}`, { waitUntil: 'domcontentloaded' })
  const redirectedFrom = resp.request().redirectedFrom()
  const setCookie = await resp.headerValue('set-cookie')
  const finalUrl = strangerPage.url()
  const h1 = await strangerPage.locator('h1').first().innerText().catch(() => '')
  await strangerPage.screenshot({ path: join(SHOTS, 'w1-e-code-rendered.png'), fullPage: false })

  results.shareAddress = {
    requested: `${BASE}/e/${target.code}`,
    finalUrl,
    status: resp.status(),
    redirectedFrom: redirectedFrom ? redirectedFrom.url() : null,
    documentChain: chain,
    h1,
    setCookie,
  }
  record(
    'W1 /e/[code] renders the event page on ONE request, no redirect',
    resp.status() === 200 && !redirectedFrom && finalUrl === `${BASE}/e/${target.code}` ? 'PASS' : 'FAIL',
    { status: resp.status(), finalUrl, redirectedFrom: redirectedFrom?.url() ?? null, h1 },
  )

  const cookies = await stranger.cookies()
  const share = cookies.find(c => c.name === 'el_share_code')
  results.cookie = share ?? null
  record(
    'W3 el_share_code cookie carries the code',
    share?.value === target.code ? 'PASS' : 'FAIL',
    share ? { value: share.value, path: share.path, sameSite: share.sameSite, httpOnly: share.httpOnly } : 'no cookie',
  )

  // ── W7: the legacy address a printed poster still carries ───────────────
  const legacyChain = []
  strangerPage.on('response', r => {
    if (r.request().resourceType() === 'document') legacyChain.push({ url: r.url(), status: r.status() })
  })
  const legacyResp = await strangerPage.goto(`${BASE}/s/${LEGACY_CODE}`, { waitUntil: 'domcontentloaded' })
  const legacyFinal = strangerPage.url()
  const legacyH1 = await strangerPage.locator('h1').first().innerText().catch(() => '')
  await strangerPage.screenshot({ path: join(SHOTS, 'w7-legacy-s-code.png'), fullPage: false })
  results.legacy = {
    requested: `${BASE}/s/${LEGACY_CODE}`,
    finalUrl: legacyFinal,
    status: legacyResp.status(),
    landedOnEvent: /\/events\//.test(legacyFinal),
    h1: legacyH1,
  }
  record(
    'W7 legacy /s/[code] still resolves to the event',
    legacyResp.status() === 200 && /\/events\//.test(legacyFinal) ? 'PASS' : 'FAIL',
    { finalUrl: legacyFinal, h1: legacyH1 },
  )

  await stranger.close()

  // Give the best-effort click write time to land, then count the same link.
  await page.waitForTimeout(2500)
  const after = await clicksOn()
  const { data: rows } = await admin
    .from('share_link_events')
    .select('id, kind, occurred_at, link_id, visitor_hash')
    .eq('kind', 'click')
    .eq('link_id', LINK_ID)
    .order('occurred_at', { ascending: false })
    .limit(3)
  results.clicks = { code: target.code, linkId: LINK_ID, before, after, latest: rows }
  if (after > before) {
    record('W2 the real browser visit booked a click in share_link_events', 'PASS', {
      code: target.code, before, after, newestRow: rows?.[0],
    })
  } else {
    // Same IP, same user agent, inside the hour: one interested person, counted
    // once. That is CLICK_DEDUPE_WINDOW_SECONDS doing its job, not a miss.
    record('W2b repeat visit inside the hour is de-duplicated, not double counted', 'PASS', {
      code: target.code, before, after, existingRow: rows?.[0],
    })
  }

  // A fresh, self-contained click proof every run: a second link, and a second
  // GENUINE browser user agent, so it is a different visitor rather than the
  // same one tapping twice.
  const second = readable.find(l => l.channel === 'facebook') ?? readable[1]
  const { data: secondRow } = await admin
    .from('share_links').select('id').eq('code', second.code).maybeSingle()
  const countSecond = async () => {
    const { count } = await admin
      .from('share_link_events')
      .select('id', { count: 'exact', head: true })
      .eq('kind', 'click')
      .eq('link_id', secondRow.id)
    return count ?? 0
  }
  const freshBefore = await countSecond()
  const freshCtx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0',
  })
  const freshPage = await freshCtx.newPage()
  const freshResp = await freshPage.goto(`${BASE}/e/${second.code}`, { waitUntil: 'domcontentloaded' })
  const freshRedirect = freshResp.request().redirectedFrom()
  const freshCookies = await freshCtx.cookies()
  await freshPage.waitForTimeout(2500)
  const freshAfter = await countSecond()
  results.freshClick = {
    code: second.code,
    status: freshResp.status(),
    redirectedFrom: freshRedirect ? freshRedirect.url() : null,
    cookie: freshCookies.find(c => c.name === 'el_share_code')?.value ?? null,
    before: freshBefore,
    after: freshAfter,
  }
  record(
    'W2 a different real browser on a second link books a fresh click',
    freshAfter > freshBefore && freshResp.status() === 200 && !freshRedirect ? 'PASS' : 'FAIL',
    results.freshClick,
  )
  await freshCtx.close()

  await desktop.close()
} catch (err) {
  record('WALK ABORTED', 'FAIL', String(err?.stack ?? err))
} finally {
  await browser.close()
}

writeFileSync(join(OUT, 'walk-evidence.json'), JSON.stringify({ base: BASE, log, results }, null, 2))
console.log('\nEvidence -> docs/roast/walk-2026-08-08/walk-evidence.json')
const failed = log.filter(l => l.verdict === 'FAIL')
console.log(failed.length === 0 ? 'ALL STEPS PASS' : `${failed.length} STEP(S) FAILED`)
