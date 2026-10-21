/**
 * WI1, DESIGN MATCH: the walk-in page drawn with locked design A's own content,
 * photographed at 1440, 768 and 390 and placed beside the board it was drawn
 * from (Lawal's change 2 of 21 October 2026).
 *
 * "The evidence in C:\dev\EVIDENCE\WI1\ includes, for 1440 and 390, the drive
 * screenshot beside AMCF-Main-1440.png, AMCF-Main-390.png and
 * AMCF-PhoneA-390.png, with every visible difference listed and the law or
 * token that causes it. Any difference with no law behind it is fixed before
 * delivery."
 *
 * The fixture carries the board's text word for word, read from
 * CONTENT_FILE below, with one change ruled by Lawal (ruling 3): the
 * at-a-glance tile reads "Free" over "for every visitor". The photos are the
 * board's own, from
 * C:\dev\design\amcf-21oct\photos\, uploaded to TEST storage and removed at
 * teardown. The differences themselves are written by hand, from the images
 * this produces, into C:\dev\EVIDENCE\WI1\design-match\DESIGN-MATCH.md.
 *
 * Usage, against a production build served locally (clean env, as every drive):
 *   bash C:/dev/EVIDENCE/C13/clean-env.sh node --env-file=.env.local \
 *     scripts/verify/wi1-design-match-drive.mjs http://127.0.0.1:3000 --label=pass1
 *   --keep    leave the fixture up after the captures, to look at it by hand;
 *             the next run without --keep removes every fixture of this drive.
 *
 * TEST ONLY, checked twice. The organisation and the event carry a stamped slug
 * and are deleted in finally; the teardown asks the database whether they are
 * gone.
 */
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { tearDownAccountOrFailTheRun } from './lib/teardown-account.mjs'
import { answerTheCookieBanner } from './lib/cookie-banner.mjs'

assertNotProduction()

const TAG = '[wi1-design-match]'
const args = process.argv.slice(2)
const BASE = args.find((a) => a.startsWith('http')) ?? 'http://127.0.0.1:3000'
const LABEL = args.find((a) => a.startsWith('--label='))?.split('=')[1] ?? 'pass'
const KEEP = args.includes('--keep')
const OUT = join(process.env.DRIVE_OUT ?? 'C:/dev/EVIDENCE/WI1/design-match', LABEL)
const BOARDS = 'C:/dev/design/amcf-21oct/locked'
const PHOTOS = 'C:/dev/design/amcf-21oct/photos'
const BUCKET = 'event-images'
const PREFIX = 'wi1-design-match'
/*
 * The board's content, word for word, kept beside the evidence rather than in
 * the repository: the board's own copy uses a word the repository bans, and
 * under ruling 2 it is the organiser's text, shown as written.
 */
const CONTENT_FILE = process.env.WI1_BOARD_CONTENT ?? 'C:/dev/EVIDENCE/WI1/design-match/amcf-board-content.json'

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !SERVICE) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
if (!/vkapkibzokmfaxqogypq/.test(URL_)) throw new Error(`refusing to write to ${URL_}: this drive runs against TEST only`)

const CONTENT = JSON.parse(readFileSync(CONTENT_FILE, 'utf8'))
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const stamp = Date.now().toString(36)
const created = { userId: null, orgId: null, eventId: null, objects: [] }
mkdirSync(OUT, { recursive: true })

function must(res, what) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data
}

/** A Melbourne wall-clock time as a UTC instant (two passes, for daylight saving). */
function melbourneInstant(date, hhmm) {
  const [y, m, d] = date.split('-').map(Number)
  const [h, mi] = hhmm.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, h, mi)
  const offset = (at) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Australia/Melbourne', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(at))
    const g = (t) => Number(parts.find((p) => p.type === t).value)
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute')) - at
  }
  let at = wall - offset(wall)
  at = wall - offset(at)
  return new Date(at).toISOString()
}

