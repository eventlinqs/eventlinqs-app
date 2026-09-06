/**
 * OPEN EVERY LAUNCH KIT ARTEFACT AND LOOK AT IT.
 *
 *   npm run verify:launch-kit
 *   JOURNEY_VIEWPORT=mobile-390 KIT_OUT=C:\dev\EVIDENCE\C3\mobile-390 npm run verify:launch-kit
 *
 * The npm script is the one command (Law 10):
 *   node --env-file=.env.local --import ./scripts/lib/src-alias-loader.mjs scripts/verify/launch-kit-inspect.mjs
 *
 * ---------------------------------------------------------------------------
 * WHY. The Launch Kit is what this platform is sold on. An organiser prints the
 * A4 poster and puts it on a venue wall, posts the cards to Instagram and
 * Facebook, and every link they share unfurls as the per-event card. "The
 * screen rendered" and "the poster is printable" are different claims, and
 * only the second one is the product. So this drives the whole thing the way
 * an organiser does and then opens every artefact the kit hands over, one at a
 * time, with a verdict each.
 *
 * ---------------------------------------------------------------------------
 * WHAT CHANGED IN CLOSE-OUT C3 (6 September 2026), and why each change is a
 * rule rather than a tidy-up.
 *
 * EVERYTHING IS ENUMERATED FROM SOURCE OR FROM THE PAGE. The previous version
 * of this script carried its own copy of the card sizes (CARD_SPEC), its own
 * copy of the six channels (CHANNELS) and its own copy of the download URL
 * shape. The close-out's standing rule is that a list typed from memory is not
 * a check, because the first time the product and the copy disagree the copy
 * wins and the check passes on the wrong product. Now:
 *
 *   - the FORMATS and their published sizes are imported from
 *     src/lib/broadcast/social-card-spec.ts, the file that cites the platform
 *     pages those numbers came from;
 *   - the CHANNELS are imported from src/lib/broadcast/artefact-channels.ts,
 *     the one list the routes, the captions and the kit screen read;
 *   - the DOWNLOADS are harvested from the kit screen's own anchors, and the
 *     set on the page must equal formats x channels exactly, so a card the
 *     screen forgot to offer is a fault, not a card this script forgot to ask
 *     for;
 *   - the PER-EVENT CARD is found by reading og:image out of the real event
 *     page's head, and the width and height it must decode to are the ones
 *     that page declares beside it.
 *
 * The TypeScript modules load through scripts/lib/src-alias-loader.mjs and a
 * failed import FAILS THE RUN. The old script wrapped its layout import in
 * `.catch(() => null)`; the import had been failing on the "@/" alias since it
 * was written, and three verdicts were silently never produced.
 *
 * THE ORGANISER IS REAL, AND SO IS THE EVENT. The old script signed up through
 * the form and then INSERTED the organisation, the event and its tier with the
 * service role. The brief's definition of driven is that state a real person
 * could create is created the way they create it, so the organisation and the
 * event now come from the create-event wizard, with a real licensed photograph
 * uploaded as the cover (Law 6: the platform renders what the organiser
 * supplies), and the kit screen is reached by pressing Publish. The event is
 * free, because a paid event cannot be published on TEST without a Stripe
 * connection, and that refusal is its own journey.
 *
 * ---------------------------------------------------------------------------
 * WHAT "THE QR SCANS" MEANS HERE, precisely. Not "a QR was drawn". The poster
 * PDF is parsed, the QR image is pulled back out of it and DECODED with a real
 * decoder (jsqr, a devDependency used only by this script), and the decoded
 * string is compared against the tracked short link the database says was
 * minted for the qr channel. A poster whose QR decodes to the wrong address is
 * worse than one with no QR, because the organiser finds out from an attendee.
 *
 * WHAT IS NOT CLAIMED. Nothing here does OCR, so no verdict says the TYPE fits
 * inside a finished JPEG. The functions that decide the fit are pinned with the
 * real font measurer in tests/unit/social-cards.test.ts; the rasters are written
 * out and put on the contact sheet so a person can look at them, and that is
 * said plainly rather than dressed up as an automated pass.
 *
 * Every artefact is written to disk (KIT_OUT, or docs/verification/launch-kit/<stamp>)
 * with a contact sheet (index.html) and a machine-readable results.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { inflateSync } from 'node:zlib'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import jsQR from 'jsqr'
import { PDFDocument, PDFName } from 'pdf-lib'
import { AxeBuilder } from '@axe-core/playwright'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import {
  chromium,
  BASE,
  makeJourney,
  note,
  attach,
  finish,
  see,
  messagesOnScreen,
  signUpAndConfirm,
  createEventThroughWizard,
} from '../journeys/harness.mjs'

// THE SOURCE OF TRUTH, imported. If any of these fail to load the run fails
// here, before a browser opens, with Node's own error naming the module.
import {
  SOCIAL_CARD_EXTENSION,
  SOCIAL_CARD_FORMATS,
  SOCIAL_CARD_MAX_BYTES,
  SOCIAL_CARD_MIME,
  SOCIAL_CARD_ORDER,
} from '../../src/lib/broadcast/social-card-spec.ts'
import { ARTEFACT_CHANNELS } from '../../src/lib/broadcast/artefact-channels.ts'
import { cardFilename } from '../../src/lib/broadcast/social-card-layout.ts'

assertNotProduction()

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
/*
 * The run stamp names the OUTPUT folder, and it may be pinned by the caller so a
 * run lands somewhere predictable. The ACCOUNT stamp may not be, and the
 * difference cost a whole three-viewport drive on 6 September 2026: with
 * RUN_STAMP set to c3-desktop-1440 the signup email was fixed too, so the second
 * run of the same proof was refused by the platform with "that email address
 * already has an EventLinqs account" and reported a blocker that was entirely
 * its own. A proof that only passes the first time is not a proof.
 *
 * The ORGANISATION NAME and the EVENT TITLE take the account stamp for the same
 * reason: the platform derives a URL slug from each, and a repeated slug is
 * refused with "This slug is already taken", which the second run reported as a
 * stuck wizard. Everything a run creates that the platform makes unique carries
 * the account stamp; only the output folder carries the caller's stamp.
 */
