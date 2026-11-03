/**
 * EVERY TAP WORKS (the CONTROLLER's 14:10 of 3 November 2026 on Lawal's 14:08, his phone on live: 'I click on Geelong.
 * It doesn't move. I click on Victoria. It rolls down to the bottom of the page ... Everything a user will press should
 * work ... just like Ticketmaster'; round 3's item 0).
 *
 * At 390 with a touch profile, on each page, tap EVERY link, chip, tab and button in the header, the bottom bar, the
 * page and the footer, each from a fresh load of the page. A tap passes when it lands on a page that answers 200 (an
 * internal link), or visibly changes the page's state within 300 ms (a filter, a sheet, a menu, a pressed chip), or
 * focuses the field it is, or is the current page's own selected chip and does nothing. It fails as a 404 or 500, a
 * DEAD TAP (nothing changes), or a SCROLL ONLY (the page moves and nothing else changes: Lawal's 'rolls down').
 * An outside booking link is never followed (law 14 (k)): it passes when it is a well formed https address.
 * Header, footer and bottom bar controls already tapped on an earlier page are not tapped again (named as the same).
 *
 * Exported for acceptance-live; also runs alone: node scripts/verify/every-tap.mjs --base <url> --out <dir> [--paths /,/city/geelong]
 */
import { appendFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SEL = 'a[href], button, [role="tab"], [role="button"], summary, input:not([type="hidden"]), select, textarea, [aria-current="page"]'

/** Every tappable control on the page now, in document order, with a descriptor to find it again after a reload. */
async function targetsOf(page) {
  return page.$$eval(SEL, (els) =>
    els.map((el, i) => {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      // 1 px is a visually hidden control (Skip to main content shows on keyboard focus only; a finger cannot see it).
      // Placed above or left of the document (a skip link waiting for keyboard focus) is hidden from a finger too.
      const offPage = r.bottom + scrollY <= 0 || r.right + scrollX <= 0
      const hidden = offPage || r.width <= 1 || r.height <= 1 || cs.visibility === 'hidden' || cs.display === 'none' || el.closest('[aria-hidden="true"], [inert]') !== null
      const region = el.closest('header') ? 'header' : el.closest('footer') ? 'footer' : el.closest('nav[aria-label*="ottom" i], [data-bottom-bar]') ? 'bottom bar' : 'page'
      // A select is named by its label, never by the text of all its options (which changes as the page fills them).
      const own = el.tagName === 'SELECT' ? (el.getAttribute('aria-label') || el.labels?.[0]?.textContent || el.getAttribute('name') || 'select') : (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.getAttribute('name') || '')
      const label = own.replace(/\s+/g, ' ').trim().slice(0, 80)
      return {
        i,
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || '',
        href: el.getAttribute('href'),
        target: el.getAttribute('target'),
        download: el.hasAttribute('download'),
        current: el.getAttribute('aria-current'),
        selected: el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-selected') === 'true',
        disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
        label,
        region,
        hidden,
      }
    }),
  )
}

// Read during a navigation, the page's context can be gone: that is a navigation, never an error.
const signature = (page) =>
  page.evaluate(() => {
    const states = [...document.querySelectorAll('[aria-expanded],[aria-pressed],[aria-selected],[aria-checked],[open],[role="dialog"],[aria-modal="true"]')]
      .map((e) => `${e.getAttribute('aria-expanded')}${e.getAttribute('aria-pressed')}${e.getAttribute('aria-selected')}${e.getAttribute('aria-checked')}${e.hasAttribute('open')}${e.getAttribute('role')}`)
      .join('|')
    // A rail arrow moves its rail sideways: the sum of every sideways scroll is part of the page's state.
    let sideways = 0
    for (const e of document.querySelectorAll('div, ul, ol, section, nav')) sideways += e.scrollLeft
    return `${location.pathname}${location.search}#${document.body.innerText.length}#${states}#${Math.round(sideways)}#${document.documentElement.dataset.shareSheet ?? 0}`
  }).catch(() => 'navigating')

export async function everyTap(browser, base, paths, out, contextOptions = null) {
  mkdirSync(out, { recursive: true })
  const context = await browser.newContext(contextOptions ?? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 })
  // A phone's Share opens its own share sheet, which no page can see; a headless browser has none. The stand-in counts the
  // call on the page, so a Share that reaches navigator.share passes and one that reaches nothing stays a dead tap.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async () => {
        document.documentElement.dataset.shareSheet = String(Number(document.documentElement.dataset.shareSheet ?? 0) + 1)
      },
    })
  })
  const origin = new URL(base).origin
  const results = []
  // Each tap's line is written as it lands, so a run cut short still leaves every tap it made.
  const live = join(out, 'every-tap.progress.txt')
  writeFileSync(live, '')
  const push = (r) => {
    results.push(r)
    appendFileSync(live, `${r.ok ? 'PASS' : 'FAIL'} ${r.path} [${r.region}] ${r.tag ?? ''} '${r.label}'${r.href ? ` ${r.href}` : ''}: ${r.result}
`)
  }
  const seen = new Set()
  const status = async (url) => {
    try {
      const res = await context.request.get(url, { maxRedirects: 5, timeout: 20000 })
      return res.status()
    } catch (e) {
      return `error ${e.message.slice(0, 60)}`
    }
  }
  // The consent banner first, once: its own answer is a tap like any other.
  {
    const page = await context.newPage()
    await page.goto(`${base}${paths[0]}`, { waitUntil: 'load' }); await page.waitForTimeout(800)
    const no = page.getByRole('button', { name: 'No thanks' })
    if (await no.count()) {
      await no.first().tap()
      await page.waitForTimeout(400)
      const gone = (await page.getByRole('button', { name: 'No thanks' }).count()) === 0
      push({ path: paths[0], region: 'consent', label: 'No thanks', ok: gone, result: gone ? 'the banner closes' : 'DEAD TAP: the banner stays' })
    }
    await page.close()
  }
  for (const path of paths) {
    const page = await context.newPage()
    await page.goto(`${base}${path}`, { waitUntil: 'load' }); await page.waitForTimeout(800)
    const targets = (await targetsOf(page)).filter((t) => !t.hidden)
    await page.close()
    for (const t of targets) {
      const key = `${t.region}|${t.tag}|${t.href ?? ''}|${t.label}`
      if (t.region !== 'page' && seen.has(key)) continue
      seen.add(key)
      const row = { path, region: t.region, tag: t.tag, label: t.label, href: t.href }
      if (t.disabled) { push({ ...row, ok: true, result: 'disabled, shown as disabled' }); continue }
      if (t.href && /^(mailto|tel):/.test(t.href)) { push({ ...row, ok: true, result: `${t.href.split(':')[0]} link` }); continue }
      if (t.href && /^https?:/.test(t.href) && new URL(t.href).origin !== origin) {
        const okUrl = /^https:\/\/[^\s]+\.[^\s]+/.test(t.href)
        push({ ...row, ok: okUrl, result: okUrl ? 'outside link, well formed, not followed (law 14 (k))' : 'BAD OUTSIDE LINK' })
        continue
      }
      const p = await context.newPage()
      try {
        await p.goto(`${base}${path}`, { waitUntil: 'load' }); await p.waitForTimeout(800)
        const now = (await targetsOf(p)).filter((x) => !x.hidden)
        const match = now.find((x) => x.tag === t.tag && x.href === t.href && x.label === t.label && x.region === t.region)
        if (!match) { push({ ...row, ok: false, result: 'NOT FOUND AGAIN after a reload' }); continue }
        const el = p.locator(SEL).nth(match.i)
        await el.scrollIntoViewIfNeeded({ timeout: 3000 })
        const y0 = await p.evaluate(() => scrollY)
        const s0 = await signature(p)
        const url0 = p.url()
        const popup = p.context().waitForEvent('page', { timeout: 1500 }).catch(() => null)
        const download = p.waitForEvent('download', { timeout: 1500 }).catch(() => null)
        const t0 = Date.now()
        await el.tap({ timeout: 3000 })
        let changedAt = null
        for (let k = 0; k < 6; k++) {
          await p.waitForTimeout(50)
          if (p.url() !== url0 || (await signature(p)) !== s0) { changedAt = Date.now() - t0; break }
        }
        const dl = t.download || /\.ics(\?|$)|\/calendar/.test(t.href ?? '') ? await download : null
        if (dl) { push({ ...row, ok: true, result: `a download (${dl.suggestedFilename()})` }); continue }
        const pop = t.target === '_blank' ? await popup : null
        if (pop) {
          await pop.waitForLoadState('domcontentloaded').catch(() => {})
          const st = await status(pop.url())
          push({ ...row, ok: st === 200, result: `opens ${pop.url().replace(origin, '')} in a new tab, ${st}` })
          await pop.close()
          continue
        }
        // A navigation: an internal link always gets up to 5 s to land (its chip may repaint first); then the address's
        // own status is read from the server.
        const internalLink = t.tag === 'a' && t.href && !t.href.startsWith('#')
        await p.waitForURL((u) => u.toString() !== url0, { timeout: internalLink ? 5000 : changedAt === null ? 3000 : 100 }).catch(() => {})
        const u0 = new URL(url0)
        const u1 = new URL(p.url())
        if (u1.pathname !== u0.pathname || u1.search !== u0.search) {
          const landed = Date.now() - t0
          await p.waitForLoadState('domcontentloaded').catch(() => {})
          const st = await status(p.url())
          const title = await p.title().catch(() => '')
          const notFound = /not found|404/i.test(title)
          push({ ...row, ok: st === 200 && !notFound, result: `lands on ${u1.pathname}${u1.search} (${st}${notFound ? ', a not found page' : ''}) in ${landed} ms` })
          continue
        }
        if (u1.hash && u1.hash !== u0.hash) {
          const exists = await p.evaluate((h) => Boolean(document.getElementById(decodeURIComponent(h.slice(1)))), u1.hash)
          push({ ...row, ok: exists, result: exists ? `goes to ${u1.hash} on the page` : `goes to ${u1.hash}, which is not on the page` })
          continue
        }
        const y1 = await p.evaluate(() => scrollY).catch(() => y0)
        const s1 = await signature(p)
        const focused = await el.evaluate((node) => document.activeElement === node).catch(() => false)
        // An empty form's submit: the browser holds it, shows its own 'fill out this field' bubble (outside the page)
        // and moves focus to the first empty required field, which the page does show.
        const heldEmpty = await p.evaluate(() => {
          const a = document.activeElement
          return a instanceof HTMLInputElement && a.required && !a.validity.valid
        }).catch(() => false)
        if (s1 !== s0) {
          push({ ...row, ok: changedAt !== null && changedAt <= 300, result: `the page changes in ${changedAt ?? '>300'} ms${Math.abs(y1 - y0) > 40 ? `, and scrolls ${y1 - y0} px` : ''}` })
        } else if (heldEmpty && (t.tag === 'button' || t.type === 'submit')) {
          push({ ...row, ok: true, result: "the browser holds the empty form at its first empty field (its own 'fill out this field' bubble)" })
        } else if (['input', 'select', 'textarea'].includes(t.tag) && focused) {
          push({ ...row, ok: true, result: 'the field takes focus' })
        } else if (t.tag === 'a' && t.href && new URL(t.href, url0).pathname === u0.pathname && Math.abs(y1 - y0) <= 40) {
          push({ ...row, ok: true, result: 'a link to the page it is on (the logo on the home): it stays put' })
        } else if (match.selected && Math.abs(y1 - y0) <= 40) {
          push({ ...row, ok: true, result: 'already selected, stays put' })
        } else if (match.current === 'page' || match.current === 'true') {
          push({ ...row, ok: Math.abs(y1 - y0) <= 40, result: Math.abs(y1 - y0) <= 40 ? 'the current page, shown selected, stays put' : `the current page, but it SCROLLS ${y1 - y0} px` })
        } else if (Math.abs(y1 - y0) > 40) {
          push({ ...row, ok: false, result: `SCROLL ONLY: the page moves ${y1 - y0} px and nothing else changes` })
        } else {
          push({ ...row, ok: false, result: 'DEAD TAP: nothing changes' })
        }
      } catch (e) {
        push({ ...row, ok: false, result: `TAP FAILED: ${e.message.split('\n')[0].slice(0, 120)}` })
      } finally {
        await p.close().catch(() => {})
      }
    }
  }
  await context.close()
  writeFileSync(join(out, 'every-tap.json'), JSON.stringify(results, null, 1))
  writeFileSync(join(out, 'every-tap.txt'), results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.path} [${r.region}] ${r.tag} '${r.label}'${r.href ? ` ${r.href}` : ''}: ${r.result}`).join('\n') + '\n')
  return results
}

// Alone: node scripts/verify/every-tap.mjs --base <url> --out <dir> [--paths a,b]
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/verify/every-tap.mjs')) {
  const arg = (n, f) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : f }
  const pw = await import('playwright')
  // --browser webkit: Safari's engine on an iPhone profile (the CONTROLLER's 19:56: the copy buttons proved in WebKit too).
  const webkit = arg('browser', 'chromium') === 'webkit'
  const browser = webkit ? await pw.webkit.launch() : await pw.chromium.launch()
  const res = await everyTap(browser, arg('base', 'https://www.eventlinqs.com.au').replace(/\/$/, ''), arg('paths', '/city/geelong').split(','), arg('out', '.'), webkit ? { ...pw.devices['iPhone 13'] } : null)
  await browser.close()
  const bad = res.filter((r) => !r.ok)
  console.log(`${res.length - bad.length} PASS, ${bad.length} FAIL`)
  for (const r of bad) console.log(`FAIL ${r.path} [${r.region}] ${r.tag} '${r.label}'${r.href ? ` ${r.href}` : ''}: ${r.result}`)
  process.exit(bad.length ? 1 : 0)
}
