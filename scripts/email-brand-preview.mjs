/**
 * Render-proofs the five Supabase auth email templates after the brand pass,
 * so they can be eyeballed as one brand. Substitutes the Go-template tokens
 * with sample values and screenshots each. Output: qa/email-previews/.
 *
 * The refund, waitlist, and Stripe purchase emails are built in TypeScript and
 * were brought to the same #0A1628 palette in the same pass (verified by the
 * colour audit in the commit); this script covers the standalone HTML
 * templates that render directly in a browser.
 *
 *   node scripts/email-brand-preview.mjs
 */
import { chromium } from 'playwright'
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = 'qa/email-previews'
const AUTH_DIR = 'src/lib/email/templates/auth'
mkdirSync(OUT, { recursive: true })

const samples = {
  ConfirmationURL: 'https://www.eventlinqs.com/auth/confirm?token=sample-confirmation-token',
  Token: '123456',
  Email: 'jane@example.com',
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 680, height: 900 }, deviceScaleFactor: 2 })

for (const file of readdirSync(AUTH_DIR).filter((f) => f.endsWith('.html'))) {
  let html = readFileSync(join(AUTH_DIR, file), 'utf8')
  html = html.replace(/\{\{\s*\.(\w+)\s*\}\}/g, (_m, key) => samples[key] ?? `{{ ${key} }}`)
  const name = `auth-${file.replace('.html', '')}`
  writeFileSync(join(OUT, `${name}.html`), html)
  await page.setContent(html, { waitUntil: 'networkidle' })
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true })
  console.log('rendered', name)
}

await browser.close()
console.log('\nDONE. Previews in', OUT)
