/**
 * THE CLAIM AS ACCEPTANCE ON TEST, THROUGH THE PAGES THEMSELVES (the engine plan of 28 October 2026, part D, window 2).
 *
 *   scripts\ops\with-supabase-token.ps1 node --env-file=<a TEST env file> scripts/verify/claim-acceptance-drive.mjs <out dir> [--port=3343]
 *
 * It serves this tree against TEST (webpack, as submit-event-drive.mjs does) with scripts/verify/lib/capture-resend.mjs
 * loaded first, so the claim's code email runs through the product's own send path and is captured on this machine:
 * NO EMAIL IS SENT. Claims are switched on for TEST alone for the drive and put back as found.
 *
 * As a claimant account it makes, on a curated TEST venue with a published address, regular nights and nights to come:
 * photographs the claim page at 390, 768 and 1440 (each fits its width) and reads the project manager's words and the
 * masked address; at 390 sends the code, reads it from the capture (one email, to the venue's own address), ticks
 * the permission and the authority, confirms; reads the database: the claim verified, exactly one yes with the line
 * word for word and channel claim, the venue moved; uploads a photo it makes and reads the asset register's row
 * (organiser authorised, pending, the yes as its permission, its original file); skips on, pauses one regular night,
 * finishes and reads the series paused and the done line; then on /dashboard/organisation/media at 1440, 768 and 390
 * sees the image drawn, withdraws it (row withdrawn, file gone from the bucket), withdraws the yes (row withdrawn) and
 * gives it again with the same two ticks (a new current yes citing the claim).
 * In its finally it puts the venue, its series and nights back, removes every row it made through
 * claim-acceptance-drive-cleanup.sql and the account, and reads them back gone. TEST only: it refuses any other database.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync, statfsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { tearDownAccount } from './lib/teardown-account.mjs'

const TEST_REF = 'vkapkibzokmfaxqogypq'
assertNotProduction()
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const token = process.env.SUPABASE_ACCESS_TOKEN ?? ''
if (!url.includes(TEST_REF) || !(process.env.NEXT_PUBLIC_SUPABASE_URL_PREVIEW ?? url).includes(TEST_REF)) {
  console.error('claim-acceptance-drive runs on TEST only')
  process.exit(2)
}
if (!token) {
  console.error('claim-acceptance-drive needs SUPABASE_ACCESS_TOKEN for its cleanup: run it through scripts\\ops\\with-supabase-token.ps1')
  process.exit(2)
}
// The engine plan's rule: no dev server under 10 GB free.
const free = statfsSync(process.cwd()).bavail * statfsSync(process.cwd()).bsize
if (free < 10 * 1024 ** 3) {
  console.error(`claim-acceptance-drive refused: ${(free / 1024 ** 3).toFixed(1)} GB free, under the 10 GB a dev server needs`)
  process.exit(2)
}
const out = resolve(process.argv[2] ?? 'evidence-claim-acceptance')
const PORT = Number((process.argv.find((a) => a.startsWith('--port=')) ?? '--port=3343').slice(7))
const BASE = `http://localhost:${PORT}`
mkdirSync(out, { recursive: true })
const capture = join(out, 'mail-capture.jsonl')
writeFileSync(capture, '')

const db = createClient(url, key, { auth: { persistSession: false } })
let fails = 0
const check = (name, ok, seen = null) => {
  if (!ok) fails += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: ${JSON.stringify(seen)}`}`)
}
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
/** As src/lib/venues/venue-slug.ts venueSlugify: the venue page's own handle. */
const slugify = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
const PERMISSION_WORDS = "Yes, you're welcome to use our event promotional material for EventLinqs listings and social posts, now and for future events."

/** One SQL text as postgres on TEST, through the Management API (the cleanup; the service role holds no delete). */
async function sqlOnTest(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${TEST_REF}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  return { status: r.status, body: await r.text() }
}

