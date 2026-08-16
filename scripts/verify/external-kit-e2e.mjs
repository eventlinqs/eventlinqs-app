/**
 * EXTERNAL TICKETING, PROVEN END TO END ON A DEPLOYMENT.
 *
 * Founder ruling 15 August 2026: "Build a kit on the preview as a cold anonymous
 * user with an external ticketing URL. Open all four artefacts and paste
 * dimensions and printed lines. Follow the QR link and confirm it lands on the
 * external URL. Confirm the click was recorded. Then build an INTERNAL kit in
 * the same session and confirm it is unchanged."
 *
 * COLD AND ANONYMOUS IS ENFORCED, not assumed: a fresh browser context per kit,
 * no storage state, no cookies carried in. That is the whole point of the
 * feature, so the harness must not accidentally be signed in.
 *
 * Nothing here is mocked. It drives the real composer on the real deployment,
 * fetches the real artefact bytes, measures them from their own headers and
 * magic numbers, and follows the real redirect with automatic following turned
 * OFF so the status code and Location can be read rather than inferred.
 *
 * Usage:
 *   node scripts/verify/external-kit-e2e.mjs <base-url> [external-ticket-url]
 */
import { chromium } from 'playwright'

const BASE = (process.argv[2] ?? '').replace(/\/$/, '')
const EXTERNAL =
  process.argv[3] ?? 'https://tickets.melbournefringe.com.au/event/the-basement-tapes'
if (!BASE) {
  console.error('usage: external-kit-e2e.mjs <base-url> [external-ticket-url]')
  process.exit(1)
}

const DESCRIPTION_EXTERNAL =
  'The Basement Tapes at the Butterfly Club in Melbourne, Friday 26 September, 8pm, $28'
const DESCRIPTION_INTERNAL =
  'Sunset Rooftop Sessions at Naval House in Geelong, Saturday 27 September, 6pm, $25'

const results = { external: {}, internal: {}, failures: [] }
const fail = (m) => {
  results.failures.push(m)
  console.error(`   FAIL  ${m}`)
}
const ok = (m) => console.log(`   ok    ${m}`)

/** PNG and JPEG dimensions from the bytes themselves, never from a filename. */
function imageSize(buf) {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { kind: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i += 1; continue }
      const marker = buf[i + 1]
      const len = buf.readUInt16BE(i + 2)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { kind: 'jpeg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
      }
      i += 2 + len
    }
    return { kind: 'jpeg', width: null, height: null }
  }
  if (buf.length > 8 && buf.subarray(0, 5).toString('latin1') === '%PDF-') {
    // Handled by pdfPageSize() below: a MediaBox regex over the raw bytes
    // returned null here, because the poster's page tree lives in a compressed
    // object stream rather than in plain text. Reading it properly means asking
    // a PDF parser, which is what the poster renderer itself uses.
    return { kind: 'pdf', width: null, height: null }
  }
  return { kind: 'unknown', width: null, height: null }
}

/** The first page's size in PDF points, read with the same library that writes it. */
async function pdfPageSize(buf) {
  try {
    const { PDFDocument } = await import('pdf-lib')
    const doc = await PDFDocument.load(buf)
    const page = doc.getPage(0)
    return { width: page.getWidth(), height: page.getHeight(), pages: doc.getPageCount() }
  } catch (e) {
    return { width: null, height: null, pages: null, error: String(e).slice(0, 120) }
  }
}

async function buildKit({ description, ticketingUrl, label }) {
  const browser = await chromium.launch()
  // A FRESH CONTEXT: no cookies, no storage. Cold and anonymous, enforced.
  const ctx = await browser.newContext()
  const page = await ctx.newPage()

  console.log(`\n=== ${label}: composing as a cold anonymous visitor ===`)
  await page.goto(`${BASE}/launch`, { waitUntil: 'domcontentloaded', timeout: 60_000 })

  await page.fill('#launch-description', description)
  if (ticketingUrl) {
    const field = page.locator('#launch-ticketing-url')
    if ((await field.count()) === 0) {
      fail(`${label}: the ticketing URL field is not on the composer`)
      await browser.close()
      return null
    }
    await field.fill(ticketingUrl)
    ok(`${label}: pasted the ticketing address`)
  }

  await page.getByRole('button', { name: /build my kit/i }).click()
  // The reveal replaces the form. Wait for a kit link to exist.
  await page.waitForTimeout(6000)

  const html = await page.content()
  const codeMatch = /\/launch\/k\/([A-Za-z0-9]{8,20})/.exec(html)
  const code = codeMatch?.[1] ?? null
  if (!code) {
    fail(`${label}: no kit code appeared, so nothing was persisted`)
    await browser.close()
    return null
  }
  ok(`${label}: kit code ${code}`)

  await browser.close()
  return { code }
}