const stamp = process.env.RUN_STAMP ?? String(Date.now()).slice(-6)
const accountStamp = `${stamp}-${Date.now().toString(36).slice(-5)}`
const viewportLabel = process.env.JOURNEY_VIEWPORT ?? 'desktop-1440'
const j = makeJourney('launch-kit-inspect', `Launch Kit: open and inspect every artefact (${viewportLabel})`)
const OUT = process.env.KIT_OUT ? resolve(process.env.KIT_OUT) : join(process.cwd(), 'docs', 'verification', 'launch-kit', stamp)
mkdirSync(OUT, { recursive: true })

/** A card with real content never has a flat channel; below this it is blank. */
const MIN_INK_STDEV = 6
/**
 * Mean absolute per-channel difference (0 to 255) between the event's card and
 * the fallback drawn for a missing slug. Two renders of the SAME fallback differ
 * by about 0; a card carrying a different title alone differs by a few units;
 * one carrying the organiser's photograph differs by tens. Ten is well above
 * the first and well below the last, so a fallback wearing the wrong title
 * cannot pass and a real card cannot fail.
 */
const MIN_FALLBACK_DIFF = 10

const results = []
const sheet = []

function verdict(name, ok, detail, file = null) {
  results.push({ name, ok, detail, file })
  note(j, `${(ok ? 'PASS' : 'FAIL').padEnd(6)} ${name}`, detail)
  if (!ok) j.blockers.push(`${name}: ${detail}`)
}

async function axeCheck(page, label) {
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const violations = scan.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => ({ target: n.target, html: n.html?.slice(0, 200) })),
  }))
  const file = `axe-${label}.json`
  writeFileSync(join(OUT, file), JSON.stringify({ url: scan.url, viewport: viewportLabel, violations }, null, 2))
  verdict(
    `axe on ${label}: 0 violations at any impact`,
    violations.length === 0,
    violations.length === 0 ? `clean (${scan.passes.length} rules passed)` : violations.map((v) => `[${v.impact}] ${v.id}`).join(', '),
    file,
  )
}

/** Decoded shape of an image body, or null when sharp cannot read it. */
async function imageShape(bytes) {
  try {
    const img = sharp(bytes)
    const meta = await img.metadata()
    const stats = await img.stats()
    return { format: meta.format, width: meta.width, height: meta.height, ink: Math.max(...stats.channels.map((c) => c.stdev)) }
  } catch (error) {
    console.warn(`[kit] not a readable image: ${String(error?.message ?? error).slice(0, 90)}`)
    return null
  }
}

/**
 * Pull every image out of a PDF and decode any QR among them.
 *
 * pdf-lib stores an embedded PNG as a Flate-compressed image XObject holding
 * RAW SAMPLES, not the original PNG file, so the bytes cannot simply be written
 * out with a .png extension. They are inflated and handed to sharp with the
 * width, height and colour space the PDF itself declares, which is the only
 * place that information exists.
 */
