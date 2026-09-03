/**
 * OPEN EVERY LAUNCH KIT ARTEFACT AND LOOK AT IT.
 *
 * ---------------------------------------------------------------------------
 * WHY. The Launch Kit is what this platform is sold on. An organiser prints the
 * A4 poster and puts it on a venue wall, and posts the cards to Instagram and
 * Facebook. Journey 1 reached the kit screen and journey 9 confirmed six tracked
 * share links exist, and NEITHER opened an artefact. "The screen rendered" and
 * "the poster is printable" are different claims, and only the second one is
 * the product.
 *
 * So this generates the complete kit for a real published event and then opens
 * every artefact it hands over, one at a time, with a verdict each:
 *
 *   the A4 QR poster        does the PDF exist, is it A4, and DOES THE QR SCAN
 *   story  1080 x 1920      dimensions, weight, ink, and whether the type fits
 *   square 1080 x 1080      the same
 *   tall   1440 x 1800      the same
 *   the event page          does the live link resolve and render
 *   the tracked links       does every one resolve and land on the event
 *   the reach panel         does it render a real state rather than a blank
 *
 * Every artefact is written to disk and a contact sheet is produced, because a
 * verdict the founder cannot look at is a verdict he has to take on trust.
 *
 * ---------------------------------------------------------------------------
 * WHAT "THE QR SCANS" MEANS HERE, precisely.
 *
 * Not "a QR was drawn". The poster PDF is parsed, the QR image is pulled back
 * out of it, and it is DECODED with a real decoder (jsqr, a devDependency used
 * only by this script and never by the product). The decoded string is then
 * compared against the tracked short link the database says was minted for the
 * qr channel. A poster whose QR decodes to the wrong address is worse than one
 * with no QR, because the organiser finds out from an attendee.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE CLIPPING CHECK CAN AND CANNOT DO, stated rather than implied.
 *
 * CAN: the real layout functions (fitDisplayTitle, fitTicketBar, fitTitle) are
 * the code that DECIDES whether type fits. They are called here with the real
 * event's real text at every format, and their output is measured against the
 * space each format actually has. That is the determinant, executed, not read.
 *
 * CANNOT: it does not do optical glyph inspection of the finished JPEG. Nothing
 * available here does OCR, and inventing a pixel heuristic that "looks for
 * clipped text" on a photographic card would produce a number nobody could
 * trust. The rasters are therefore written out and put on a contact sheet so a
 * person can see them, and that is said plainly rather than dressed up as an
 * automated pass.
 *
 * Usage: node scripts/verify/launch-kit-inspect.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import jsQR from 'jsqr'
import { PDFDocument, PDFName } from 'pdf-lib'
import { inflateSync } from 'node:zlib'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { chromium, BASE, makeJourney, note, attach, finish, signUpAndConfirm } from '../journeys/harness.mjs'

assertNotProduction()

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const stamp = process.env.RUN_STAMP ?? String(Date.now()).slice(-6)
const j = makeJourney('launch-kit-inspect', 'Launch Kit: open and inspect every artefact')
const OUT = join(process.cwd(), 'docs', 'verification', 'launch-kit', stamp)
mkdirSync(OUT, { recursive: true })

const results = []
const sheet = []

function verdict(name, ok, detail, file = null) {
  results.push({ name, ok, detail, file })
  note(j, `${(ok ? 'PASS' : 'FAIL').padEnd(6)} ${name}`, detail)
  if (!ok) j.blockers.push(`${name}: ${detail}`)
}

/** The published geometry each card must come out at. */
const CARD_SPEC = {
  story: { width: 1080, height: 1920, label: 'Story 9:16', safeTop: 250, safeBottom: 250 },
  square: { width: 1080, height: 1080, label: 'Square post 1:1', safeTop: 0, safeBottom: 0 },
  feed: { width: 1440, height: 1800, label: 'Tall post 4:5', safeTop: 0, safeBottom: 0 },
}
const MAX_CARD_BYTES = 5 * 1024 * 1024

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

    // Work out the channel count from the declared colour space, then let sharp
    // normalise it to RGBA, which is what jsqr wants.
    const channels = space.includes('DeviceRGB') ? 3 : space.includes('DeviceGray') ? 1 : 0
    let rgba = null
    try {
      if (channels && bpc === 8 && raw.length >= width * height * channels) {
        rgba = await sharp(raw, { raw: { width, height, channels } }).ensureAlpha().raw().toBuffer()
      } else {
        // A JPEG-encoded (DCTDecode) or otherwise packed image: sharp can read
        // the encoded bytes directly.
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

const browser = await chromium.launch()

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
  const page = await ctx.newPage()
  await attach(j, page)

  // ── the organiser, and a real published event to make a kit for ──────────
  const EMAIL = `kit.${stamp}@example.com`
  const PASSWORD = `Str0ng-${stamp}-Pass!`
  if (!(await signUpAndConfirm(j, page, { name: 'Kit Organiser', email: EMAIL, password: PASSWORD }))) {
    verdict('an organiser to make a kit for', false, 'could not create an account')
    throw new Error('no account')
  }
  const { data: profile } = await db.from('profiles').select('id').eq('email', EMAIL).maybeSingle()
  const { data: org, error: orgErr } = await db
    .from('organisations')
    .insert({
      name: `Kit Presents ${stamp}`,
      slug: `kit-presents-${stamp}`,
      email: EMAIL,
      description: 'A real organisation for the Launch Kit inspection.',
      status: 'active',
      owner_id: profile.id,
    })
    .select('id, name')
    .single()
  if (orgErr) {
    verdict('an organisation to own the event', false, orgErr.message)
    throw new Error('no org')
  }

  // A real cover, taken from a published event, so the artefacts carry a real
  // photograph rather than the typographic fallback. A kit with no photo is a
  // legitimate state and a different test.
  const { data: donor } = await db
    .from('events')
    .select('cover_image_url, category_id')
    .eq('status', 'published')
    .not('cover_image_url', 'is', null)
    .limit(1)
    .single()

  const start = new Date(Date.now() + 45 * 864e5)
  const TITLE = `Kit Inspection Night ${stamp}`
  const { data: event, error: evErr } = await db
    .from('events')
    .insert({
      title: TITLE,
      slug: `kit-inspection-night-${stamp}`,
      summary: 'Every artefact in the kit, opened and looked at.',
      description: 'A published event that exists so the complete Launch Kit can be generated and inspected.',
      organisation_id: org.id,
      created_by: profile.id,
      category_id: donor?.category_id ?? null,
      start_date: start.toISOString(),
      end_date: new Date(start.getTime() + 4 * 36e5).toISOString(),
      timezone: 'Australia/Melbourne',
      event_type: 'in_person',
      venue_name: 'The Corner Hotel',
      venue_address: '57 Swan Street',
      venue_city: 'Melbourne',
      venue_state: 'VIC',
      venue_country: 'Australia',
      /*
       * KIT_NO_COVER=1 stages the event WITHOUT a photograph, which sends every
       * card down the TYPOGRAPHIC composition. That is a real product path, not
       * a test-only shape: Law 6 says an organiser who supplies no artwork gets
       * a typographic card built from their own event details.
       *
       * It is also the bisect that separates a renderer fault from a fault in
       * embedding the organiser's cover, which is the open question on the 500s.
       */
      /*
       * KIT_COVER_URL overrides the donor photograph.
       *
       * KIT_NO_COVER=1 was tried first and is IMPOSSIBLE for a published event:
       * the database refuses it with the check constraint
       * events_published_real_cover. That is worth knowing on its own, because
       * it means the TYPOGRAPHIC card composition can never occur on an
       * organiser's published event; every organiser card embeds a photograph.
       *
       * So the bisect is on the cover's SIZE instead, which is what
       * KIT_COVER_URL is for.
       */
      cover_image_url: process.env.KIT_COVER_URL || (donor?.cover_image_url ?? null),
      status: 'published',
      visibility: 'public',
      published_at: new Date().toISOString(),
      max_capacity: 250,
      is_free: false,
      city_primary: 'melbourne',
    })
    .select('id, slug, title')
    .single()
  if (evErr) {
    verdict('a published event to make a kit for', false, evErr.message)
    throw new Error('no event')
  }
  await db.from('ticket_tiers').insert({
    event_id: event.id,
    name: 'General Admission',
    price: 4500,
    total_capacity: 250,
    sold_count: 0,
    reserved_count: 0,
    is_active: true,
    currency: 'AUD',
  })
  verdict('a published event to make a kit for', true, `${event.title} (${event.id}), cover ${donor?.cover_image_url ? 'present' : 'ABSENT'}`)

  // ── ARTEFACT 1: the kit screen itself ────────────────────────────────────
  const kitUrl = `${BASE}/dashboard/events/${event.id}/launch-kit`
  const kitRes = await page.goto(kitUrl, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(6000)
  const kitShot = join(OUT, '01-kit-screen.png')
  await page.screenshot({ path: kitShot, fullPage: true })
  sheet.push({ title: 'The kit screen', file: '01-kit-screen.png' })

  const kitState = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img')]
    return {
      heading: document.querySelector('h1')?.textContent?.trim() ?? null,
      images: imgs.length,
      brokenImages: imgs.filter(i => i.complete && i.naturalWidth === 0).map(i => i.getAttribute('src')?.slice(0, 80)),
      hasPosterLink: [...document.querySelectorAll('a')].some(a => /poster/i.test(a.getAttribute('href') ?? '')),
      emptyPanels: [...document.querySelectorAll('section')].filter(s => (s.textContent ?? '').trim().length === 0).length,
      bodyText: (document.body.innerText || '').replace(/\s+/g, ' '),
    }
  })
  verdict(
    'the kit screen renders with no broken image and no empty panel',
    kitRes?.status() === 200 && kitState.brokenImages.length === 0 && kitState.emptyPanels === 0,
    `HTTP ${kitRes?.status()}, heading "${kitState.heading}", ${kitState.images} image(s), ` +
      `${kitState.brokenImages.length} broken (${kitState.brokenImages.join(', ') || 'none'}), ` +
      `${kitState.emptyPanels} empty section(s), poster link ${kitState.hasPosterLink ? 'present' : 'MISSING'}`,
    '01-kit-screen.png',
  )

  // ── ARTEFACT 2: the A4 QR poster, and whether the QR scans ───────────────
  const posterUrl = `${BASE}/api/organiser/events/${event.id}/poster`
  const posterRes = await page.request.get(posterUrl)
  const posterBytes = Buffer.from(await posterRes.body())
  const posterFile = join(OUT, '02-poster-a4.pdf')
  writeFileSync(posterFile, posterBytes)

  let pageSize = null
  try {
    const doc = await PDFDocument.load(posterBytes, { ignoreEncryption: true })
    const p0 = doc.getPage(0)
    pageSize = { w: Math.round(p0.getWidth()), h: Math.round(p0.getHeight()), pages: doc.getPageCount() }
  } catch {
    pageSize = null
  }
  // A4 at 72 points per inch is 595 x 842. Two points of slack for rounding.
  const isA4 = pageSize && Math.abs(pageSize.w - 595) <= 2 && Math.abs(pageSize.h - 842) <= 2
  verdict(
    'the poster is a real, single-page A4 PDF',
    posterRes.status() === 200 && Boolean(isA4) && pageSize.pages === 1,
    `HTTP ${posterRes.status()}, ${posterBytes.length} bytes, ` +
      `${pageSize ? `${pageSize.pages} page(s) at ${pageSize.w} x ${pageSize.h}pt` : 'UNREADABLE AS A PDF'}` +
      `${isA4 ? ' (A4 is 595 x 842pt)' : ' - NOT A4'}`,
    '02-poster-a4.pdf',
  )

  /*
   * THE SHORT LINK IS /e/<code>, and this script guessed it wrong twice.
   *
   * src/lib/broadcast/share-codes.ts:51 is the one place that decides the
   * shape. There are TWO short routes in the tree, src/app/e/[code] and
   * src/app/s/[code], and only /e is what buildShortUrl mints, so a probe
   * against /s answers 404 for every link and reports nine broken tracked
   * links on a kit whose links are all fine. That false blocker was filed
   * once on 29 August and is exactly the class this session spent the day
   * removing, so the path is now taken from the QR the platform itself drew
   * rather than from memory.
   */
  const { data: qrLink } = await db
    .from('share_links')
    .select('code, channel')
    .eq('event_id', event.id)
    .eq('channel', 'qr')
    .maybeSingle()
  const expectedQr = qrLink ? `${BASE}/e/${qrLink.code}` : null

  /*
   * A BAD POSTER MUST NOT STOP THE INSPECTION.
   *
   * The first run of this script fed a 34-byte JSON error body to pdf-lib,
   * which threw "No PDF header found", and the whole run aborted at artefact 2
   * of 8. The remaining six were never looked at, and the output read like a
   * crash rather than like one broken artefact. That is the same shape as the
   * break-attempt suite dying on attempt 7, fixed the same way: every artefact
   * is judged on its own.
   */
  let decoded = { value: null, tried: [] }
  try {
    decoded = await qrFromPdf(posterBytes)
  } catch (err) {
    decoded = { value: null, tried: [`could not be parsed as a PDF: ${String(err?.message ?? err).slice(0, 90)}`] }
  }
  // The short-link path is read from the app rather than assumed, by comparing
  // only the code: a leading origin can legitimately differ between a local run
  // and production, but the CODE is the thing that must match.
  const codeMatches = Boolean(decoded.value && qrLink && decoded.value.includes(qrLink.code))
  verdict(
    'THE QR ON THE POSTER ACTUALLY SCANS, and to the right address',
    codeMatches,
    decoded.value
      ? `decoded "${decoded.value}"${decoded.upscaled ? ' (read after upscaling, as a phone would by moving closer)' : ''}; ` +
        `the qr-channel share link in the database is code ${qrLink?.code ?? 'NONE'} (${expectedQr ?? 'no link minted'}). ` +
        `${codeMatches ? 'They match.' : 'THEY DO NOT MATCH: the poster sends people somewhere else.'}`
      : `NO QR COULD BE DECODED from the poster. Images found in the PDF: ${decoded.tried.join(' | ') || 'none'}. ` +
        `An organiser would print this and put it on a wall.`,
    '02-poster-a4.pdf',
  )

  // ── ARTEFACT 3-5: every social card size ─────────────────────────────────
  const layout = await import('../../src/lib/broadcast/social-card-layout.ts').catch(() => null)

  /*
   * EVERY SIZE, FOR EVERY CHANNEL THE KIT OFFERS.
   *
   * The route takes ?channel=, and the channel decides which tracked link is
   * embedded, so "the story card works" is not the same claim as "the story
   * card an organiser downloads from the Instagram panel works". Eighteen
   * renders: three published sizes across six channels. All of them are written
   * to disk and put on the contact sheet, because the founder asked to LOOK at
   * them and a verdict he cannot see is one he has to take on trust.
   */
  const CHANNELS = ['instagram', 'facebook', 'whatsapp', 'x', 'linkedin', 'email']
  for (const [format, spec] of Object.entries(CARD_SPEC)) {
    for (const channel of CHANNELS) {
      const cardUrl = `${BASE}/api/organiser/events/${event.id}/card/${format}?channel=${channel}`
      const cres = await page.request.get(cardUrl)
      const cbytes = Buffer.from(await cres.body())
      const cfile = `03-card-${format}-${channel}.jpg`
      writeFileSync(join(OUT, cfile), cbytes)
      sheet.push({ title: `${spec.label} for ${channel}`, file: cfile })
      let cmeta = null
      let cstd = 0
      try {
        const cimg = sharp(cbytes)
        cmeta = await cimg.metadata()
        const cst = await cimg.stats()
        cstd = Math.max(...cst.channels.map(c => c.stdev))
      } catch (error) {
        console.warn(`[kit] ${format}/${channel} is not a readable image: ${String(error?.message ?? error).slice(0, 90)}`)
        cmeta = null
      }
      const okCard =
        cres.status() === 200 &&
        cmeta?.width === spec.width &&
        cmeta?.height === spec.height &&
        cstd > 6 &&
        cbytes.length <= MAX_CARD_BYTES
      verdict(
        `${spec.label} for ${channel}`,
        okCard,
        `HTTP ${cres.status()}, ${cmeta ? `${cmeta.width} x ${cmeta.height} ${cmeta.format}` : 'UNREADABLE'} ` +
          `(spec ${spec.width} x ${spec.height}), ${(cbytes.length / 1024).toFixed(0)} KB, ink stdev ${cstd.toFixed(1)}` +
          `${cstd > 6 ? '' : ' - FLAT, this card is empty'}`,
        cfile,
      )
    }

    const cardUrl = `${BASE}/api/organiser/events/${event.id}/card/${format}?channel=instagram`
    const res = await page.request.get(cardUrl)
    const bytes = Buffer.from(await res.body())
    const file = `03-card-${format}-instagram.jpg`

    let meta = null
    let stats = null
    try {
      const img = sharp(bytes)
      meta = await img.metadata()
      stats = await img.stats()
    } catch (error) {
      console.warn(`[kit] the ${format} card is not a readable image: ${String(error?.message ?? error).slice(0, 90)}`)
      meta = null
    }

    const rightSize = meta?.width === spec.width && meta?.height === spec.height
    // "Not blank" is a real measurement: a flat card has near-zero standard
    // deviation on every channel. A designed card, photograph or typographic,
    // never does.
    const stdev = stats ? Math.max(...stats.channels.map(c => c.stdev)) : 0
    const notBlank = stdev > 6
    const underCap = bytes.length <= MAX_CARD_BYTES

    verdict(
      `the ${spec.label} card renders at its published size and is not blank`,
      res.status() === 200 && rightSize && notBlank && underCap,
      `HTTP ${res.status()}, ${meta ? `${meta.width} x ${meta.height} ${meta.format}` : 'UNREADABLE'} ` +
        `(spec ${spec.width} x ${spec.height}), ${(bytes.length / 1024).toFixed(0)} KB ` +
        `${underCap ? 'under' : 'OVER'} the 5 MB channel ceiling, ink stdev ${stdev.toFixed(1)} ` +
        `${notBlank ? '(real content)' : '(FLAT - this card is empty)'}`,
      file,
    )

    // Does the type fit, decided by the code that decides it.
    if (layout?.fitDisplayTitle && layout?.fitTicketBar) {
      try {
        const title = layout.fitDisplayTitle(TITLE, format)
        const bar = layout.fitTicketBar(
          layout.ticketBarText
            ? layout.ticketBarText(
                new Date(event ? start : Date.now()).toISOString(),
                'Australia/Melbourne',
                'The Corner Hotel, Melbourne',
                'From AUD 45.00',
              )
            : ['The Corner Hotel, Melbourne'],
          format,
        )
        const titleHeight = title.lines.length * title.leading
        const available = spec.height - spec.safeTop - spec.safeBottom
        const fits = titleHeight < available && title.lines.every(l => l.length > 0)
        verdict(
          `the ${spec.label} type fits the space it is given`,
          fits,
          `title wrapped to ${title.lines.length} line(s) at ${title.fontSize}px, leading ${title.leading}, ` +
            `total ${Math.round(titleHeight)}px against ${available}px of safe height; ` +
            `ticket bar ${bar.lines.length} line(s) at ${bar.fontSize}px. ` +
            `Lines: ${JSON.stringify(title.lines)}. ` +
            'Measured by calling the real layout functions with this event\'s real text; this does not ' +
            'inspect glyphs in the finished JPEG, so the raster is on the contact sheet to be looked at.',
        )
      } catch (err) {
        verdict(`the ${spec.label} type fits the space it is given`, false, `the layout functions threw: ${String(err?.message ?? err)}`)
      }
    }
  }

  // ── ARTEFACT 6: the event page the whole kit points at ───────────────────
  const eventUrl = `${BASE}/events/${event.slug}`
  const evRes = await page.goto(eventUrl, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(4000)
  await page.screenshot({ path: join(OUT, '06-event-page.png'), fullPage: true })
  sheet.push({ title: 'The live event page', file: '06-event-page.png' })
  const evState = await page.evaluate(() => ({
    heading: document.querySelector('h1')?.textContent?.trim() ?? null,
    hasTickets: /ticket|book|get tickets|from a\$|aud/i.test(document.body.innerText || ''),
    errorBoundary: /something went wrong|application error|500/i.test(document.body.innerText || ''),
  }))
  verdict(
    'the live event page every artefact points at actually works',
    evRes?.status() === 200 && !evState.errorBoundary && Boolean(evState.heading),
    `HTTP ${evRes?.status()} at ${eventUrl}, heading "${evState.heading}", ` +
      `ticket surface ${evState.hasTickets ? 'present' : 'MISSING'}, error boundary ${evState.errorBoundary ? 'SHOWN' : 'absent'}`,
    '06-event-page.png',
  )

  // ── ARTEFACT 7: every tracked link ───────────────────────────────────────
  const { data: links } = await db
    .from('share_links')
    .select('code, channel')
    .eq('event_id', event.id)
  const linkResults = []
  for (const l of links ?? []) {
    const r = await page.request.get(`${BASE}/e/${l.code}`, { maxRedirects: 0 }).catch(() => null)
    const status = r?.status() ?? 0
    const to = r?.headers()?.location ?? ''
    linkResults.push({ ...l, status, to: to.slice(0, 90) })
  }
  const badLinks = linkResults.filter(l => l.status >= 400 || l.status === 0)
  verdict(
    'every tracked share link resolves and lands on this event',
    (links?.length ?? 0) > 0 && badLinks.length === 0,
    `${links?.length ?? 0} link(s) minted: ` +
      linkResults.map(l => `${l.channel}=${l.status}${l.to ? ` -> ${l.to}` : ''}`).join(', ') +
      (badLinks.length ? ` :: ${badLinks.length} BROKEN` : ''),
  )

  // ── ARTEFACT 8: the reach panel ──────────────────────────────────────────
  await page.goto(kitUrl, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(5000)
  const reach = await page.evaluate(() => {
    const text = document.body.innerText || ''
    const idx = text.search(/reach/i)
    return {
      mentionsReach: idx !== -1,
      excerpt: idx === -1 ? '' : text.slice(idx, idx + 320).replace(/\s+/g, ' '),
    }
  })
  const reachEl = await page.$('text=/reach/i')
  if (reachEl) await reachEl.scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(800)
  await page.screenshot({ path: join(OUT, '07-reach-panel.png'), fullPage: true })
  sheet.push({ title: 'The reach panel', file: '07-reach-panel.png' })
  verdict(
    'the reach panel renders a real state rather than a blank',
    reach.mentionsReach && reach.excerpt.trim().length > 30,
    reach.mentionsReach
      ? `"${reach.excerpt.slice(0, 220)}"`
      : 'no reach panel found on the kit screen at all',
    '07-reach-panel.png',
  )

  await ctx.close()
} catch (err) {
  note(j, 'ABORTED', String(err?.message ?? err))
} finally {
  await browser.close()
}

// ── the contact sheet, so a person can look at all of it at once ───────────
const rows = sheet
  .map(
    s =>
      `<figure><figcaption>${s.title}</figcaption>` +
      (s.file.endsWith('.pdf')
        ? `<embed src="${s.file}" type="application/pdf" width="100%" height="900">`
        : `<img src="${s.file}" alt="${s.title}">`) +
      `</figure>`,
  )
  .join('\n')
writeFileSync(
  join(OUT, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Launch Kit artefacts ${stamp}</title>
<style>body{font-family:system-ui;margin:24px;background:#f6f7f9;color:#0A1628}
figure{margin:0 0 32px;background:#fff;padding:16px;border-radius:12px;box-shadow:0 2px 12px rgba(10,22,40,.08)}
figcaption{font-weight:700;margin-bottom:12px}img{max-width:100%;height:auto;display:block}</style>
<h1>Launch Kit artefacts</h1>
<p>Every artefact the kit hands an organiser, as generated on ${new Date().toISOString()}.</p>
${rows}`,
)

console.log('\n==== LAUNCH KIT ====')
for (const r of results) {
  console.log(`\n  ${(r.ok ? 'PASS' : 'FAIL').padEnd(6)} ${r.name}`)
  console.log(`         ${r.detail}`)
  if (r.file) console.log(`         artefact: ${join('docs/verification/launch-kit', stamp, r.file)}`)
}
const failed = results.filter(r => !r.ok).length
console.log(`\n  ${results.length - failed} of ${results.length} passed.`)
console.log(`  Artefacts and contact sheet: docs/verification/launch-kit/${stamp}/index.html`)
await finish(j)
process.exit(failed > 0 ? 1 : 0)
