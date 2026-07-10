// Magic Start proof on staging: one description -> full editable draft ->
// publish -> Launch Kit, with time-to-published measured. Voice UI presence
// asserted (Web Speech API cannot be fed audio headlessly).
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const BASE = 'https://eventlinqs-staging.vercel.app'
const OUT = 'docs/verification/magic-start-2026-07-10'
mkdirSync(OUT, { recursive: true })
const EMAIL = 'launchkit.tester@eventlinqs.com'
const PASSWORD = 'LaunchKit!Test2026'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const log = (s, d) => console.log(`[magic] ${s}: ${d}`)
const fail = (s, d) => { console.error(`[FAIL] ${s}: ${d}`); process.exit(1) }
const fill = async (p, sel, val) => { for (let i=0;i<5;i++){ await p.fill(sel,val); if((await p.inputValue(sel))===val) break; await p.waitForTimeout(300) } }

const DESCRIPTION = 'Afrobeats and Amapiano night at The Wool Exchange in Geelong next Friday from 8pm to late. General admission is 25 dollars, VIP is 45 dollars, capacity 200. A high energy dance party with live DJs.'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const consoleErrors = []
page.on('console', m => { if (m.type()==='error') consoleErrors.push(m.text().slice(0,160)) })

await admin.from('events').delete().like('title', '%Magic Proof%')
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 })
await fill(page, '#email', EMAIL); await fill(page, '#password', PASSWORD)
await page.click('button[type="submit"]'); await page.waitForURL(/\/dashboard/, { timeout: 90000, waitUntil: 'commit' })
log('login', 'in')

const tStart = Date.now()
await page.goto(`${BASE}/dashboard/events/create`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=Magic Start', { timeout: 30000 })
// Voice UI presence (Web Speech API button)
const micPresent = await page.locator('button[aria-label*="voice" i]').count()
log('voice-ui', `microphone control present: ${micPresent > 0} (Web Speech API, en-AU; no audio stored)`)
const ta = page.locator('textarea[aria-label="Describe your event"]')
await ta.click()
await ta.pressSequentially(DESCRIPTION, { delay: 2 })
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/01-magic-start-input-1440.png` })
const buildBtn = page.locator('button:has-text("Build my event")')
for (let i=0;i<20 && !(await buildBtn.isEnabled());i++) await page.waitForTimeout(300)
if (!(await buildBtn.isEnabled())) fail('magic-input', 'Build button never enabled after typing')
await buildBtn.click()
// Wait for the draft to land (the success banner)
await page.waitForSelector('text=/Draft ready/', { timeout: 60000 })
const draftMs = Date.now() - tStart
await page.screenshot({ path: `${OUT}/02-draft-ready-1440.png`, fullPage: true })
log('draft', `draft prefilled in ${(draftMs/1000).toFixed(1)}s from one description`)

// Verify the draft actually populated the form fields
const title = await page.inputValue('input[placeholder="e.g. Summer Music Festival 2026"]')
const cat = await page.locator('select').first().inputValue()
if (!title || title.length < 4) fail('draft-title', 'title not prefilled')
log('draft-fields', `title="${title.slice(0,50)}" category set=${cat !== ''}`)

// Walk to publish. The draft filled steps 1-5; just Continue through and publish.
const continueThrough = async (times) => {
  for (let i=0;i<times;i++){ const b=page.locator('button:has-text("Continue")').first(); if(await b.count()){ await b.click(); await page.waitForTimeout(500) } }
}
// Step 1 -> need a cover image (publish gate). Continue to media step.
await continueThrough(3) // through basic, date, location
// Media step: upload a cover
const fileInput = page.locator('input[type="file"]').first()
if (await fileInput.count()) {
  await fileInput.setInputFiles('public/images/hero/afrobeats.jpg')
  await page.waitForSelector('text=COVER', { timeout: 60000 }); await page.waitForTimeout(9000)
}
await continueThrough(1) // to tickets
await continueThrough(1) // to settings
await continueThrough(1) // to review
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/03-review-1440.png`, fullPage: true })
const pub = page.locator('button:has-text("Publish and get your launch kit")')
let en=false; for(let i=0;i<120;i++){ if(await pub.count() && await pub.isEnabled()){en=true;break} await page.waitForTimeout(1000) }
if(!en) fail('publish','publish never enabled')
await pub.click()
await page.waitForURL(/launch-kit/, { timeout: 60000, waitUntil: 'commit' })
await page.waitForSelector('text=is live.', { timeout: 90000 })
const totalMs = Date.now() - tStart
await page.screenshot({ path: `${OUT}/04-launch-kit-1440.png`, fullPage: true })
log('published', `TIME TO PUBLISHED from one description: ${(totalMs/1000).toFixed(1)}s (includes a real cover upload)`)

writeFileSync(`${OUT}/proof-log.json`, JSON.stringify({ draftMs, totalMs, title, description: DESCRIPTION, consoleErrors, micPresent: micPresent>0 }, null, 2))
console.log('CONSOLE ERRORS:', consoleErrors.length)
await browser.close()
console.log('MAGIC PROOF COMPLETE')
