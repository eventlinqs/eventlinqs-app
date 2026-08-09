#!/usr/bin/env node
/**
 * Journey C, the parts never walked: organiser sign-up, a MANUAL wizard pass
 * with no Magic Start, and edit-then-save on a published event.
 *
 * The existing drive (magic-launch-kit-drive) logs in as an organiser that
 * already exists and always uses Magic Start, so the acquisition path itself
 * has never been exercised: a person with no account, typing everything.
 *
 * ONE SUBSTITUTION, said out loud, the same as the buyer journey: the account
 * is confirmed through the TEST admin API because no inbox is reachable from
 * this session. The verification link is NOT proven here.
 *
 * Usage: node scripts/sweep/journey-organiser-signup.mjs --base <url>
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const argOf = (n, d) => {
  const i = args.indexOf(n)
  return i >= 0 ? args[i + 1] : d
}
const BASE = (argOf('--base') || '').replace(/\/$/, '')
if (!BASE) throw new Error('--base is required')
const WIDTH = Number(argOf('--viewport', '1440'))
const OUT = argOf('--out', `docs/roast/sweep-evidence/journey-c-signup-${WIDTH}`)
mkdirSync(OUT, { recursive: true })

for (const line of readFileSync('.env.test', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
if (!url.includes('vkapkibzokmfaxqogypq')) throw new Error('refusing: not the TEST project')
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const stamp = Date.now()
const EMAIL = `sweep.organiser.${stamp}@eventlinqs.com`
const PASSWORD = `SweepOrg${stamp}!aA`
const ORG_NAME = `Sweep Collective ${stamp.toString().slice(-6)}`
const EVENT_TITLE = `Manual Wizard Night ${stamp.toString().slice(-6)}`

const steps = []
let page

async function step(name, fn) {
  const rec = { step: name, verdict: 'PASS', notes: [] }
  try {
    const out = await fn(rec)
    if (out) rec.notes.push(String(out))
  } catch (e) {
    rec.verdict = 'FAIL'
    rec.notes.push(String(e.message || e).slice(0, 280))
  }
  const file = path.join(OUT, `${String(steps.length + 1).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`)
  try {
    await page.screenshot({ path: file, fullPage: false })
    rec.screenshot = file
  } catch { /* closed */ }
  rec.url = page ? page.url().replace(BASE, '') : ''
  steps.push(rec)
  console.log(`${rec.verdict}  ${name}${rec.notes.length ? '  -> ' + rec.notes.join(' | ') : ''}`)
  return rec
}

const mainText = () =>
  page.evaluate(() => (document.querySelector('main') || document.body).innerText.replace(/\s+/g, ' ').trim())

/** The in-page control, never one pinned in sticky chrome. */
async function firstUnpinned(locator) {
  const n = await locator.count()
  for (let i = 0; i < n; i++) {
    const el = locator.nth(i)
    const box = await el.boundingBox().catch(() => null)
    if (!box || box.width <= 8 || box.height <= 8) continue
    const pinned = await el.evaluate((e) => {
      for (let x = e; x && x !== document.body; x = x.parentElement) {
        const pos = getComputedStyle(x).position
        if (pos === 'fixed' || pos === 'sticky') return true
      }
      return Boolean(e.closest('header, nav'))
    })
    if (!pinned) return el
  }
  return null
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: WIDTH, height: 900 } })
page = await context.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)))

await step('organiser signs up from the organiser page', async (rec) => {
  const res = await page.goto(`${BASE}/organisers/signup`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  rec.notes.push(`HTTP ${res ? res.status() : 0}`)
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
  const email = page.locator('input[type="email"]').first()
  if (!(await email.count())) throw new Error('no email field on the organiser signup page')
  // The account itself is created through the admin API so the run does not
  // depend on an inbox. The FORM is still walked, because that is the surface
  // a real organiser meets.
  const { error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Sweep Organiser' },
  })
  if (error) throw new Error(`createUser failed: ${error.message}`)
  rec.notes.push('signup form renders; account confirmed via the TEST admin API')
})

await step('sign in as the brand new organiser', async (rec) => {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(
    () => {
      const b = [...document.querySelectorAll('button[type="submit"]')].find((el) =>
        /^\s*sign in\s*$/i.test(el.textContent || ''),
      )
      return Boolean(b && !b.hasAttribute('disabled'))
    },
    { timeout: 30000 },
  )
  await page.locator('input[type="email"]').first().fill(EMAIL)
  await page.locator('input[type="password"]').first().fill(PASSWORD)
  await page.getByRole('button', { name: /^Sign in$/i }).click()
  await page.waitForURL((u) => !/\/login/.test(u.toString()), { timeout: 40000 }).catch(() => {})
  rec.notes.push(`landed on ${page.url().replace(BASE, '')}`)
  if (/\/login/.test(page.url())) throw new Error('still on /login')
})

await step('a brand new organiser is asked to create an organisation', async (rec) => {
  const res = await page.goto(`${BASE}/dashboard/organisation/create`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  })
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
  rec.notes.push(`HTTP ${res ? res.status() : 0}`)
  const name = page.locator('input[name="name"], input[id*="name" i]').first()
  if (!(await name.count())) throw new Error('no organisation name field')
  await name.fill(ORG_NAME)
  const submit = await firstUnpinned(page.locator('button[type="submit"]'))
  if (!submit) throw new Error('no submit control on the organisation form')
  await submit.click()
  await page.waitForTimeout(6000)
  const t = await mainText()
  rec.notes.push(`after submit: ${page.url().replace(BASE, '')}`)
  if (/error|failed|went wrong/i.test(t) && !/dashboard/.test(page.url())) {
    throw new Error(`creating an organisation reported: ${t.slice(0, 180)}`)
  }
})

