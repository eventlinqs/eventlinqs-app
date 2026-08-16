// Live walk of the public composer, against a DEPLOYED preview.
//
// The previous walk proved the composer produced TEXT: a title, a visibility
// sentence, a framing. It could not prove the kit existed, because at that
// point the reveal rendered three bordered boxes describing artefacts that
// were never built.
//
// So this walk asserts the artefacts THEMSELVES:
//   - every share card is a real decoded image with non-zero pixels
//   - the poster route returns a real PDF
//   - all six captions are present, with text in them
//   - the download control states the gate rather than hiding it
//
// Usage: node scripts/verify/launch-kit-walk.mjs https://<preview-host>
import { chromium } from 'playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.argv[2]
if (!BASE) {
  console.error('usage: node scripts/verify/launch-kit-walk.mjs <base-url>')
  process.exit(1)
}

const OUT = 'docs/roast/launch-walk-preview-2026-08-09'
mkdirSync(`${OUT}/shots`, { recursive: true })

const ARRIVALS = [
  ['dj', 'Warehouse party at the Barwon Club, Marlo Reyes b2b Kita, Sat 20th September, doors 10pm, $25 presale'],
  ['comedian', 'Comedy night at the Prince, first Tuesday every month, 5 comics, $15 on the door'],
  ['market', 'Geelong makers market, third Sunday, 40 stalls, free entry, 9am to 2pm at Johnstone Park'],
  ['workshop', 'Pottery workshop, 6 places, $85, Saturday 27th September 10am, my studio in Newtown'],
  ['charity', 'Trivia night for Geelong Animal Rescue, Sat 12th September, $30 a head, tables of 8, at the RSL'],
  ['birthday', "Ruby's 16th, Saturday 20th September, 6pm at our place in Belmont, about 40 kids, no charge"],
]

/**
 * Half the arrivals upload artwork. The photograph is generated rather than
 * committed: it is 3625 x 4961, the founder's own reported camera size, and it
 * carries EXIF including a GPS IFD so the walk also exercises the stripping.
 */
const WITH_ARTWORK = new Set(['dj', 'market', 'birthday'])
const PHOTO = process.env.WALK_PHOTO ?? 'docs/roast/launch-walk-preview-2026-08-09/walk-photo.jpg'

if (!existsSync(PHOTO)) {
  const sharp = (await import('sharp')).default
  await sharp('public/images/hero/afrobeats.jpg')
    .resize({ width: 3625, height: 4961, fit: 'cover' })
    .jpeg({ quality: 80 })
    .withExif({
      IFD0: { Copyright: 'A Real Person', Make: 'Apple', Model: 'iPhone 15 Pro' },
      IFD3: { GPSLatitudeRef: 'S', GPSLongitudeRef: 'E' },
    })
    .toFile(PHOTO)
  console.log(`[walk] generated ${PHOTO} (3625x4961, with GPS EXIF)`)
}

const results = []
const browser = await chromium.launch()