async function qrFromPdf(pdfBytes) {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const tried = []
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    const dict = obj?.dict
    if (!dict) continue
    const subtype = dict.get(PDFName.of('Subtype'))?.toString?.()
    if (subtype !== '/Image') continue
    const width = Number(dict.get(PDFName.of('Width'))?.toString?.() ?? 0)
    const height = Number(dict.get(PDFName.of('Height'))?.toString?.() ?? 0)
    const filter = dict.get(PDFName.of('Filter'))?.toString?.() ?? ''
    const space = dict.get(PDFName.of('ColorSpace'))?.toString?.() ?? ''
    const bpc = Number(dict.get(PDFName.of('BitsPerComponent'))?.toString?.() ?? 8)
    if (!width || !height) continue
    tried.push(`${width}x${height} ${filter} ${space} ${bpc}bpc`)

    let raw
    try {
      raw = filter.includes('FlateDecode') ? inflateSync(Buffer.from(obj.contents)) : Buffer.from(obj.contents)
    } catch (error) {
      console.warn(`[kit] could not inflate a ${width}x${height} image stream, skipping it: ${String(error?.message ?? error).slice(0, 90)}`)
      continue
    }

    const channels = space.includes('DeviceRGB') ? 3 : space.includes('DeviceGray') ? 1 : 0
    let rgba = null
    try {
      if (channels && bpc === 8 && raw.length >= width * height * channels) {
        rgba = await sharp(raw, { raw: { width, height, channels } }).ensureAlpha().raw().toBuffer()
      } else {
        rgba = await sharp(raw).ensureAlpha().raw().toBuffer()
      }
    } catch (error) {
      console.warn(`[kit] sharp could not read the ${width}x${height} ${space} image, skipping it: ${String(error?.message ?? error).slice(0, 90)}`)
      continue
    }
    if (!rgba) continue

    const found = jsQR(new Uint8ClampedArray(rgba), width, height)
    if (found?.data) return { value: found.data, width, height, tried }

    // A QR drawn small can decode better upscaled; a real scanner gets to move
    // the phone closer, so this is the fair equivalent rather than a cheat.
    try {
      const up = await sharp(rgba, { raw: { width, height, channels: 4 } })
        .resize({ width: width * 3, height: height * 3, kernel: 'nearest' })
        .ensureAlpha()
        .raw()
        .toBuffer()
      const bigger = jsQR(new Uint8ClampedArray(up), width * 3, height * 3)
      if (bigger?.data) return { value: bigger.data, width, height, tried, upscaled: true }
    } catch (error) {
      console.warn(`[kit] upscaled decode of the ${width}x${height} image failed: ${String(error?.message ?? error).slice(0, 90)}`)
    }
  }
  return { value: null, tried }
}

/** The set the source defines: every format for every channel, in kit order. */
const EXPECTED = []
for (const format of SOCIAL_CARD_ORDER) for (const channel of ARTEFACT_CHANNELS) EXPECTED.push({ format, channel })

const browser = await chromium.launch()
let eventId = null
let slug = null