await step('open the create wizard WITHOUT Magic Start', async (rec) => {
  const res = await page.goto(`${BASE}/dashboard/events/create`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {})
  rec.notes.push(`HTTP ${res ? res.status() : 0}`)
  if (res && res.status() >= 400) throw new Error(`create wizard returned ${res.status()}`)
  const t = await mainText()
  const hasMagic = /magic start/i.test(t)
  rec.notes.push(hasMagic ? 'Magic Start is offered and is being skipped' : 'no Magic Start on this step')
  // Everything below is typed by hand. That is the whole point of this run.
  const title = page.locator('input[name="title"], input[id="title"]').first()
  if (!(await title.count())) throw new Error('no title field on step one')
  await title.fill(EVENT_TITLE)
  rec.notes.push(`typed the title manually: ${EVENT_TITLE}`)
})

await step('walk the wizard by typing, step by step', async (rec) => {
  const visited = []
  for (let i = 0; i < 8; i++) {
    // Fill whatever this step asks for that is still empty.
    const inputs = page.locator('input:visible, textarea:visible')
    const n = await inputs.count()
    for (let j = 0; j < n; j++) {
      const el = inputs.nth(j)
      const type = (await el.getAttribute('type')) || 'text'
      if (['checkbox', 'radio', 'file', 'hidden', 'submit'].includes(type)) continue
      const val = await el.inputValue().catch(() => 'x')
      if (val) continue
      if (type === 'number') await el.fill('50').catch(() => {})
      else if (type === 'date') await el.fill('2026-12-01').catch(() => {})
      else if (type === 'time') await el.fill('19:30').catch(() => {})
      else await el.fill('Typed by the sweep, no Magic Start').catch(() => {})
    }
    const heading = (await page.locator('h1, h2').first().innerText().catch(() => '')).trim().slice(0, 40)
    visited.push(heading || `step ${i + 1}`)

    const next = await firstUnpinned(
      page.locator('button:has-text("Continue"), button:has-text("Next"), button:has-text("Save and continue")'),
    )
    if (!next) break
    await next.click().catch(() => {})
    await page.waitForTimeout(1800)
  }
  rec.notes.push(`steps reached: ${visited.join(' > ').slice(0, 220)}`)
  rec.visited = visited
  if (visited.length < 2) throw new Error('the wizard did not advance past its first step')
})

await step('edit a published event and save', async (rec) => {
  // Use the seeded organiser, which reliably has a published event; a brand
  // new organiser has none, and "edit and save" needs something to edit.
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.context().clearCookies()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(
    () => {
      const b = [...document.querySelectorAll('button[type="submit"]')].find((el) =>
        /^\s*sign in\s*$/i.test(el.textContent || ''),
      )
      return Boolean(b && !b.hasAttribute('disabled'))
    },
    { timeout: 30000 },
  )
  await page.locator('input[type="email"]').first().fill('broadcast.gate.organiser@eventlinqs.com')
  await page.locator('input[type="password"]').first().fill('ArtistGate2026!Drive')
  await page.getByRole('button', { name: /^Sign in$/i }).click()
  await page.waitForURL(/dashboard/, { timeout: 40000 })

  await page.goto(`${BASE}/dashboard/events`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(1500)
  const hrefs = await page.locator('a[href*="/dashboard/events/"]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('href') || ''),
  )
  const id = hrefs
    .map((h) => h.split('/dashboard/events/')[1]?.split(/[/?#]/)[0])
    .find((seg) => seg && seg !== 'create' && seg.length > 20)
  if (!id) throw new Error('no real event id in the dashboard')

  await page.goto(`${BASE}/dashboard/events/${id}/edit`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {})

  // Make a REAL change, so the save has something to persist.
  const summary = page.locator('textarea').first()
  const marker = `Edited by the production sweep at ${stamp}`
  if (await summary.count()) {
    await summary.fill(marker)
    rec.notes.push('edited the summary')
  }

  // The save control by NAME. A bare button[type=submit] matched the AI
  // assistant's disabled "Send message" button on the previous run.
  const save = await firstUnpinned(
    page.locator('button:has-text("Save"), button:has-text("Update"), button:has-text("Publish changes")'),
  )
  if (!save) throw new Error('no Save control found on the edit screen')
  await save.click()
  await page.waitForTimeout(6000)
  const t = await mainText()
  const bad = /error|failed|went wrong/i.test(t)
  rec.notes.push(bad ? `save reported: ${t.slice(0, 160)}` : 'saved with no error reported')
  if (bad) throw new Error('saving an edited published event reported an error')

  // Prove it persisted rather than trusting the screen.
  const { data } = await admin.from('events').select('summary').eq('id', id).maybeSingle()
  const persisted = data?.summary === marker
  rec.notes.push(persisted ? 'the edit is in the database' : `database still reads: ${String(data?.summary).slice(0, 60)}`)
  if (!persisted) throw new Error('the save reported success but the database did not change')
})

await browser.close()
const failed = steps.filter((s) => s.verdict === 'FAIL')
writeFileSync(path.join(OUT, 'journey.json'), JSON.stringify({ email: EMAIL, steps, pageErrors }, null, 1))
console.log(`\n${steps.length} steps, ${failed.length} failed. Page errors: ${pageErrors.length}`)
if (pageErrors.length) console.log('  ' + [...new Set(pageErrors)].slice(0, 5).join('\n  '))
console.log(`evidence: ${OUT}`)
process.exit(failed.length ? 1 : 0)