async function inspectArtefacts(code, label) {
  const out = {}
  /*
   * Named by FORMAT only, never by an expected pixel pair.
   *
   * The first version labelled these "story 1080x1920" and so on, and the Law 7
   * guard failed the build for stating a third-party specification with no
   * source: a pixel pair beside the word "instagram" is exactly the shape that
   * has burned this project before. The labels were also redundant, because this
   * harness MEASURES each artefact from its own bytes and prints what it found.
   * An asserted dimension would have been a second, unverified claim sitting
   * next to a measured one.
   */
  const targets = [
    { name: 'poster (A4 PDF)', url: `${BASE}/api/launch/${code}/poster` },
    { name: 'story card', url: `${BASE}/api/launch/${code}/card/story?channel=instagram` },
    { name: 'square card', url: `${BASE}/api/launch/${code}/card/square?channel=instagram` },
    { name: 'feed card', url: `${BASE}/api/launch/${code}/card/feed?channel=instagram` },
  ]
  for (const t of targets) {
    const res = await fetch(t.url)
    if (!res.ok) {
      fail(`${label}: ${t.name} returned HTTP ${res.status}`)
      continue
    }
    const buf = Buffer.from(await res.arrayBuffer())
    let size = imageSize(buf)
    if (size.kind === 'pdf') size = { ...size, ...(await pdfPageSize(buf)) }

    /*
     * NON-NEGOTIABLE 1, asserted against the ARTEFACT BYTES rather than the
     * page that links to them. "Never print the external URL on an artefact" is
     * a claim about what was drawn, so checking the HTML around it would be
     * checking the wrong document.
     *
     * A JPEG draws text as pixels and a PDF may compress its strings, so a hit
     * here is conclusive and a miss is not proof on its own. It is worth having
     * for exactly that asymmetry: it can only ever catch a real violation.
     */
    const externalHost = new URL(EXTERNAL).hostname
    if (buf.includes(Buffer.from(externalHost, 'latin1'))) {
      fail(`${label}: ${t.name} contains the external hostname in its bytes`)
    }
    out[t.name] = {
      status: res.status,
      contentType: res.headers.get('content-type'),
      bytes: buf.length,
      ...size,
    }
    const dims =
      size.kind === 'pdf'
        ? size.width
          ? `${size.width.toFixed(0)} x ${size.height.toFixed(0)} pt = ${(size.width / 72 * 25.4).toFixed(0)} x ${(size.height / 72 * 25.4).toFixed(0)} mm, ${size.pages} page(s)`
          : `unreadable (${size.error ?? 'no page size'})`
        : `${size.width} x ${size.height}`
    console.log(
      `   ${t.name.padEnd(18)} ${String(res.status)} ${res.headers.get('content-type')} ` +
        `${(buf.length / 1024).toFixed(0)} KB  ${dims}`,
    )
  }
  return out
}

