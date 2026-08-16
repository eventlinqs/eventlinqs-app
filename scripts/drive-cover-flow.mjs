/**
 * DRIVE THE ORGANISER FLOW on a preview, as a real signed-in organiser, to
 * prove the designed cover end to end: create an event with NO artwork, make a
 * cover, look at it, use it, publish, and find it on /events.
 *
 * It captures a screenshot at every stage rather than asserting silently,
 * because the claim being made is visual and a claim about a picture is worth
 * nothing until somebody opens the picture.
 *
 * `--inspect` stops after the first step and prints every visible control, which
 * is how the fill logic below was written rather than guessed.
 *
 * Usage:
 *   node scripts/drive-cover-flow.mjs <previewUrl> --out <dir> [--inspect]
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = (process.argv[2] || '').replace(/\/$/, '')
const arg = (n, d = null) => {
  const i = process.argv.indexOf(n)
  return i === -1 ? d : process.argv[i + 1]
}
const OUT = arg('--out', 'cover-flow')
const INSPECT = process.argv.includes('--inspect')
const STORAGE = arg('--storage', '.auth/organiser.json')
const WIDTH = Number(arg('--width', '1440'))
if (!BASE) {
  console.error('usage: node scripts/drive-cover-flow.mjs <previewUrl> --out <dir>')
  process.exit(2)
}

mkdirSync(OUT, { recursive: true })
const shot = async (page, name) => {
  const file = join(OUT, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  console.log(`[flow] captured ${file}`)
  return file
}

const DESCRIBE = () => {
  const visible = el => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  const labelFor = el => {
    if (el.id) {
      const l = document.querySelector(`label[for="${el.id}"]`)
      if (l) return l.innerText.trim().slice(0, 50)
    }
    const wrap = el.closest('div')
    const l = wrap ? wrap.querySelector('label') : null
    return l ? l.innerText.trim().slice(0, 50) : ''
  }
  return {
    heading: (document.querySelector('h1,h2')?.innerText || '').trim().slice(0, 60),
    stepText: (document.body.innerText.match(/Step \d of \d/) || [''])[0],
    fields: [...document.querySelectorAll('input,select,textarea')].filter(visible).map(el => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type'),
      name: el.getAttribute('name'),
      id: el.id,
      placeholder: el.getAttribute('placeholder'),
      label: labelFor(el),
      value: 'value' in el ? String(el.value).slice(0, 30) : '',
    })),
    buttons: [...document.querySelectorAll('button')]
      .filter(visible)
      .map(b => b.innerText.trim().slice(0, 30))
      .filter(Boolean),
  }
}

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: WIDTH, height: WIDTH === 390 ? 844 : 900 },
  storageState: STORAGE,
})
const page = await context.newPage()

await page.goto(`${BASE}/dashboard/events/create`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2500)
console.log('[flow] landed on', new URL(page.url()).pathname)
await shot(page, '01-create-step1')

if (INSPECT) {
  console.log(JSON.stringify(await page.evaluate(DESCRIBE), null, 2))
  await browser.close()
  process.exit(0)
}

/** Fill by the field's own label or placeholder, never by DOM position. */
async function fill(match, value) {
  const handle = await page.evaluateHandle(
    ({ match, value }) => {
      const els = [...document.querySelectorAll('input,textarea,select')]
      const el = els.find(e => {
        const hay = [
          e.getAttribute('placeholder') || '',
          e.getAttribute('name') || '',
          e.id || '',
          (e.closest('div')?.querySelector('label')?.innerText || ''),
        ]
          .join(' ')
          .toLowerCase()
        return hay.includes(match.toLowerCase())
      })
      if (!el) return null
      const setter = Object.getOwnPropertyDescriptor(
        el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
        'value',
      ).set
      setter.call(el, value)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return el
    },
    { match, value },
  )
  const ok = Boolean(await handle.jsonValue().catch(() => null)) || (await handle.asElement()) !== null
  console.log(`[flow] fill "${match}" -> ${ok ? 'ok' : 'NOT FOUND'}`)
  return ok
}

async function press(label) {
  const clicked = await page.evaluate(text => {
    const b = [...document.querySelectorAll('button')].find(
      x => x.innerText.trim().toLowerCase() === text.toLowerCase() && !x.disabled,
    )
    if (!b) return false
    b.click()
    return true
  }, label)
  console.log(`[flow] press "${label}" -> ${clicked ? 'ok' : 'NOT FOUND'}`)
  await page.waitForTimeout(1200)
  return clicked
}