/** Remove what an earlier --keep run left, so a kept fixture never outlives the next run. */
async function sweepEarlierRuns() {
  const { data: events } = await admin.from('events').select('id').like('slug', `${PREFIX}-%`)
  for (const e of events ?? []) await admin.from('events').delete().eq('id', e.id)
  const { data: orgs } = await admin.from('organisations').select('id, owner_id').like('slug', `${PREFIX}-%`)
  for (const o of orgs ?? []) {
    await admin.from('organisations').delete().eq('id', o.id)
    if (o.owner_id) await tearDownAccountOrFailTheRun(admin, o.owner_id)
  }
  const { data: folders } = await admin.storage.from(BUCKET).list(PREFIX, { limit: 100 })
  for (const f of folders ?? []) {
    const { data: files } = await admin.storage.from(BUCKET).list(`${PREFIX}/${f.name}`, { limit: 100 })
    const paths = (files ?? []).map((x) => `${PREFIX}/${f.name}/${x.name}`)
    if (paths.length) await admin.storage.from(BUCKET).remove(paths)
  }
  if ((events ?? []).length || (orgs ?? []).length) console.log(`${TAG} swept ${events?.length ?? 0} event(s) and ${orgs?.length ?? 0} organisation(s) an earlier --keep run left`)
}

