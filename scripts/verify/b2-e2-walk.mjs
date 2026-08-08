/**
 * B2 (the four zeros) and E2 (images and video), walked in a real browser
 * against the deployed preview and the TEST project.
 *
 * Run:
 *   set -a && . ./.env.test && set +a
 *   node scripts/verify/b2-e2-walk.mjs https://<preview-host>
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

const BASE = process.argv[2]
if (!BASE || /www\.eventlinqs\.com/.test(BASE)) {
  console.error('Usage: node scripts/verify/b2-e2-walk.mjs https://<preview-host>  (never production)')
  process.exit(1)
}
if (!(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').includes('vkapkibzokmfaxqogypq')) {
  console.error('REFUSING: not the TEST project. Source .env.test.')
  process.exit(1)
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const EMAIL = 'broadcast.gate.organiser@eventlinqs.com'
const PASSWORD = 'WalkKit2026!Artefacts'
/** Zero reach: the only event on this org with no share_link_events at all. */
const ZERO_EVENT = 'b865b222-9af7-4433-9d08-53562eab6cc3'
const ZERO_SLUG = 'marketplace-regression-comedy-free-night-at-waterf-q5758z'

const OUT = resolve(process.cwd(), 'docs/roast/walk-2026-08-08')
const SHOTS = join(OUT, 'shots')
mkdirSync(SHOTS, { recursive: true })

const log = []
const record = (step, verdict, detail) => {
  log.push({ step, verdict, detail })
  console.log(`[${verdict}] ${step}${detail ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`)
}

