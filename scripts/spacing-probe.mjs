// SPACING PROBE: the three measurements the footer and share-row complaints
// need, taken from the live DOM rather than inferred from the source.
//
//   1. WHAT SITS BELOW THE FOOTER. A strip of page background under a
//      full-bleed dark footer reads as a mistake, and it is invisible in a
//      full-page screenshot scaled to fit.
//   2. THE FOOTER SOCIAL ROW at 390, which is where a fixed-size icon row runs
//      out of width.
//   3. THE SHARE BAR on an event page, public and organiser, which is the row
//      the founder reports as cramped: its gap, its children, and whether it
//      overflows its container.
//
// Usage: node scripts/spacing-probe.mjs <baseUrl> [--storage state.json]
import { chromium } from 'playwright'
import { existsSync } from 'node:fs'

const BASE = (process.argv[2] || '').replace(/\/$/, '')
const sIdx = process.argv.indexOf('--storage')
const STORAGE = sIdx === -1 ? null : process.argv[sIdx + 1]
if (!BASE) {
  console.error('usage: node scripts/spacing-probe.mjs <baseUrl>')
  process.exit(2)
}

const PROBE = () => {
  const round = n => Math.round(n)
  const footer = document.querySelector('footer')
  const doc = document.documentElement
  const out = { measuredWidth: window.innerWidth, path: location.pathname }

  if (footer) {
    const fr = footer.getBoundingClientRect()
    const footerBottomAbsolute = fr.bottom + window.scrollY
    out.footer = {
      height: round(fr.height),
      bottomAbsolute: round(footerBottomAbsolute),
      documentHeight: doc.scrollHeight,
      // Anything greater than zero is page background showing under the footer.
      spaceBelowFooter: round(doc.scrollHeight - footerBottomAbsolute),
      nextSiblingTag: footer.nextElementSibling
        ? footer.nextElementSibling.tagName.toLowerCase() +
          (footer.nextElementSibling.className
            ? '.' + String(footer.nextElementSibling.className).slice(0, 60)
            : '')
        : null,
      parentPaddingBottom: getComputedStyle(footer.parentElement).paddingBottom,
      bodyMinHeightRule: getComputedStyle(document.body).minHeight,
      rootWrapperClass: String(document.body.firstElementChild?.className ?? '').slice(0, 80),
    }

    // The social icon row: the first flex row in the footer holding links whose
    // only child is an svg.
    const rows = [...footer.querySelectorAll('div')].filter(d => {
      const kids = [...d.children]
      return (
        kids.length >= 3 &&
        kids.every(k => k.tagName === 'A' || k.tagName === 'BUTTON' || k.tagName === 'LABEL') &&
        kids.some(k => k.querySelector('svg'))
      )
    })
    if (rows[0]) {
      const cs = getComputedStyle(rows[0])
      out.footerSocials = {
        display: cs.display,
        gap: cs.gap,
        clientWidth: rows[0].clientWidth,
        scrollWidth: rows[0].scrollWidth,
        overflows: rows[0].scrollWidth > rows[0].clientWidth + 1,
        children: [...rows[0].children].map(k => {
          const r = k.getBoundingClientRect()
          return { tag: k.tagName.toLowerCase(), w: round(r.width), h: round(r.height) }
        }),
      }
    }
  }

  // The share bar. Found by its heading rather than a class, so it is located
  // the same way on both the public page and the organiser view.
  const heading = [...document.querySelectorAll('p,h2,h3,span')].find(el =>
    /share this event|share/i.test((el.textContent || '').trim()) &&
    (el.textContent || '').trim().length < 30,
  )
  if (heading) {
    let container = heading.parentElement
    let bar = null
    for (let i = 0; i < 3 && container; i += 1) {
      bar = [...container.children].find(
        c => c !== heading && c.querySelectorAll('a,button').length >= 3,
      )
      if (bar) break
      container = container.parentElement
    }
    if (bar) {
      const cs = getComputedStyle(bar)
      const r = bar.getBoundingClientRect()
      out.shareBar = {
        headingText: (heading.textContent || '').trim().slice(0, 40),
        display: cs.display,
        flexWrap: cs.flexWrap,
        gap: cs.gap,
        columnGap: cs.columnGap,
        rowGap: cs.rowGap,
        width: round(r.width),
        clientWidth: bar.clientWidth,
        scrollWidth: bar.scrollWidth,
        overflows: bar.scrollWidth > bar.clientWidth + 1,
        controls: [...bar.querySelectorAll('a,button')].map(k => {
          const kr = k.getBoundingClientRect()
          return {
            text: (k.getAttribute('aria-label') || k.innerText || '').trim().slice(0, 24),
            w: round(kr.width),
            h: round(kr.height),
            under44: kr.width < 44 || kr.height < 44,
          }
        }),
      }
    }
  }
  return out
}

const browser = await chromium.launch()
const paths = process.argv.filter(a => a.startsWith('/'))
const targets = paths.length ? paths : ['/']

for (const width of [390, 1440]) {
  const opts = { viewport: { width, height: width === 390 ? 844 : 900 } }
  if (STORAGE && existsSync(STORAGE)) opts.storageState = STORAGE
  const ctx = await browser.newContext(opts)
  const page = await ctx.newPage()
  for (const p of targets) {
    await page.goto(BASE + p, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(1500)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(700)
    const r = await page.evaluate(PROBE)
    console.log(`\n=== ${width}px  ${p} ===`)
    console.log(JSON.stringify(r, null, 2))
  }
  await ctx.close()
}
await browser.close()