const stamp = Date.now().toString(36)
const photoFile = join(out, 'drive-photo.jpg')
let server = null
let browser = null
let userId = null
let snapshot = null
let flagWas = null
let flagTouched = false
let storedPath = null
try {
  /* ---- a curated venue to claim: published address, regular nights, nights to come ---- */
  const { data: venues } = await db
    .from('venues')
    .select('id, name, organisation_id, listing_source, claimed_at, published_email')
    .eq('listing_source', 'eventlinqs')
    .is('claimed_at', null)
    .is('removed_at', null)
    .eq('is_active', true)
    .not('published_email', 'is', null)
    .order('id')
  let venue = null
  let series = []
  let nights = []
  for (const v of venues ?? []) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.published_email ?? '')) continue
    const { data: s } = await db.from('event_series').select('id, name, organisation_id, listing_source, status').eq('venue_id', v.id).eq('status', 'active')
    if (!s?.length) continue
    const { data: e } = await db.from('events').select('id, organisation_id').in('listing_series_id', s.map((x) => x.id)).gte('start_date', new Date().toISOString())
    if (!e?.length) continue
    venue = v
    series = s
    nights = e
    break
  }
  if (!venue) throw new Error('TEST holds no curated venue with a published address, regular nights and nights to come')
  snapshot = {
    venue: { id: venue.id, organisation_id: venue.organisation_id, listing_source: venue.listing_source, claimed_at: venue.claimed_at },
    series: (await db.from('event_series').select('id, organisation_id, listing_source, status').eq('venue_id', venue.id)).data,
    events: (await db.from('events').select('id, organisation_id').in('listing_series_id', series.map((x) => x.id))).data,
  }
  writeFileSync(join(out, 'snapshot.json'), JSON.stringify(snapshot, null, 2))
  console.log(`VENUE ${venue.name} (${venue.id}), ${series.length} regular night(s), ${nights.length} night(s) to come`)

  /* ---- claims on, for TEST alone, put back as found in the finally ---- */
  flagWas = (await db.from('feature_flags').select('enabled').eq('flag', 'listing_claims').maybeSingle()).data?.enabled ?? null
  const flagged =
    flagWas === null
      ? await db.from('feature_flags').insert({ flag: 'listing_claims', enabled: true, description: 'Window 2 claim drive, removed when it ends' })
      : await db.from('feature_flags').update({ enabled: true }).eq('flag', 'listing_claims')
  if (flagged.error) throw new Error(`switch claims on for TEST: ${flagged.error.message}`)
  flagTouched = true

  /* ---- the claimant ---- */
  const email = `w2-claimant-${stamp}@eventlinqs.test`
  const password = `${randomUUID()}Aa1`
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (made.error) throw new Error(`create the TEST claimant: ${made.error.message}`)
  userId = made.data.user.id
  console.log(`MADE claimant ${userId}`)
  await db.from('profiles').upsert({ id: userId, email, full_name: 'Window 2 claim drive', display_name: 'Window 2 claim drive', is_verified: true })

  /* ---- a photo of its own, so nothing borrowed is sent ---- */
  const w = 1600
  const h = 1000
  const raw = Buffer.alloc(w * h * 3)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3
    raw[i] = 40
    raw[i + 1] = Math.round((x / w) * 180)
    raw[i + 2] = Math.round((y / h) * 200)
  }
  await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 85 }).toFile(photoFile)

  /* ---- the server: this tree, against TEST, email captured ---- */
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '-p', String(PORT)], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DRIVE_MAIL_CAPTURE: capture,
      // Never the real key: every send is captured, and a placeholder cannot reach anyone if one slipped past.
      RESEND_API_KEY: 're_capture_only',
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import ./scripts/verify/lib/capture-resend.mjs`.trim(),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let serverLog = ''
  server.stdout.on('data', (d) => (serverLog += d))
  server.stderr.on('data', (d) => (serverLog += d))
  const handle = slugify(venue.name)
  const claimPath = `/venues/${handle}/claim`
  /*
   * The server caches listing_claims for FEATURE_FLAG_CACHE_TTL_SECONDS (src/lib/flags/broadcast.ts) and this process
   * cannot invalidate that cache, so the drive asks the server instead of guessing: the claim page answers notFound()
   * while the switch it reads is off, so it is waited on until it answers 200 (the server's first compile counts in
   * the same budget). The start and check actions read the same cached key through the same resolver.
   */
  async function waitForFlagToLand() {
    const deadline = Date.now() + 360_000
    for (;;) {
      const status = await fetch(`${BASE}${claimPath}`, { redirect: 'manual' }).then((r) => r.status, () => null)
      if (status === 200) {
        console.log(`listing_claims has landed: ${claimPath} answers 200`)
        return
      }
      if (Date.now() > deadline) {
        throw new Error(`after 360s ${claimPath} answers ${status ?? 'nothing'}: the server is not up, or its cached listing_claims still reads off`)
      }
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
  try {
    await waitForFlagToLand()
  } finally {
    writeFileSync(join(out, 'server.log'), serverLog)
  }

  browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-AU' })
  const page = await context.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 300000 })
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('form button[type="submit"]').first().click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 180000 }).catch(() => {})
  check('the TEST claimant signed in', !new URL(page.url()).pathname.startsWith('/login'), page.url())

  /* ---- the claim page at three widths, in the project manager's words ---- */
  const masked = `${venue.published_email.trim().toLowerCase().charAt(0)}***@${venue.published_email.trim().toLowerCase().split('@')[1]}`
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 })
    await page.goto(`${BASE}${claimPath}`, { waitUntil: 'load', timeout: 300000 })
    const text = await page.locator('main, body').first().innerText()
    const overflow = await fits(page)
    await page.screenshot({ path: join(out, `claim-${width}.png`), fullPage: true })
    check(
      `at ${width} the claim page reads "${venue.name} is on EventLinqs. Claim it free.", the two minutes line and the masked address, and fits (overflow ${overflow}px)`,
      text.includes(`${venue.name} is on EventLinqs. Claim it free.`) &&
        text.includes('Takes two minutes. You keep your own tickets and booking page.') &&
        text.includes(`We'll send a 6-digit code to ${masked}, the address on your website.`) &&
        !text.includes(venue.published_email) &&
        overflow <= 0,
      { overflow },
    )
  }

  /* ---- send the code (390), read it from the capture ---- */
  await page.locator('input[name="name"]').fill('Window 2 Drive')
  await page.locator('input[name="role"]').fill('Manager')
  await page.getByRole('button', { name: 'Send my code' }).click()
  await page.getByText('Enter your code').waitFor({ timeout: 300000 })
  const mails = readFileSync(capture, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  const code = /code is (\d{6})/.exec(mails[0]?.body?.text ?? '')?.[1]
  check(
    'one code email, to the venue\'s own published address, captured on this machine and never sent',
    mails.length === 1 && [mails[0].body?.to].flat()[0] === venue.published_email.trim().toLowerCase() && Boolean(code),
    { count: mails.length, to: mails[0]?.body?.to },
  )
  await page.screenshot({ path: join(out, 'code-step-390.png'), fullPage: true })
  const codeText = await page.locator('form').first().innerText()
  check(
    'the code step carries tick 1 word for word and tick 2 in the venue words',
    codeText.includes(PERMISSION_WORDS) && codeText.includes('I run this venue or act for it, and I can give this permission.'),
    codeText.slice(0, 400),
  )
  await page.locator('input[name="code"]').fill(code ?? '')
  await page.locator('input[name="permission"]').check()
  await page.locator('input[name="authority"]').check()
  await page.getByRole('button', { name: 'Confirm' }).click()
  await page.getByText('Add your posters or photos').waitFor({ timeout: 300000 })

  /* ---- what the database holds after the right code ---- */
  const claim = (await db.from('listing_claims').select('id, status, target_organisation_id').eq('claimant_user_id', userId).single()).data
  const yeses = (await db.from('organiser_permissions').select('id, wording, scope, channel, claim_id, organisation_id, host_name').eq('logged_by', userId)).data ?? []
  const moved = (await db.from('venues').select('organisation_id, listing_source, claimed_at').eq('id', venue.id).single()).data
  check('the claim verified and the venue moved to the claimant\'s organisation', claim?.status === 'verified' && moved?.organisation_id === claim?.target_organisation_id && moved?.listing_source === 'organiser', { claim, moved })
  check(
    'the claim wrote exactly one yes, word for word, now and for future events, channel claim, citing the claim',
    yeses.length === 1 && yeses[0].wording === PERMISSION_WORDS && yeses[0].scope === 'current_and_future' && yeses[0].channel === 'claim' && yeses[0].claim_id === claim?.id,
    yeses,
  )

  /* ---- upload a photo for the first night ---- */
  await page.screenshot({ path: join(out, 'upload-step-390.png'), fullPage: true })
  await page.locator('select[name="eventId"]').selectOption({ index: 1 })
  await page.locator('input[name="file"]').setInputFiles(photoFile)
  await page.getByRole('button', { name: 'Upload' }).click()
  await page.getByText('Added. Our team checks each image before it is used.').waitFor({ timeout: 300000 })
  const asset = (await db.from('social_assets').select('id, asset_state, approval_status, permission_id, original_file, asset_url, withdrawal_status').eq('created_by', userId).single()).data
  storedPath = asset?.asset_url?.split('/organiser-media/')[1] ?? null
  check(
    'the photo is in the register as organiser authorised, pending a person, under the yes, with its original file',
    asset?.asset_state === 'organiser_authorised' && asset?.approval_status === 'pending' && asset?.permission_id === yeses[0]?.id && asset?.original_file === 'drive-photo.jpg' && Boolean(storedPath),
    asset,
  )

  /* ---- regular nights: pause the first, finish ---- */
  await page.getByRole('button', { name: 'Skip for now' }).click()
  await page.getByText('Your regular nights').waitFor({ timeout: 60000 })
  await page.screenshot({ path: join(out, 'nights-step-390.png'), fullPage: true })
  const boxes = page.getByLabel('Keep listing these automatically')
  check(`every regular night starts on (${series.length})`, (await boxes.count()) === series.length && (await boxes.first().isChecked()), await boxes.count())
  await boxes.first().uncheck()
  await page.getByRole('button', { name: 'Finish' }).click()
  await page.getByText("That's it.").waitFor({ timeout: 120000 })
  const paused = (await db.from('event_series').select('id, status').eq('venue_id', venue.id).eq('status', 'paused')).data ?? []
  await page.screenshot({ path: join(out, 'done-390.png'), fullPage: true })
  check('the unticked regular night is paused, the rest keep listing', paused.length === 1, paused)

  /* ---- the organiser's media page at three widths; withdraw the image, then the yes ---- */
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 })
    await page.goto(`${BASE}/dashboard/organisation/media`, { waitUntil: 'load', timeout: 300000 })
    const item = page.locator(`[data-asset="${asset?.id}"]`)
    const drawn = await item.locator('img').first().evaluate((img) => img.complete && img.naturalWidth > 0).catch(() => false)
    const overflow = await fits(page)
    await page.screenshot({ path: join(out, `media-${width}.png`), fullPage: true })
    check(`at ${width} the media page shows the yes and the image drawn, and fits (overflow ${overflow}px)`, (await item.count()) === 1 && drawn && overflow <= 0 && (await page.getByText(PERMISSION_WORDS).count()) === 1, { drawn, overflow })
  }
  await page.locator(`[data-asset="${asset?.id}"] input[name="reason"]`).fill('The drive takes it back')
  await page.locator(`[data-asset="${asset?.id}"]`).getByRole('button', { name: 'Withdraw this image' }).click()
  await page.getByText('Withdrawn. It comes out of every post not yet published within the hour.').waitFor({ timeout: 120000 })
  const gone = (await db.from('social_assets').select('withdrawal_status').eq('id', asset?.id).single()).data
  const listed = storedPath ? (await db.storage.from('organiser-media').list(storedPath.split('/')[0])).data ?? [] : []
  check('the image is withdrawn in the register and its file is gone from the bucket', gone?.withdrawal_status === 'withdrawn' && !listed.some((f) => storedPath?.endsWith(f.name)), { gone, listed: listed.map((f) => f.name) })
  await page.locator(`[data-permission="${yeses[0]?.id}"] input[name="reason"]`).fill('The drive takes the permission back')
  await page.locator(`[data-permission="${yeses[0]?.id}"]`).getByRole('button', { name: 'Withdraw my permission' }).click()
  await page.getByText('Withdrawn. Every image under it').waitFor({ timeout: 120000 })
  const yesAfter = (await db.from('organiser_permissions').select('withdrawn_at, withdrawn_reason').eq('id', yeses[0]?.id).single()).data
  check('the yes is withdrawn with its reason', Boolean(yesAfter?.withdrawn_at) && yesAfter?.withdrawn_reason === 'The drive takes the permission back', yesAfter)

  /* ---- given again from the same page (221201): the claim page's two ticks, one current yes per claim ---- */
  await page.goto(`${BASE}/dashboard/organisation/media`, { waitUntil: 'load', timeout: 300000 })
  const give = page.locator(`[data-claim="${claim?.id}"]`)
  await give.locator('input[name="permission"]').check()
  await give.locator('input[name="authority"]').check()
  await give.getByRole('button', { name: 'Give permission' }).click()
  await page.getByText('Thank you. Your permission is on record').waitFor({ timeout: 120000 })
  const current = (await db.from('organiser_permissions').select('id, wording, claim_id').eq('logged_by', userId).is('withdrawn_at', null)).data ?? []
  check('the yes given again is current, word for word, citing the same claim', current.length === 1 && current[0].wording === PERMISSION_WORDS && current[0].claim_id === claim?.id, current)
} catch (e) {
  fails += 1
  console.log(`FAIL the drive stopped: ${e instanceof Error ? e.message : String(e)}`)
} finally {
  if (browser) await browser.close().catch(() => {})
  if (server?.pid) spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  // The dev server's build output is this drive's own, and the disk is shared: it goes when the drive ends, pass or
  // fail (the project manager's 01:19 (3)). The browser's temp profile goes with browser.close() above.
  if (server) rmSync('.next', { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 })
  if (existsSync(capture)) console.log(`CAPTURED ${readFileSync(capture, 'utf8').trim().split('\n').filter(Boolean).length} email(s), none sent`)
  /* ---- everything put back and removed, read back ---- */
  if (storedPath) await db.storage.from('organiser-media').remove([storedPath])
  if (userId && snapshot) {
    const sql = readFileSync('scripts/verify/claim-acceptance-drive-cleanup.sql', 'utf8')
      .replaceAll(':USER', userId)
      .replaceAll(':SNAPSHOT', JSON.stringify(snapshot).replaceAll("'", "''"))
    const cleaned = await sqlOnTest(sql)
    const ok = cleaned.status < 300 && cleaned.body.includes('CLEANUP PASSED')
    console.log(`${ok ? 'PASS' : 'FAIL'} cleanup on TEST (HTTP ${cleaned.status}): ${cleaned.body.slice(0, 300)}`)
    if (!ok) fails += 1
  }
  if (flagTouched) {
    // As found: no row stays no row; a row keeps the value it had.
    if (flagWas === null) await db.from('feature_flags').delete().eq('flag', 'listing_claims')
    else await db.from('feature_flags').update({ enabled: flagWas }).eq('flag', 'listing_claims')
    const flagNow = (await db.from('feature_flags').select('enabled').eq('flag', 'listing_claims').maybeSingle()).data?.enabled ?? null
    check(`claims on TEST put back as found (${flagWas} -> ${flagNow})`, flagNow === flagWas, flagNow)
  }
  if (userId) {
    await db.from('profiles').delete().eq('id', userId)
    const torn = await tearDownAccount(db, userId)
    console.log(`${torn.gone ? 'PASS' : 'FAIL'} ${torn.detail}`)
    if (!torn.gone) fails += 1
  }
}
console.log(fails === 0 ? 'DRIVE PASSED' : `DRIVE FAILED, ${fails} check(s)`)
process.exit(fails === 0 ? 0 : 1)
