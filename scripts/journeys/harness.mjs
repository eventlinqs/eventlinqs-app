/**
 * THE STRANGER JOURNEYS. UI only: if a stranger could not click it, this does
 * not do it. Reads the confirmation link out of the console mail transport the
 * way a person reads it out of their inbox.
 */
import { chromium } from 'playwright'
import { mkdirSync, appendFileSync, writeFileSync, readFileSync } from 'node:fs'

export const BASE = process.env.BASE ?? 'http://localhost:3311'
const SERVER_LOG = '.tmp-serve.log'

export function makeJourney(id, title, viewport = { width: 1440, height: 1000 }) {
  const OUT = `docs/verification/journeys-2026-08-28/${id}`
  mkdirSync(OUT, { recursive: true })
  writeFileSync(`${OUT}/log.txt`, `${title}\n${'='.repeat(title.length)}\n`)
  return { OUT, title, step: 0, errors: [], blockers: [], unclear: [] }
}

export function note(j, what, detail) {
  j.step += 1
  const line = `${String(j.step).padStart(2, '0')}. ${what}${detail ? `\n      ${detail}` : ''}`
  console.log(line)
  appendFileSync(`${j.OUT}/log.txt`, line + '\n')
}

export async function attach(j, page) {
  page.on('pageerror', (e) => j.errors.push(`pageerror ${String(e).slice(0, 130)}`))
  page.on('response', (r) => {
    if (r.status() >= 500) j.errors.push(`HTTP ${r.status()} ${r.url().replace(BASE, '').slice(0, 100)}`)
  })
}

export async function see(page) {
  return page.evaluate(() => {
    const ok = (el) => {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'
    }
    const o = { h: null, buttons: [], fields: [], errs: [], links: [] }
    const h = [...document.querySelectorAll('h1,h2')].filter(ok)[0]
    o.h = h ? h.textContent.trim().slice(0, 64) : null
    for (const b of document.querySelectorAll('button,a[role=button],input[type=submit]')) {
      if (!ok(b)) continue
      const t = (b.textContent || b.value || '').trim().slice(0, 32)
      if (t) o.buttons.push(t)
    }
    for (const f of document.querySelectorAll('input:not([type=hidden]),select,textarea')) {
      if (!ok(f)) continue
      const l = f.labels?.[0]?.textContent?.trim() || f.getAttribute('aria-label') || f.getAttribute('placeholder') || f.name || f.type
      o.fields.push(`${l}${f.required ? '*' : ''}`.slice(0, 28))
    }
    for (const e of document.querySelectorAll('[role=alert],.text-red-600,[data-error]')) {
      if (!ok(e)) continue
      const t = (e.textContent || '').trim().slice(0, 140)
      if (t) o.errs.push(t)
    }
    for (const a of document.querySelectorAll('a[href]')) {
      if (!ok(a)) continue
      const t = (a.textContent || '').trim().slice(0, 28)
      if (t.length > 1) o.links.push(t)
    }
    return o
  })
}

export async function describe(j, page, what) {
  const v = await see(page)
  note(j, what,
    `URL     ${page.url().replace(BASE, '')}\n      heading ${JSON.stringify(v.h)}\n      fields  ${v.fields.slice(0, 10).join(' | ') || '(none)'}\n      buttons ${v.buttons.slice(0, 9).join(' | ') || '(none)'}` +
    (v.errs.length ? `\n      ERRORS  ${v.errs.join(' // ')}` : ''))
  await page.screenshot({ path: `${j.OUT}/${String(j.step).padStart(2, '0')}-${what.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 38)}.png` })
  return v
}

/** The link the platform emailed, read the way a person reads their inbox. */
export function linkFromInbox(toEmail, match = /auth\/confirm/) {
  const log = readFileSync(SERVER_LOG, 'utf8')
  const blocks = log.split('[email:console] ---------------------------------------------')
  for (const b of blocks.reverse()) {
    if (!b.includes(toEmail)) continue
    for (const line of b.split('\n')) {
      const m = /\[email:console\] link\s+(\S+)/.exec(line)
      if (m && match.test(m[1])) return m[1].replaceAll('&amp;', '&')
    }
  }
  return null
}

export async function finish(j) {
  writeFileSync(`${j.OUT}/errors.txt`, j.errors.join('\n'))
  console.log(`\n--- ${j.title}`)
  console.log(`--- server errors : ${j.errors.length}`)
  for (const e of [...new Set(j.errors)].slice(0, 8)) console.log(`    ${e}`)
  console.log(`--- BLOCKERS      : ${j.blockers.length}`)
  for (const b of j.blockers) console.log(`    ${b}`)
  console.log(`--- unclear steps : ${j.unclear.length}`)
  for (const u of j.unclear) console.log(`    ${u}`)
}

export { chromium }