async function upload(file) {
  const path = `${PREFIX}/${stamp}/${file}`
  must(await admin.storage.from(BUCKET).upload(path, readFileSync(join(PHOTOS, file)), { contentType: 'image/jpeg', upsert: false }), `upload ${file}`)
  created.objects.push(path)
  return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/** The board on the left, the drive on the right, each labelled, at the board's width. */
async function sideBySide(boardFile, shotFile, outFile, title) {
  const board = sharp(join(BOARDS, boardFile))
  const meta = await board.metadata()
  const width = meta.width
  const shot = await sharp(shotFile).resize({ width }).toBuffer({ resolveWithObject: true })
  const left = await board.toBuffer({ resolveWithObject: true })
  const gap = 48
  const band = 64
  const height = band + Math.max(left.info.height, shot.info.height)
  const label = (text) =>
    Buffer.from(
      `<svg width="${width}" height="${band}" xmlns="http://www.w3.org/2000/svg"><text x="0" y="40" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#0A1628">${text}</text></svg>`,
    )
  await sharp({ create: { width: width * 2 + gap, height, channels: 3, background: '#FFFFFF' } })
    .composite([
      { input: label(`BOARD: ${boardFile}`), left: 0, top: 0 },
      { input: label(`DRIVE: ${title}`), left: width + gap, top: 0 },
      { input: left.data, left: 0, top: band },
      { input: shot.data, left: width + gap, top: band },
    ])
    .png()
    .toFile(outFile)
  console.log(`${TAG} ${outFile}`)
}

let browser = null
let failed = false
try {
  await sweepEarlierRuns()

  const password = randomBytes(12).toString('base64url') + '-Aa1'
  const email = `${PREFIX}-${stamp}@eventlinqs.test`
  const owner = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), 'create the organiser').user
  created.userId = owner.id
  const org = must(
    await admin.from('organisations').insert({
      name: CONTENT.organisation.name,
      slug: `${PREFIX}-${stamp}`,
      owner_id: owner.id,
      status: 'active',
      website: CONTENT.organisation.website,
      instagram_handle: CONTENT.organisation.instagram_handle,
      short_name: CONTENT.organisation.short_name,
    }).select('id').single(),
    'create the organisation',
  )
  created.orgId = org.id

  const festivals = must(await admin.from('event_categories').select('id, slug, name').or('slug.eq.festivals,slug.eq.festival').limit(1).maybeSingle(), 'find the festivals category')
  if (!festivals) throw new Error('no festivals category on TEST; the breadcrumb and eyebrow need it')

  const e = CONTENT.event
  const cover = await upload(e.cover.file)
  const gallery = []
  for (const g of e.gallery) gallery.push({ url: await upload(g.file), alt: g.alt })

  const event = must(
    await admin.from('events').insert({
      organisation_id: org.id,
      created_by: owner.id,
      title: e.title,
      slug: `${PREFIX}-${stamp}`,
      summary: e.summary,
      timezone: 'Australia/Melbourne',
      start_date: melbourneInstant(...e.start),
      end_date: melbourneInstant(...e.end),
      event_type: 'in_person',
      venue_name: e.venue_name,
      venue_address: e.venue_address,
      venue_city: e.venue_city,
      venue_state: e.venue_state,
      venue_country: 'Australia',
      venue_latitude: e.venue_latitude,
      venue_longitude: e.venue_longitude,
      city_primary: e.city_primary,
      category_id: festivals.id,
      cover_image_url: cover,
      cover_image_alt: e.cover.alt,
      gallery_urls: gallery,
      entry_mode: 'walk_in',
      status: 'published',
      published_at: new Date().toISOString(),
      visibility: 'public',
    }).select('id, slug').single(),
    'create the AMCF fixture event',
  )
  created.eventId = event.id

  must(await admin.from('event_guides').insert({ event_id: event.id, ...CONTENT.guide }), 'create the AMCF guide')

  browser = await chromium.launch()
  const shots = {}
  const axeFound = {}
  for (const vp of [
    { label: '1440', width: 1440, height: 1000 },
    { label: '768', width: 768, height: 1024 },
    { label: '390', width: 390, height: 844 },
  ]) {
    const phone = vp.width < 768
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: phone, hasTouch: phone, deviceScaleFactor: 1 })
    const page = await context.newPage()
    const res = await page.goto(`${BASE}/events/${event.slug}`, { waitUntil: 'load' })
    if (res?.status() !== 200) throw new Error(`the fixture page answered ${res?.status()} at ${vp.label}`)
    await answerTheCookieBanner(page)
    // The board shows Remind me. A page drawn without it is a different page, so
    // refuse rather than photograph it; this drive never flips the switch itself.
    if (vp.width >= 1024 && (await page.locator('aside form[data-remind-me-form]').count()) === 0) {
      throw new Error(
        'Remind me is switched off on TEST, so the page cannot match the board. Turn it on first: ' +
          'scripts/ops/with-supabase-token.ps1 node scripts/ops/walk-in-remind-me-flag.mjs --target test --apply',
      )
    }
    // Every image decoded before the photograph, so a lazy tile is never captured blank.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 120))
      }
      window.scrollTo(0, 0)
      await Promise.all([...document.images].map((img) => (img.complete ? null : img.decode().catch(() => null))))
    })
    // A FAILED image is `complete` too, and its decode rejection was swallowed
    // above, so a broken tile was photographed as though it were the design (a
    // gallery photo showed only its alt text on 22 October). Name every broken
    // image, ask its own address for a status, and reload once to tell a cold
    // optimiser from a lasting fault.
    const brokenNow = () =>
      page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src))
    let broken = await brokenNow()
    if (broken.length > 0) {
      for (const src of broken) console.log(`[wi1-design-match] ${vp.label}: broken image, HTTP ${(await page.request.get(src)).status()} on a fresh request: ${src}`)
      await page.reload({ waitUntil: 'load' })
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          window.scrollTo(0, y)
          await new Promise((r) => setTimeout(r, 120))
        }
        window.scrollTo(0, 0)
        await Promise.all([...document.images].map((img) => (img.complete ? null : img.decode().catch(() => null))))
      })
      broken = await brokenNow()
      console.log(`[wi1-design-match] ${vp.label}: after one reload, ${broken.length} broken image(s)${broken.length ? ': ' + broken.join(', ') : ''}`)
    }
    shots[vp.label] = join(OUT, `drive-${vp.label}.png`)
    await page.screenshot({ path: shots[vp.label], fullPage: true })
    // The phone board shows the bottom bar over the first screen: the same view, unscrolled.
    if (phone) await page.screenshot({ path: join(OUT, `drive-${vp.label}-first-screen.png`), fullPage: false })
    // axe on the same page with the board's own content: the constitution's
    // 0 violations, WCAG 2 A and AA, tagged as scripts/axe-marketing-scan.mjs tags it.
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    axeFound[vp.label] = axe.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help }))
    // Every photo tile is a button that opens the gallery viewer (the
    // interactive-affordance law): count them against the photos, open the
    // first, and close it again.
    const tiles = page.locator('[data-walk-in-page] button[aria-label^="View image"]')
    const tileCount = await tiles.count()
    await tiles.first().click()
    const viewerOpened = await page.getByRole('dialog', { name: /^Image 1 of / }).waitFor({ timeout: 10000 }).then(() => true, () => false)
    await page.keyboard.press('Escape')
    const viewerClosed = await page.getByRole('dialog', { name: /^Image 1 of / }).waitFor({ state: 'hidden', timeout: 10000 }).then(() => true, () => false)
    console.log(`[wi1-design-match] ${vp.label}: ${tileCount} photo tile button(s) for ${e.gallery.length} photo(s); the first opens the viewer ${viewerOpened}, Escape closes it ${viewerClosed}`)
    console.log(`[wi1-design-match] ${vp.label}: axe ${axe.violations.length} violation(s)${axe.violations.length ? ': ' + axe.violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length})`).join(', ') : ''}`)
    await context.close()
    console.log(`${TAG} captured ${vp.label}`)
  }

  await sideBySide('AMCF-Main-1440.png', shots['1440'], join(OUT, 'side-by-side-1440-Main.png'), 'walk-in page at 1440')
  await sideBySide('AMCF-Main-390.png', shots['390'], join(OUT, 'side-by-side-390-Main.png'), 'walk-in page at 390')
  await sideBySide('AMCF-PhoneA-390.png', join(OUT, 'drive-390-first-screen.png'), join(OUT, 'side-by-side-390-PhoneA.png'), 'walk-in page at 390, first screen')
  writeFileSync(join(OUT, 'axe.json'), JSON.stringify(axeFound, null, 2))
  writeFileSync(join(OUT, 'fixture.json'), JSON.stringify({ base: BASE, slug: event.slug, stamp, kept: KEEP }, null, 2))
} catch (error) {
  failed = true
  console.error(`${TAG} FAILED: ${error.stack ?? error.message}`)
} finally {
  if (browser) await browser.close()
  if (KEEP && !failed) {
    console.log(`${TAG} KEPT for a look by hand: ${BASE}/events/${PREFIX}-${stamp}. The next run removes it.`)
  } else {
    if (created.eventId) await admin.from('events').delete().eq('id', created.eventId)
    if (created.orgId) await admin.from('organisations').delete().eq('id', created.orgId)
    if (created.userId) await tearDownAccountOrFailTheRun(admin, created.userId)
    if (created.objects.length) await admin.storage.from(BUCKET).remove(created.objects)
    const { count: leftEvents } = await admin.from('events').select('id', { count: 'exact', head: true }).eq('slug', `${PREFIX}-${stamp}`)
    const { count: leftOrgs } = await admin.from('organisations').select('id', { count: 'exact', head: true }).eq('slug', `${PREFIX}-${stamp}`)
    const { data: leftObjects } = await admin.storage.from(BUCKET).list(`${PREFIX}/${stamp}`)
    const clean = leftEvents === 0 && leftOrgs === 0 && (leftObjects ?? []).length === 0
    console.log(`${TAG} teardown ${clean ? 'clean' : 'NOT CLEAN'}: ${JSON.stringify({ leftEvents, leftOrgs, leftObjects: (leftObjects ?? []).length })}`)
    if (!clean) failed = true
  }
  process.exitCode = failed ? 1 : 0
}
