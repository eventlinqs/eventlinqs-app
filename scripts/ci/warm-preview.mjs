/**
 * WARM THE PREVIEW BEFORE MEASURING IT, INCLUDING THE IMAGE OPTIMISER.
 *
 * ============================================================================
 * THE DEFECT THIS FIXES
 * ============================================================================
 *
 * The workflow step that calls this was called "Warm ISR + the next/image
 * optimiser", and it curled the PAGE twice. That warms ISR. It does not warm
 * the image optimiser at all, because every optimised image is a SEPARATE
 * request to `/_next/image?url=...&w=...&q=...`, each width generated on its
 * first request, and a request for the HTML never touches one.
 *
 * So the gate measured a page whose HTML was warm and whose hero image was
 * still cold, on every run, while its own comment said otherwise. That is the
 * cold-start race the config calls Issue #42, and it is why the homepage and
 * the legacy community routes carry a warn-level performance assertion rather
 *
 * Measured on 25 August 2026 against the preview for 711b6cd6:
 *
 *   /events/cat-indie-sounds-live-at-the-enmore-sydney
 *     in CI, after the old warm pass   perf 0.75, 0.72, 0.71
 *     from a warmed client, same URL   perf 0.91, LCP 2,768ms
 *
 * The page is the same page. The difference is what was warm when the stopwatch
 * started.
 *
 * ============================================================================
 * WHAT IT DOES
 * ============================================================================
 *
 * For every gate URL: fetch the page, pull every `/_next/image` URL out of the
 * markup (both `src` and every candidate in `srcset`, because Lighthouse's
 * mobile emulation picks a width the page's default `src` may not be), fetch
 * each variant once, then fetch the page again so ISR is warm on top.
 *
 * IT IS NOT A THRESHOLD CHANGE AND IT MUST NOT BECOME ONE. It changes what is
 * warm before the measurement, which is what "measured on the Vercel preview or
 * warmed production" in CLAUDE.md already asks for. Every assertion floor is
 * untouched.
 *
 * It NEVER fails the build. A warm pass that fails the gate would turn a slow
 * CDN into a red branch, and warming is preparation, not a check. Every failure
 * is printed so a red Lighthouse run can be read against what was actually warm.
 *
 * USAGE
 *   node scripts/ci/warm-preview.mjs gate-urls.txt
 */
import { readFileSync } from 'node:fs'
import { declareWork } from '../lib/work-report.mjs'

const LIST = process.argv[2] ?? 'gate-urls.txt'
/** The audit cookie the gate itself sends: motion and hover wash off. */
const HEADERS = { Cookie: 'el-audit=1', 'user-agent': 'EventLinqs-gate-warmer/1.0' }
/**
 * A page can carry a lot of images; this bounds the pass.
 *
 * Raised from 40 to 80 after the first CI run showed four pages sitting exactly
 * on 40, which is the signature of truncation rather than of a page with forty
 * images. Every truncation is now REPORTED, so the number can be argued about
 * from evidence instead of being discovered by someone reading a red gate.
 */
const MAX_IMAGES_PER_PAGE = 80

function decodeAttr(s) {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
}

/**
 * Every `/_next/image` URL the page references, wherever it appears.
 *
 * SCANNED OUT OF THE RAW HTML RATHER THAN OFF NAMED ATTRIBUTES, and the first
 * version of this function is why. It read `src` and `srcset`, case-sensitively,
 * and reported ONE variant on a page whose markup contains twenty-one
 * `/_next/image` URLs. Next 16 with React 19 serialises the attribute as
 * `srcSet`, so a lowercase `srcset` pattern matched nothing at all, and the
 * warm pass warmed the single data-URI placeholder.
 *
 * It also has to catch `imagesrcset` on `<link rel="preload">`, which is the
 * one that matters most: that is the variant the browser fetches FIRST, and it
 * is the LCP candidate.
 *
 * Scanning for the path itself is immune to all of that. Every occurrence is a
 * URL Next will optimise on demand, and each distinct width is a distinct
 * cache entry, so each is worth one request.
 */