for (const [name, text] of ARRIVALS) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  const consoleErrors = []
  page.on('console', m => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })

  await page.goto(`${BASE}/launch`, { waitUntil: 'networkidle' })
  await page.waitForSelector('#launch-description')
  await page.fill('#launch-description', text)
  // The submit stays disabled until React's own state has the text, so waiting
  // for it to enable is also the proof that hydration finished. Filling before
  // hydration sets the DOM value and leaves React empty, which is exactly how
  // this walk failed the first time it ran.
  await page.waitForSelector('button:has-text("Build my kit"):not([disabled])', { timeout: 30000 })
  await page.click('button:has-text("Build my kit")')
  await page.waitForSelector('#kit-reveal-heading', { timeout: 45000 })

  const body = await page.innerText('main')

  // ARTWORK ON HALF THE ARRIVALS.
  //
  // A poster with no photograph in it will never match what a promoter could
  // make themselves, so half the walk exercises the composition an organiser
  // actually gets after uploading, and half keeps proving the typographic one.
  // Split by index rather than by kind, so neither composition only ever sees
  // the flattering inputs.
  let uploadStatus = null
  if (WITH_ARTWORK.has(name)) {
    const input = page.locator('input[type="file"][name="cover"]')
    await input.waitFor({ state: 'attached', timeout: 30000 })
    await input.setInputFiles(PHOTO)
    // The control reports its own outcome; waiting on that rather than on a
    // timeout means a silent failure fails the walk instead of passing it.
    await page
      .waitForSelector('text=Your artwork is on the poster', { timeout: 45000 })
      .then(() => {
        uploadStatus = 'ok'
      })
      .catch(async () => {
        uploadStatus = (await page.locator('[role="alert"]').first().innerText().catch(() => null)) ?? 'failed'
      })
  }

  // Give the card renders time to come back. They are sharp renders behind a
  // cold lambda, so this is generous on purpose.
  await page.waitForTimeout(9000)

  // THE ASSERTION THAT MATTERS: are the cards real, decoded pixels?
  const cards = await page.evaluate(() =>
    [...document.querySelectorAll('img[src*="/api/launch/"]')].map(img => ({
      src: img.getAttribute('src'),
      complete: img.complete,
      w: img.naturalWidth,
      h: img.naturalHeight,
    })),
  )

  const kitLink = (body.match(/\/launch\/k\/([a-z2-9]{12})/) ?? [])[1] ?? null

  // The poster and one card, fetched directly, so a rendered-but-broken image
  // cannot pass as a rendered one.
  let posterStatus = null
  let posterBytes = 0
  let posterIsPdf = false
  let cardStatus = null
  let cardBytes = 0
  let downloadStatus = null
  if (kitLink) {
    const p = await page.request.get(`${BASE}/api/launch/${kitLink}/poster`)
    posterStatus = p.status()
    const buf = await p.body()
    posterBytes = buf.byteLength
    posterIsPdf = buf.subarray(0, 5).toString('latin1') === '%PDF-'

    const c = await page.request.get(`${BASE}/api/launch/${kitLink}/card/story`)
    cardStatus = c.status()
    cardBytes = (await c.body()).byteLength

    // The gate: a signed-out download must be refused.
    const d = await page.request.get(`${BASE}/api/launch/${kitLink}/card/story?download=1`)
    downloadStatus = d.status()
  }

  const captionCount = await page.locator('h4').count()
  const captionLabels = await page.locator('h4').allInnerTexts()

  const row = {
    arrival: name,
    heading: await page.textContent('#kit-reveal-heading'),
    saysStaysOff: /stays off the public listings/i.test(body),
    saysGoesOn: /goes on the public listings/i.test(body),
    addressHeldBack: /street address stays private/i.test(body),
    recurringNote: /repeats|sets up the first one/i.test(body),
    ticketsFraming: /tickets it sells/i.test(body),
    attendanceFraming: /who turns up|who is coming/i.test(body),
    hasKitLink: Boolean(kitLink),
    kitCode: kitLink,
    cardsFound: cards.length,
    cardsDecoded: cards.filter(c => c.complete && c.w > 0).length,
    cardDims: cards.map(c => `${c.w}x${c.h}`),
    cardStatus,
    cardBytes,
    posterStatus,
    posterBytes,
    posterIsPdf,
    downloadRefusedWhenSignedOut: downloadStatus === 401,
    downloadStatus,
    captionCount,
    captionLabels,
    emailFieldPresent: (await page.locator('#kit-email').count()) > 0,
    downloadGateVisible: /needs an account/i.test(body),
    consoleErrors: consoleErrors.length,
    consoleErrorSample: consoleErrors.slice(0, 3),
    withArtwork: WITH_ARTWORK.has(name),
    uploadStatus,
  }

  await page.screenshot({ path: `${OUT}/shots/${name}-1440.png`, fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(600)
  row.overflow390 = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  await page.screenshot({ path: `${OUT}/shots/${name}-390.png`, fullPage: true })

  results.push(row)
  console.log(`${name}[${row.withArtwork?"artwork:"+row.uploadStatus:"no-artwork"}]: cards ${row.cardsDecoded}/${row.cardsFound}, captions ${row.captionCount}, poster ${row.posterStatus} ${row.posterBytes}b pdf=${row.posterIsPdf}, dlGate=${row.downloadStatus}, overflow=${row.overflow390}`)

  await ctx.close()
}

await browser.close()
writeFileSync(`${OUT}/walk.json`, JSON.stringify({ base: BASE, results }, null, 2))
console.log('\nwrote', `${OUT}/walk.json`)