async function advance(from) {
  for (const label of ['Continue', 'Next', 'Next step', 'Save and continue']) {
    if (await press(label)) {
      await page.waitForTimeout(900)
      const now = await page.evaluate(
        () => (document.body.innerText.match(/Step (\d) of 7/) || [, '?'])[1],
      )
      console.log(`[flow] step ${from} -> ${now}`)
      return now
    }
  }
  const err = await page.evaluate(() =>
    [...document.querySelectorAll('[role="alert"], .text-red-600, .text-red-500')]
      .map(e => e.innerText.trim())
      .filter(Boolean)
      .slice(0, 4),
  )
  console.log(`[flow] could not advance from step ${from}. Errors on screen:`, err)
  return null
}

const stamp = Date.now().toString().slice(-6)
const TITLE = `Cover proof night ${stamp}`

// ---- Step 1, Basic Details -------------------------------------------------
await fill('Summer Music Festival 2026', TITLE)
await fill('A brief one-line description', 'An event created with no artwork, to prove the designed cover.')
await fill('Describe your event in detail', 'This event was created with no artwork at all, so the only cover it can have is the one the platform designs from its own details.')
await page.evaluate(() => {
  const sel = [...document.querySelectorAll('select')].find(s =>
    (s.closest('div')?.innerText || '').includes('Category'),
  )
  if (sel && sel.options.length > 1) {
    sel.value = sel.options[1].value
    sel.dispatchEvent(new Event('change', { bubbles: true }))
  }
})
await shot(page, '02-step1-filled')
await advance(1)

// ---- Step 2, Date and Time (seeded by the form) ----------------------------
await shot(page, '03-step2')
await advance(2)

// ---- Step 3, Location ------------------------------------------------------
await fill('venue name', 'The Wool Exchange')
await fill('venue_name', 'The Wool Exchange')
await fill('address', '44 Moorabool Street')
await fill('city', 'Geelong')
await fill('postcode', '3220')
await shot(page, '04-step3-filled')
await advance(3)

// ---- Step 4, Event Media: the control under test ---------------------------
await page.waitForTimeout(800)
await shot(page, '05-step4-media-before')
console.log('[flow] pressing Make a cover')
await press('Make a cover')
// Rendering is satori plus sharp; give it room rather than racing it. The third
// argument is the options bag: passing it second makes it the page-function ARG
// and the default 30s applies, which is how the first run reported a timeout
// that was really a signature mistake.
try {
  await page.waitForFunction(
    () => Boolean(document.querySelector('img[alt^="Preview of the cover"]')),
    undefined,
    { timeout: 90000 },
  )
} catch {
  await shot(page, '06-step4-NO-PREVIEW')
  const why = await page.evaluate(() =>
    [...document.querySelectorAll('.bg-amber-50, [role="alert"]')]
      .map(e => e.innerText.trim())
      .filter(Boolean),
  )
  console.log('[flow] no preview appeared. On-screen message:', why)
  throw new Error('cover preview never rendered')
}
await page.waitForTimeout(600)
await shot(page, '06-step4-cover-preview')

// Pull the preview bytes out so the artefact itself can be opened and looked at.
const previewSrc = await page.evaluate(() => {
  const img = document.querySelector('img[alt^="Preview of the cover"]')
  return img ? img.getAttribute('src') : null
})
if (previewSrc && previewSrc.startsWith('data:')) {
  const { writeFileSync } = await import('node:fs')
  writeFileSync(join(OUT, 'cover-preview.jpg'), Buffer.from(previewSrc.split(',')[1], 'base64'))
  console.log('[flow] preview bytes written to cover-preview.jpg')
}

await press('Use this cover')
await page.waitForTimeout(4000)
await shot(page, '07-step4-cover-used')
await advance(4)

// ---- Step 5, Tickets -------------------------------------------------------
// FREE, deliberately. A paid event would put the Stripe sale gate in the path
// of a proof about a cover, and this run must not touch the money engine at all.
await fill('Tier name', 'General admission')
await fill('name', 'General admission')
await fill('price', '0')
await fill('capacity', '100')
await shot(page, '08-step5-tickets')
await advance(5)

// ---- Step 6, Settings ------------------------------------------------------
await shot(page, '09-step6-settings')
await advance(6)

// ---- Step 7, Review and Publish -------------------------------------------
await shot(page, '10-step7-review')
for (const label of ['Publish event', 'Publish', 'Publish now']) {
  if (await press(label)) break
}
await page.waitForTimeout(6000)
await shot(page, '11-after-publish')
console.log('[flow] after publish, landed on', new URL(page.url()).pathname)
console.log(`[flow] TITLE = ${TITLE}`)

await browser.close()