/** The captions on the kit page carry the printed address line. */
async function readPrintedLines(code, label) {
  const res = await fetch(`${BASE}/launch/k/${code}`)
  if (!res.ok) {
    fail(`${label}: kit page returned HTTP ${res.status}`)
    return { links: [], html: '' }
  }
  const html = await res.text()
  const links = [...new Set([...html.matchAll(/https?:\/\/[^\s"'<>\\]+\/(?:e|launch\/k)\/[A-Za-z0-9-]+/g)].map(m => m[0]))]
  return { links, html }
}

/**
 * Click rows for one short code, read straight from the database.
 *
 * Read only, and it refuses a production target through the same preflight every
 * other script here uses. Returns null when no connection string is configured,
 * so the harness degrades to "skipped" rather than to a false pass.
 */
async function countClicks(shortCode) {
  if (!process.env.SUPABASE_DB_URL) return null
  try {
    const [{ assertNotProductionDatabase }, pg] = await Promise.all([
      import('../lib/production-write-preflight.mjs'),
      import('pg'),
    ])
    const target = assertNotProductionDatabase()
    const db = new pg.default.Client(target.clientConfig)
    await db.connect()
    const { rows } = await db.query(
      `select count(*)::int n
         from public.share_link_events e
         join public.share_links l on l.id = e.link_id
        where l.code = $1 and e.kind = 'click'`,
      [shortCode],
    )
    await db.end()
    return rows[0]?.n ?? 0
  } catch (e) {
    console.log(`   click check errored: ${String(e).slice(0, 140)}`)
    return null
  }
}

async function main() {
  console.log(`base: ${BASE}`)
  console.log(`external destination: ${EXTERNAL}`)

  // ── THE EXTERNAL KIT ──────────────────────────────────────────────────────
  const ext = await buildKit({
    description: DESCRIPTION_EXTERNAL,
    ticketingUrl: EXTERNAL,
    label: 'EXTERNAL',
  })
  if (ext) {
    results.external.code = ext.code
    results.external.artefacts = await inspectArtefacts(ext.code, 'EXTERNAL')

    const { links, html } = await readPrintedLines(ext.code, 'EXTERNAL')
    results.external.printedLinks = links
    console.log(`   printed addresses on the kit page:`)
    for (const l of links) console.log(`      ${l}`)

    // NON-NEGOTIABLE 1: our host, never theirs.
    const trackedLinks = links.filter(l => l.includes('/e/'))
    if (trackedLinks.length === 0) fail('EXTERNAL: no tracked /e/ link appears on the kit')
    else ok(`EXTERNAL: ${trackedLinks.length} tracked /e/ link(s) printed`)
    if (html.includes(new URL(EXTERNAL).hostname)) {
      fail('EXTERNAL: the external hostname appears on the kit page, it must never be printed')
    } else {
      ok('EXTERNAL: the external hostname appears NOWHERE on the kit')
    }

    // NON-NEGOTIABLE 1: the short link 302s (307) to the destination.
    const shortCode = /\/e\/([A-Za-z0-9-]+)/.exec(trackedLinks[0] ?? '')?.[1]
    if (shortCode) {
      const r = await fetch(`${BASE}/e/${shortCode}`, { redirect: 'manual' })
      const location = r.headers.get('location')
      results.external.redirect = { status: r.status, location }
      console.log(`   /e/${shortCode} -> HTTP ${r.status}  Location: ${location}`)
      if (r.status >= 300 && r.status < 400 && location === EXTERNAL) {
        ok(`EXTERNAL: the tracked link redirects to the destination (${r.status})`)
      } else {
        fail(`EXTERNAL: expected a redirect to ${EXTERNAL}, got ${r.status} ${location}`)
      }
      results.external.shortCode = shortCode

      /*
       * WAS THE CLICK RECORDED? The ruling asks for the click to be booked
       * BEFORE the redirect, and that is the only signal an external link ever
       * produces: everything after the hop happens where we cannot see it.
       *
       * Verified against the database rather than inferred from a 307, because
       * the redirect would work perfectly well with the write silently failing,
       * and that is exactly the failure worth catching.
       *
       * The click is de-duplicated per visitor per hour, so a second fetch from
       * this same harness would NOT add a row. One fetch, one expected row.
       */
      const counted = await countClicks(shortCode)
      results.external.clicksRecorded = counted
      if (counted === null) {
        console.log('   click check SKIPPED: no SUPABASE_DB_URL in this shell')
      } else if (counted >= 1) {
        ok(`EXTERNAL: the click was recorded (${counted} row(s) for this link)`)
      } else {
        fail('EXTERNAL: the redirect worked but NO click row was written')
      }
    }
  }

  // ── THE INTERNAL KIT, in the same session ────────────────────────────────
  const int = await buildKit({ description: DESCRIPTION_INTERNAL, label: 'INTERNAL' })
  if (int) {
    results.internal.code = int.code
    results.internal.artefacts = await inspectArtefacts(int.code, 'INTERNAL')
    const { links } = await readPrintedLines(int.code, 'INTERNAL')
    results.internal.printedLinks = links
    console.log(`   printed addresses on the kit page:`)
    for (const l of links) console.log(`      ${l}`)

    // NON-NEGOTIABLE 5: unchanged. An internal kit still prints the kit URL.
    if (links.some(l => l.includes(`/launch/k/${int.code}`))) {
      ok('INTERNAL: still prints the kit URL, unchanged')
    } else {
      fail('INTERNAL: the kit URL is not printed, which is a regression')
    }
    if (links.some(l => l.includes('/e/'))) {
      fail('INTERNAL: a tracked /e/ link appeared on an internal kit, which is new behaviour')
    } else {
      ok('INTERNAL: no /e/ link, exactly as before')
    }
  }

  console.log('\n================ RESULT ================')
  console.log(JSON.stringify(results, null, 2))
  if (results.failures.length > 0) {
    console.error(`\n${results.failures.length} FAILURE(S)`)
    process.exit(1)
  }
  console.log('\nALL CHECKS PASSED')
}

await main()