try {
  const ctx = await browser.newContext({ locale: 'en-AU' })
  const page = await ctx.newPage()
  await attach(j, page)

  // ── THE ORGANISER, through the real form ─────────────────────────────────
  //
  // Locally the signup form is used and the confirmation link is read out of
  // the console mail transport, the way a person reads their inbox. Against a
  // Vercel preview there is no inbox to read (the preview sends real mail), so
  // KIT_ACCOUNT=admin creates the throwaway organiser on TEST through the
  // admin API, confirmed, and signs in through the real login form on the
  // preview. The signup form itself is proven by the local run; the preview
  // run exists to prove the LAMBDAS (the card routes, the composer) rather
  // than the inbox, and says which path it took.
  const EMAIL = `kit.${accountStamp}@example.com`
  const PASSWORD = `Str0ng-${stamp}-Pass!`
  if (process.env.KIT_ACCOUNT === 'admin') {
    const { error: createErr } = await db.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'Kit Organiser' },
    })
    if (createErr) {
      verdict('an organiser to make a kit for', false, `admin createUser on TEST failed: ${createErr.message}`)
      throw new Error('no account')
    }
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 90000 })
    await page.fill('input[type="email"]', EMAIL)
    await page.fill('input[type="password"]', PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 60000 }).catch(() => {})
    await page.waitForTimeout(3000)
    const landed = new URL(page.url()).pathname
    if (landed.startsWith('/login')) {
      verdict('an organiser to make a kit for', false, `the login form did not leave /login (${landed}): ${(await messagesOnScreen(page)).join(' // ') || 'no message'}`)
      throw new Error('no session')
    }
    note(j, 'Signed in through the login form', `${EMAIL} (created confirmed on TEST through the admin API) -> ${landed}`)
  } else if (!(await signUpAndConfirm(j, page, { name: 'Kit Organiser', email: EMAIL, password: PASSWORD }))) {
    verdict('an organiser to make a kit for', false, 'could not create an account through the signup form')
    throw new Error('no account')
  }

  // ── THE EVENT, through the wizard, with a real uploaded cover ────────────
  const TITLE = `Kit Inspection Night ${accountStamp}`
  const coverPath = join(process.cwd(), 'public', 'images', 'hero', 'comedy.jpg')
  const review = await createEventThroughWizard(j, page, {
    title: TITLE,
    summary: 'Every artefact in the kit, opened and looked at.',
    description:
      'A published event that exists so the complete Launch Kit can be generated and inspected: the poster, every card for every channel, the link card and the tracked links.',
    price: null,
    capacity: '250',
    orgName: `Kit Presents ${accountStamp}`,
    uploadCover: coverPath,
  })
  if (!review.reachedReview || review.publishDisabled) {
    // Say WHERE it stopped, not only that it did: the screen, its heading,
    // its buttons and its fields, so a stalled step can be told from a
    // refused one without re-running the journey.
    await page.screenshot({ path: join(OUT, '00-wizard-stuck.png'), fullPage: true })
    const where = await see(page)
    verdict(
      'the wizard reaches Review with Publish enabled',
      false,
      `reachedReview ${review.reachedReview}, publish ${review.publishDisabled ? 'DISABLED' : 'enabled'}, cover ${review.madeCover ? 'uploaded' : 'ABSENT'}; stopped at ${page.url().replace(BASE, '')} heading ${JSON.stringify(where.h)}, buttons [${where.buttons.join(' | ')}], fields [${where.fields.slice(0, 8).join(' | ')}]; messages: ${(await messagesOnScreen(page)).join(' // ') || 'none'}`,
      '00-wizard-stuck.png',
    )
    throw new Error('no review')
  }
  await review.publishButton.click()
  await Promise.race([
    page.waitForURL(/\/dashboard\/events\/[0-9a-f-]{36}/, { timeout: 60000 }).catch(() => {}),
    page.waitForTimeout(60000),
  ])
  await page.waitForTimeout(4000)
  eventId = page.url().match(/\/dashboard\/events\/([0-9a-f-]{36})/)?.[1] ?? null
  const afterPublish = await messagesOnScreen(page)
  verdict(
    'the event publishes from the wizard and lands the organiser on their kit',
    Boolean(eventId) && /launch-kit/.test(page.url()) && !afterPublish.some((s) => /could not|refused|failed/i.test(s)),
    `${page.url().replace(BASE, '')}${afterPublish.length ? ` :: ${afterPublish.join(' // ')}` : ''}`,
  )
  if (!eventId) throw new Error('no event id in the URL after publish')

  // ── ARTEFACT 1: the kit screen itself, at this viewport ──────────────────
  const kitUrl = `${BASE}/dashboard/events/${eventId}/launch-kit`
  const kitRes = await page.goto(kitUrl, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(6000)
  await page.screenshot({ path: join(OUT, '01-kit-screen.png'), fullPage: true })
  sheet.push({ title: `The kit screen at ${viewportLabel}`, file: '01-kit-screen.png' })

  const kit = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img')]
    const hrefs = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'))
    return {
      heading: document.querySelector('h1')?.textContent?.trim() ?? null,
      images: imgs.length,
      brokenImages: imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')?.slice(0, 80)),
      emptyPanels: [...document.querySelectorAll('section')].filter((s) => (s.textContent ?? '').trim().length === 0).length,
      hrefs,
    }
  })
  verdict(
    'the kit screen renders with no broken image and no empty panel',
    kitRes?.status() === 200 && kit.brokenImages.length === 0 && kit.emptyPanels === 0,
    `HTTP ${kitRes?.status()}, heading "${kit.heading}", ${kit.images} image(s), ${kit.brokenImages.length} broken (${kit.brokenImages.join(', ') || 'none'}), ${kit.emptyPanels} empty section(s)`,
    '01-kit-screen.png',
  )
  await axeCheck(page, 'kit-screen')

  // The slug the kit points at, read off the page rather than assumed.
  slug =
    kit.hrefs
      .map((h) => /^(?:https?:\/\/[^/]+)?\/events\/([a-z0-9-]+)\/?(?:$|[?#]|\/opengraph-image)/.exec(h ?? '')?.[1] ?? null)
      .find((s) => s && !['create', 'browse', 'map', 'search'].includes(s)) ?? null
  verdict('the kit names the live event page it points at', Boolean(slug), slug ? `/events/${slug}` : 'no /events/<slug> link on the kit screen')

  // ── THE DOWNLOADS THE SCREEN OFFERS, harvested, versus the source ────────
  const offered = new Map()
  for (const h of kit.hrefs) {
    const m = /\/api\/organiser\/events\/([0-9a-f-]{36})\/card\/([a-z]+)\?channel=([a-z]+)/.exec(h ?? '')
    if (m && m[1] === eventId) offered.set(`${m[2]}:${m[3]}`, h)
  }
  const expectedKeys = EXPECTED.map((e) => `${e.format}:${e.channel}`)
  const missing = expectedKeys.filter((k) => !offered.has(k))
  const extra = [...offered.keys()].filter((k) => !expectedKeys.includes(k))
  verdict(
    `the kit offers exactly ${SOCIAL_CARD_ORDER.length} formats x ${ARTEFACT_CHANNELS.length} channels = ${EXPECTED.length} card downloads`,
    missing.length === 0 && extra.length === 0,
    `${offered.size} download link(s) on the page; formats ${SOCIAL_CARD_ORDER.join(', ')}; channels ${ARTEFACT_CHANNELS.join(', ')}` +
      (missing.length ? `; MISSING ${missing.join(', ')}` : '') +
      (extra.length ? `; EXTRA ${extra.join(', ')}` : ''),
  )
  const posterHref = kit.hrefs.find((h) => new RegExp(`/api/organiser/events/${eventId}/poster$`).test(h ?? '')) ?? null
  const previewHref = kit.hrefs.find((h) => /\/opengraph-image$/.test(h ?? '')) ?? null

  // ── ARTEFACT 2: the A4 QR poster, and whether the QR scans ───────────────
  verdict('the kit offers the poster', Boolean(posterHref), posterHref ?? 'no /poster link on the kit screen')
  if (posterHref) {
    const posterRes = await page.request.get(`${BASE}${posterHref}`)
    const posterBytes = Buffer.from(await posterRes.body())
    writeFileSync(join(OUT, '02-poster-a4.pdf'), posterBytes)
    sheet.push({ title: 'The A4 QR poster', file: '02-poster-a4.pdf' })

    let pageSize = null
    try {
      const doc = await PDFDocument.load(posterBytes, { ignoreEncryption: true })
      const p0 = doc.getPage(0)
      pageSize = { w: Math.round(p0.getWidth()), h: Math.round(p0.getHeight()), pages: doc.getPageCount() }
    } catch (error) {
      console.warn(`[kit] the poster is not a readable PDF: ${String(error?.message ?? error).slice(0, 90)}`)
    }
    // A4 at 72 points per inch is 595 x 842. Two points of slack for rounding.
    const isA4 = pageSize && Math.abs(pageSize.w - 595) <= 2 && Math.abs(pageSize.h - 842) <= 2
    verdict(
      'the poster is a real, single-page A4 PDF',
      posterRes.status() === 200 && Boolean(isA4) && pageSize.pages === 1,
      `HTTP ${posterRes.status()}, ${posterBytes.length} bytes, ${pageSize ? `${pageSize.pages} page(s) at ${pageSize.w} x ${pageSize.h}pt` : 'UNREADABLE AS A PDF'}${isA4 ? ' (A4 is 595 x 842pt)' : ' - NOT A4'}`,
      '02-poster-a4.pdf',
    )

    /*
     * THE SHORT LINK IS /e/<code>, decided in src/lib/broadcast/share-codes.ts,
     * and this script once guessed /s/ and filed nine false broken links. The
     * code is compared rather than the whole URL, because the origin can
     * legitimately differ between a local run and production.
     */
    const { data: qrLink } = await db.from('share_links').select('code, channel').eq('event_id', eventId).eq('channel', 'qr').maybeSingle()
    let decoded = { value: null, tried: [] }
    try {
      decoded = await qrFromPdf(posterBytes)
    } catch (err) {
      decoded = { value: null, tried: [`could not be parsed as a PDF: ${String(err?.message ?? err).slice(0, 90)}`] }
    }
    const codeMatches = Boolean(decoded.value && qrLink && decoded.value.includes(qrLink.code))
    verdict(
      'THE QR ON THE POSTER ACTUALLY SCANS, and to the right address',
      codeMatches,
      decoded.value
        ? `decoded "${decoded.value}"${decoded.upscaled ? ' (read after upscaling, as a phone would by moving closer)' : ''}; the qr-channel share link in the database is code ${qrLink?.code ?? 'NONE'}. ${codeMatches ? 'They match.' : 'THEY DO NOT MATCH: the poster sends people somewhere else.'}`
        : `NO QR COULD BE DECODED from the poster. Images found in the PDF: ${decoded.tried.join(' | ') || 'none'}.`,
      '02-poster-a4.pdf',
    )
  }

  // ── ARTEFACTS 3: every card, for every channel, as the click downloads it ─
  const expectedFilename = (format) => cardFilename(slug ?? 'event', format, SOCIAL_CARD_EXTENSION)
  for (const { format, channel } of EXPECTED) {
    const spec = SOCIAL_CARD_FORMATS[format]
    const label = `${spec.label} (${spec.width} x ${spec.height}) for ${channel}`
    const href = offered.get(`${format}:${channel}`)
    if (!href) {
      verdict(label, false, 'the kit screen offers no download for it')
      continue
    }
    const res = await page.request.get(`${BASE}${href}`)
    const bytes = Buffer.from(await res.body())
    const file = `03-card-${format}-${channel}.${SOCIAL_CARD_EXTENSION}`
    writeFileSync(join(OUT, file), bytes)
    sheet.push({ title: label, file })
    const shape = await imageShape(bytes)
    const headers = res.headers()
    const type = headers['content-type'] ?? ''
    const disposition = headers['content-disposition'] ?? ''
    const ok =
      res.status() === 200 &&
      type.startsWith(SOCIAL_CARD_MIME) &&
      shape?.format === 'jpeg' &&
      shape.width === spec.width &&
      shape.height === spec.height &&
      shape.ink > MIN_INK_STDEV &&
      bytes.length <= SOCIAL_CARD_MAX_BYTES &&
      /attachment/.test(disposition) &&
      disposition.includes(expectedFilename(format))
    verdict(
      label,
      ok,
      `HTTP ${res.status()} ${type || 'no content-type'}, ${shape ? `${shape.width} x ${shape.height} ${shape.format}` : 'UNREADABLE'} (spec ${spec.width} x ${spec.height}), ${(bytes.length / 1024).toFixed(0)} KB of ${(SOCIAL_CARD_MAX_BYTES / 1024 / 1024).toFixed(0)} MB, ink stdev ${shape ? shape.ink.toFixed(1) : '0'}${shape && shape.ink <= MIN_INK_STDEV ? ' - FLAT, this card is empty' : ''}, disposition "${disposition || 'none'}" (expects ${expectedFilename(format)})`,
      file,
    )
  }

  // ── ARTEFACT 4: the live event page, as a stranger, and its own card ──────
  const stranger = await browser.newContext({ locale: 'en-AU' })
  const publicPage = await stranger.newPage()
  await attach(j, publicPage)
  const eventUrl = `${BASE}/events/${slug}`
  const evRes = await publicPage.goto(eventUrl, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await publicPage.waitForTimeout(4000)
  await publicPage.screenshot({ path: join(OUT, '04-event-page.png'), fullPage: true })
  sheet.push({ title: `The live event page at ${viewportLabel}`, file: '04-event-page.png' })
  const ev = await publicPage.evaluate(() => {
    const meta = (sel) => document.querySelector(sel)?.getAttribute('content') ?? null
    return {
      heading: document.querySelector('h1')?.textContent?.trim() ?? null,
      hasTickets: /ticket|book|get tickets|free|from a\$|aud/i.test(document.body.innerText || ''),
      errorBoundary: /something went wrong|application error|we hit a snag/i.test(document.body.innerText || ''),
      ogImage: meta('meta[property="og:image"]'),
      ogWidth: meta('meta[property="og:image:width"]'),
      ogHeight: meta('meta[property="og:image:height"]'),
      ogType: meta('meta[property="og:image:type"]'),
      twitterImage: meta('meta[name="twitter:image"]'),
    }
  })
  verdict(
    'the live event page every artefact points at actually works',
    evRes?.status() === 200 && !ev.errorBoundary && Boolean(ev.heading),
    `HTTP ${evRes?.status()} at ${eventUrl.replace(BASE, '')}, heading "${ev.heading}", ticket surface ${ev.hasTickets ? 'present' : 'MISSING'}, error boundary ${ev.errorBoundary ? 'SHOWN' : 'absent'}`,
    '04-event-page.png',
  )
  await axeCheck(publicPage, 'event-page')

  /*
   * THE CARD IS FETCHED FROM THE SERVER UNDER TEST, BY PATH.
   *
   * The page declares og:image on the CANONICAL host (metadataBase is the
   * production origin everywhere, by design, so a shared preview link unfurls
   * production's card). The first run of this check followed that absolute URL
   * to production, where the run's event does not exist, received the designed
   * fallback card, and PASSED it: it decoded at the declared size and carried
   * ink. Looking at the artefact is what caught it. So the path and query are
   * taken from the declared URL and fetched on BASE, and the card must DIFFER
   * from the fallback the same server draws for a slug that does not exist,
   * measured pixel by pixel, because "has ink" is true of the fallback too.
   */
  const ogUrl = ev.ogImage ? new URL(ev.ogImage, BASE) : null
  const ogPath = ogUrl ? ogUrl.pathname : null
  const perEvent = Boolean(ogPath && ogPath.startsWith(`/events/${slug}/opengraph-image`))
  verdict(
    'the event page declares its OWN card as og:image, not the site card',
    perEvent && Boolean(ev.ogWidth) && Boolean(ev.ogHeight),
    `og:image ${ev.ogImage ?? 'ABSENT'} (${ev.ogWidth ?? '?'} x ${ev.ogHeight ?? '?'}, ${ev.ogType ?? 'no type'}); twitter:image ${ev.twitterImage ? 'present' : 'absent'}; the kit's "Preview your card" link is ${previewHref ?? 'ABSENT'}`,
  )
  if (ogUrl) {
    const onBase = `${BASE}${ogUrl.pathname}${ogUrl.search}`
    const ogRes = await publicPage.request.get(onBase)
    const ogBytes = Buffer.from(await ogRes.body())
    writeFileSync(join(OUT, '05-og-card.png'), ogBytes)
    sheet.push({ title: 'The per-event card every shared link unfurls as (og:image)', file: '05-og-card.png' })
    const shape = await imageShape(ogBytes)
    const type = ogRes.headers()['content-type'] ?? ''
    const declared = { w: Number(ev.ogWidth), h: Number(ev.ogHeight) }

    // The same route for a slug that does not exist: the designed fallback.
    const fallbackRes = await publicPage.request.get(`${BASE}/events/${slug}-does-not-exist-${accountStamp}/opengraph-image`)
    const fallbackBytes = Buffer.from(await fallbackRes.body())
    writeFileSync(join(OUT, '05-og-fallback.png'), fallbackBytes)
    let meanDiff = 0
    try {
      const a = await sharp(ogBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const b = await sharp(fallbackBytes).resize(a.info.width, a.info.height).ensureAlpha().raw().toBuffer()
      let total = 0
      for (let i = 0; i < a.data.length; i += 1) total += Math.abs(a.data[i] - b[i])
      meanDiff = total / a.data.length
    } catch (error) {
      console.warn(`[kit] could not compare the card with the fallback: ${String(error?.message ?? error).slice(0, 90)}`)
    }
    const ok =
      ogRes.status() === 200 &&
      type.startsWith('image/') &&
      Boolean(shape) &&
      shape.width === declared.w &&
      shape.height === declared.h &&
      shape.ink > MIN_INK_STDEV &&
      fallbackRes.status() === 200 &&
      meanDiff > MIN_FALLBACK_DIFF
    verdict(
      'the per-event card decodes at the declared size, carries ink, and is THIS event\'s card rather than the fallback',
      ok,
      `fetched ${onBase.replace(BASE, '')} on the server under test: HTTP ${ogRes.status()} ${type || 'no content-type'}, ${shape ? `${shape.width} x ${shape.height} ${shape.format}` : 'UNREADABLE'} (declared ${declared.w} x ${declared.h}), ${(ogBytes.length / 1024).toFixed(0)} KB, ink stdev ${shape ? shape.ink.toFixed(1) : '0'}; the fallback for a missing slug is ${(fallbackBytes.length / 1024).toFixed(0)} KB and the mean pixel difference between them is ${meanDiff.toFixed(1)} (must exceed ${MIN_FALLBACK_DIFF})`,
      '05-og-card.png',
    )
  }
  await stranger.close()

  // ── ARTEFACT 6: every tracked link ───────────────────────────────────────
  const { data: links } = await db.from('share_links').select('code, channel').eq('event_id', eventId)
  const linkResults = []
  for (const l of links ?? []) {
    const r = await page.request.get(`${BASE}/e/${l.code}`, { maxRedirects: 0 }).catch(() => null)
    const status = r?.status() ?? 0
    const to = r?.headers()?.location ?? ''
    linkResults.push({ ...l, status, to: to.slice(0, 90) })
  }
  const badLinks = linkResults.filter((l) => l.status >= 400 || l.status === 0)
  const channelsMinted = new Set((links ?? []).map((l) => l.channel))
  const unminted = ARTEFACT_CHANNELS.filter((c) => !channelsMinted.has(c))
  verdict(
    'every tracked share link resolves and lands on this event, one per channel plus the QR',
    (links?.length ?? 0) > 0 && badLinks.length === 0 && unminted.length === 0 && channelsMinted.has('qr'),
    `${links?.length ?? 0} link(s) minted: ${linkResults.map((l) => `${l.channel}=${l.status}${l.to ? ` -> ${l.to}` : ''}`).join(', ')}${badLinks.length ? ` :: ${badLinks.length} BROKEN` : ''}${unminted.length ? ` :: NOT MINTED for ${unminted.join(', ')}` : ''}`,
  )

  // ── ARTEFACT 7: the reach panel ──────────────────────────────────────────
  await page.goto(kitUrl, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(5000)
  const reach = await page.evaluate(() => {
    const text = document.body.innerText || ''
    const idx = text.search(/reach/i)
    return { mentionsReach: idx !== -1, excerpt: idx === -1 ? '' : text.slice(idx, idx + 320).replace(/\s+/g, ' ') }
  })
  const reachEl = await page.$('text=/reach/i')
  if (reachEl) await reachEl.scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(800)
  await page.screenshot({ path: join(OUT, '06-reach-panel.png'), fullPage: true })
  sheet.push({ title: 'The reach panel', file: '06-reach-panel.png' })
  verdict(
    'the reach panel renders a real state rather than a blank',
    reach.mentionsReach && reach.excerpt.trim().length > 30,
    reach.mentionsReach ? `"${reach.excerpt.slice(0, 220)}"` : 'no reach panel found on the kit screen at all',
    '06-reach-panel.png',
  )

  await ctx.close()
} catch (err) {
  note(j, 'ABORTED', String(err?.message ?? err))
  j.blockers.push(`aborted: ${String(err?.message ?? err)}`)
} finally {
  await browser.close()
}

// ── the contact sheet, so a person can look at all of it at once ───────────
const rows = sheet
  .map(
    (s) =>
      `<figure><figcaption>${s.title}</figcaption>` +
      (s.file.endsWith('.pdf')
        ? `<embed src="${s.file}" type="application/pdf" width="100%" height="900">`
        : `<img src="${s.file}" alt="${s.title}">`) +
      `</figure>`,
  )
  .join('\n')
const failed = results.filter((r) => !r.ok).length
const verdictRows = results
  .map((r) => `<tr class="${r.ok ? 'ok' : 'bad'}"><td>${r.ok ? 'PASS' : 'FAIL'}</td><td>${r.name}</td><td>${r.detail}</td><td>${r.file ? `<a href="${r.file}">${r.file}</a>` : ''}</td></tr>`)
  .join('\n')
writeFileSync(
  join(OUT, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Launch Kit artefacts ${stamp} (${viewportLabel})</title>
<style>body{font-family:system-ui;margin:24px;background:#f6f7f9;color:#0A1628}
figure{margin:0 0 32px;background:#fff;padding:16px;border-radius:12px;box-shadow:0 2px 12px rgba(10,22,40,.08)}
figcaption{font-weight:700;margin-bottom:12px}img{max-width:100%;height:auto;display:block}
table{border-collapse:collapse;background:#fff;margin:0 0 32px;font-size:13px}td{border-bottom:1px solid #e5e7eb;padding:6px 10px;vertical-align:top}
tr.ok td:first-child{color:#166534;font-weight:700}tr.bad td:first-child{color:#991b1b;font-weight:700}</style>
<h1>Launch Kit artefacts</h1>
<p>Every artefact the kit hands an organiser, generated ${new Date().toISOString()} at ${viewportLabel} against ${BASE} (event ${eventId ?? 'none'}, ${slug ? `/events/${slug}` : 'no slug'}).
${results.length - failed} of ${results.length} verdicts passed.</p>
<table>${verdictRows}</table>
${rows}`,
)
writeFileSync(
  join(OUT, 'results.json'),
  JSON.stringify(
    {
      stamp,
      viewport: viewportLabel,
      base: BASE,
      eventId,
      slug,
      formats: SOCIAL_CARD_ORDER,
      channels: ARTEFACT_CHANNELS,
      expectedCards: EXPECTED.length,
      passed: results.length - failed,
      total: results.length,
      verdicts: results,
    },
    null,
    2,
  ),
)

console.log('\n==== LAUNCH KIT ====')
for (const r of results) {
  console.log(`\n  ${(r.ok ? 'PASS' : 'FAIL').padEnd(6)} ${r.name}`)
  console.log(`         ${r.detail}`)
  if (r.file) console.log(`         artefact: ${join(OUT, r.file)}`)
}
console.log(`\n  ${results.length - failed} of ${results.length} passed at ${viewportLabel}.`)
console.log(`  Artefacts and contact sheet: ${join(OUT, 'index.html')}`)
await finish(j)
process.exit(failed > 0 ? 1 : 0)