async function signIn(context) {
  const page = await context.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
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

const results = {}
const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await signIn(ctx)

  // ── B2: the launch kit at true zero ──────────────────────────────────────
  await page.goto(`${BASE}/dashboard/events/${ZERO_EVENT}/launch-kit`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#kit-reach-heading', { timeout: 45_000 })
  const reachPanel = page.locator('section[aria-labelledby="kit-reach-heading"]')
  // innerText returns what is PAINTED, and the eyebrow and the measure chips
  // are CSS-uppercased, so every comparison here is case-insensitive.
  const kitText = (await reachPanel.innerText()).toLowerCase()
  // The old failure shape: four separate tiles each reading exactly "0".
  const zeroTiles = await reachPanel.locator('p.font-display.text-3xl').allInnerTexts()
  const hasEmptyState = kitText.includes('nothing has travelled yet')
  await reachPanel.screenshot({ path: join(SHOTS, 'b2-kit-empty-1440.png') })
  results.kitZero = { hasEmptyState, zeroTiles, teaches: kitText.includes('close estimate') }
  record('B2 kit at true zero shows the empty state, not four zeros', hasEmptyState && zeroTiles.length === 0 ? 'PASS' : 'FAIL', {
    emptyState: hasEmptyState,
    bigNumberTiles: zeroTiles,
  })
  record('B2 the empty state teaches which measures are hard', kitText.includes('measured') && kitText.includes('close estimate') ? 'PASS' : 'FAIL',
    { measured: kitText.includes('measured'), estimate: kitText.includes('close estimate') })
  const ctas = await reachPanel.locator('a').allInnerTexts()
  record('B2 the empty state offers a next step', ctas.some(c => /Send it everywhere/.test(c)) ? 'PASS' : 'FAIL', ctas.map(c => c.trim()).filter(Boolean))

  // ── B2: the full reach panel at true zero ────────────────────────────────
  await page.goto(`${BASE}/dashboard/events/${ZERO_EVENT}/reach`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  const reachText = (
    await page.locator('main').innerText().catch(() => page.locator('body').innerText())
  ).toLowerCase()
  await page.screenshot({ path: join(SHOTS, 'b2-reach-empty-1440.png'), fullPage: true })
  const tableGone = !reachText.includes('no tracked activity yet')
  record('B2 full reach panel shows one empty state, not two', reachText.includes('nothing has travelled yet') && tableGone ? 'PASS' : 'FAIL',
    { emptyState: reachText.includes('nothing has travelled yet'), oldTableEmptyRowGone: tableGone })

  // ── B2 at 390 ────────────────────────────────────────────────────────────
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    storageState: await ctx.storageState(),
  })
  const small = await phone.newPage()
  await small.goto(`${BASE}/dashboard/events/${ZERO_EVENT}/launch-kit`, { waitUntil: 'domcontentloaded' })
  await small.waitForSelector('#kit-reach-heading', { timeout: 45_000 })
  await small.locator('section[aria-labelledby="kit-reach-heading"]').screenshot({ path: join(SHOTS, 'b2-kit-empty-390.png') })
  const overflow = await small.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  record('B2 empty state at 390, no sideways scroll', overflow <= 0 ? 'PASS' : 'FAIL', `overflow=${overflow}px`)
  await phone.close()

  // ── E2: video. A real provider link, saved through the real parse path. ──
  const { data: before } = await admin
    .from('events').select('video_url, video_provider').eq('id', ZERO_EVENT).maybeSingle()
  results.videoBefore = before

  // The parse path is the server action's; drive it the way an organiser does,
  // by saving the field on the edit form.
  await page.goto(`${BASE}/dashboard/events/${ZERO_EVENT}/edit`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2500)

  // The media step is step 4 of the wizard, so the field does not exist in the
  // DOM until the organiser walks there. Walk there.
  const videoField = page.locator('#event-video-url')
  for (let step = 0; step < 6 && (await videoField.count()) === 0; step += 1) {
    const next = page.locator('button', { hasText: /^(Next|Continue)/i }).first()
    if ((await next.count()) === 0) break
    await next.click()
    await page.waitForTimeout(1200)
  }
  const fieldFound = (await videoField.count()) > 0
  if (fieldFound) {
    const wiring = await videoField.evaluate(el => ({
      id: el.id,
      name: el.getAttribute('name'),
      labelledBy: document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim().slice(0, 40) ?? null,
    }))
    results.videoFieldWiring = wiring
    record('E2 the video field is programmatically labelled', wiring.labelledBy && wiring.name ? 'PASS' : 'FAIL', wiring)
  }
  record('E2 the organiser has a video field on the edit form', fieldFound ? 'PASS' : 'FAIL',
    fieldFound ? 'input[name=video_url] present' : 'no video field found on the edit form')
  results.videoFieldFound = fieldFound

  if (fieldFound) {
    await videoField.first().fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    // The parse feedback is client side and immediate: read it before saving,
    // because that sentence is the organiser's only confirmation the link was
    // understood.
    await page.waitForTimeout(1200)
    const parseNote = await page
      .locator('#event-video-url-state')
      .innerText()
      .catch(() => null)
    results.videoParseNote = parseNote
    record('E2 the form tells the organiser the link was understood', /video linked/i.test(parseNote ?? '') ? 'PASS' : 'FAIL', parseNote)

    // "Save Changes" ONLY. The first pass matched "Save as Draft" as well, and
    // that control does what it says: it unpublished a published event mid
    // walk. Recorded rather than quietly corrected, because a verification
    // script that mutates the thing it is verifying is its own defect.
    const save = page.locator('button', { hasText: /^Save Changes/i }).first()
    for (let step = 0; step < 6 && (await save.count()) === 0; step += 1) {
      const next = page.locator('button', { hasText: /^(Next|Continue)/i }).first()
      if ((await next.count()) === 0) break
      await next.click()
      await page.waitForTimeout(1200)
    }
    await save.click()
    await page.waitForTimeout(8000)
    const { data: after } = await admin
      .from('events').select('video_url, video_provider').eq('id', ZERO_EVENT).maybeSingle()
    results.videoAfter = after
    record('E2 a pasted provider link is parsed to a canonical embed and stored',
      after?.video_provider === 'youtube' && /youtube(-nocookie)?\.com\/embed\//.test(after?.video_url ?? '') ? 'PASS' : 'FAIL', after)

    // And it must actually render on the public page.
    // The event page is ISR at revalidate=300, so a just-saved video may not be
    // in the served HTML yet. Poll for it rather than declaring a defect.
    const pub = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const pubPage = await pub.newPage()
    let facade = null
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await pubPage.goto(`${BASE}/events/${ZERO_SLUG}?cb=${attempt}`, { waitUntil: 'domcontentloaded' })
      await pubPage.waitForTimeout(2000)
      const candidate = pubPage.locator('button', { has: pubPage.locator('img') }).filter({ hasText: /play|watch/i })
      const anyPlay = (await candidate.count()) > 0 ? candidate : pubPage.locator('[aria-label*="Play" i], button[aria-label*="video" i]')
      if ((await anyPlay.count()) > 0) { facade = anyPlay.first(); break }
      await pubPage.waitForTimeout(28_000)
    }
    results.videoFacadeFound = !!facade

    // THE POINT OF THE FACADE: no provider iframe and no provider script before
    // the visitor asks for one. Assert that BEFORE clicking.
    const iframesBefore = await pubPage.locator('iframe').count()
    record('E2 no provider iframe loads before the visitor asks for it', iframesBefore === 0 ? 'PASS' : 'FAIL',
      { iframesOnFirstPaint: iframesBefore })

    if (facade) {
      await facade.click()
      await pubPage.waitForTimeout(2500)
      const iframes = await pubPage.locator('iframe').evaluateAll(els =>
        els.map(e => ({ src: e.getAttribute('src'), sandbox: e.getAttribute('sandbox'), allow: e.getAttribute('allow') })))
      results.publicIframes = iframes
      const embed = iframes.find(f => /youtube-nocookie\.com\/embed\//.test(f.src ?? ''))
      await pubPage.screenshot({ path: join(SHOTS, 'e2-video-on-event-page.png'), fullPage: false })
      record('E2 clicking play loads the canonical, sandboxed provider embed', embed ? 'PASS' : 'FAIL', embed ?? iframes)
    } else {
      await pubPage.screenshot({ path: join(SHOTS, 'e2-video-on-event-page.png'), fullPage: false })
      record('E2 the video facade appears on the public event page', 'FAIL',
        'no play control found within the ISR revalidate window')
    }
    await pub.close()
  }

  // ── E2: what the artefacts do with the organiser's other images ──────────
  const { data: ev } = await admin
    .from('events').select('cover_image_url, gallery_urls').eq('id', ZERO_EVENT).maybeSingle()
  results.media = {
    cover: !!ev?.cover_image_url,
    galleryCount: Array.isArray(ev?.gallery_urls) ? ev.gallery_urls.length : 0,
  }
  record('E2 media state on this event', 'INFO', results.media)

  await ctx.close()
} catch (err) {
  record('B2/E2 WALK ABORTED', 'FAIL', String(err?.stack ?? err))
} finally {
  await browser.close()
}

writeFileSync(join(OUT, 'b2-e2-evidence.json'), JSON.stringify({ base: BASE, log, results }, null, 2))
const failed = log.filter(l => l.verdict === 'FAIL')
console.log(`\nEvidence -> docs/roast/walk-2026-08-08/b2-e2-evidence.json`)
console.log(failed.length === 0 ? 'ALL STEPS PASS' : `${failed.length} STEP(S) FAILED`)