export function optimisedImageUrls(html, base) {
  const out = new Set()
  // Up to the closing quote, a whitespace, or a srcset comma separator.
  for (const m of html.matchAll(/\/_next\/image\?[^"'\s,)]+/g)) {
    const v = decodeAttr(m[0]).trim()
    try {
      out.add(new URL(v, base).toString())
    } catch {
      /* an unparseable candidate is not worth failing a warm pass over */
    }
  }
  return [...out]
}

async function get(url, label) {
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(45000) })
    return { ok: res.ok, status: res.status, label }
  } catch (err) {
    return { ok: false, status: 'ERR', label, error: String(err?.message ?? err) }
  }
}

async function main() {
  const urls = readFileSync(LIST, 'utf8')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)

  if (urls.length === 0) {
    console.log('[warm] no URLs to warm.')
    return
  }

  let pages = 0
  let images = 0
  let truncatedPages = 0
  const failures = []

  for (const url of urls) {
    const first = await get(url, url)
    pages += 1
    if (!first.ok) failures.push(`page ${first.status} ${url}`)

    let html = ''
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(45000) })
      html = await res.text()
    } catch (err) {
      failures.push(`page body unreadable ${url} (${err?.message ?? err})`)
    }

    /*
     * A CAP THAT SAYS SO. The first CI run of this warmer reported exactly 40
     * variants on four pages, which is the cap, which means those four were
     * TRUNCATED and the report read identically to a page that happened to have
     * forty. A silent cap is how "we warmed everything" becomes untrue without
     * anybody noticing, and this pass exists precisely because the previous warm
     * step claimed something it did not do.
     */
    const allImages = html ? optimisedImageUrls(html, url) : []
    const imageUrls = allImages.slice(0, MAX_IMAGES_PER_PAGE)
    const truncated = allImages.length - imageUrls.length
    // Sequential on purpose. Firing forty optimiser requests at once is how a
    // warm pass becomes the thing that makes the first measured run slow.
    for (const img of imageUrls) {
      const r = await get(img, img)
      images += 1
      if (!r.ok) failures.push(`image ${r.status} ${img.slice(0, 120)}`)
    }

    // ISR again, on top of a now-warm optimiser.
    const second = await get(url, url)
    if (!second.ok) failures.push(`page ${second.status} (second pass) ${url}`)

    console.log(`[warm] ${url}`)
    console.log(
      `[warm]   page x2, ${imageUrls.length} optimised image variant(s)` +
        (truncated > 0 ? `  TRUNCATED: ${truncated} more not warmed (cap ${MAX_IMAGES_PER_PAGE})` : ''),
    )
    if (truncated > 0) truncatedPages += 1
  }

  console.log('')
  /*
   * THE CLAIM CONTRACT. This step's predecessor was named "Warm ISR + the
   * next/image optimiser" and warmed no images at all, for weeks, printing a
   * tidy list of 200s the whole time. Zero here is the incident, so zero exits
   * 1 rather than passing.
   *
   * A non-200 on an individual warm request is NOT a failure: warming is
   * best-effort and a page that 500s is the Lighthouse run's problem to report.
   * Doing nothing at all is a different thing, and it is this one.
   */
  declareWork('warm', {
    did: {
      'page warmed twice': pages,
      'optimised image variant requested': images,
    },
    found: { 'warm request that did not return 200': failures.length },
    truncated:
      truncatedPages > 0
        ? [`${truncatedPages} page(s) hit the ${MAX_IMAGES_PER_PAGE}-variant cap and were NOT fully warmed`]
        : [],
  })
  if (truncatedPages > 0) {
    console.log('[warm] Read a red Lighthouse run on those pages against that, and raise the cap if it matters.')
  }
  if (failures.length > 0) {
    console.log(`[warm] ${failures.length} warm request(s) did not return 200. Warming never fails the build,`)
    console.log('[warm] but a red Lighthouse run should be read against this list:')
    for (const f of failures.slice(0, 20)) console.log(`[warm]   ${f}`)
    if (failures.length > 20) console.log(`[warm]   ... and ${failures.length - 20} more`)
  }
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())
if (invokedDirectly) {
  await main()
}
