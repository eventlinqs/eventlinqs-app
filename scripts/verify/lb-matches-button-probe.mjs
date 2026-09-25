/**
 * WHY IS "Produce a match" DISABLED? ASKED OF THE PAGE, NOT OF THE SOURCE.
 *
 * The GA2 drive failed three times on `locator.click: Timeout` with the
 * button's own `disabled` attribute in the error, and four separate readings of
 * the source each looked sufficient and each was a guess. The button disables
 * on `pending || !matcherEnabled || !eventId`, so this opens the real page, in a
 * real session, against a real event, and prints which of the three it is.
 *
 * It creates one lane-B admin, reads, and deletes it. It writes nothing else.
 *
 * Run: node --env-file=.env.local scripts/verify/lb-matches-button-probe.mjs
 */
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { answerTheCookieBanner } from './lib/cookie-banner.mjs'
import { tearDownAccountOrFailTheRun } from './lib/teardown-account.mjs'

const BASE = process.env.LB_BASE_URL ?? 'http://localhost:3100'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`REFUSED: TEST only, not ${url}`)
  process.exit(1)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

const stamp = Date.now()
const email = `lane-b-probe-${stamp}@eventlinqs.test`
const password = `${randomUUID()}Aa1`
let adminId = null
let browser = null

try {
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error) throw new Error(created.error.message)
  adminId = created.data.user.id
  await db.from('profiles').upsert({ id: adminId, email, full_name: 'Lane B probe' })
  const staff = await db.from('admin_users').insert({ id: adminId, role: 'super_admin', display_name: 'Lane B probe' })
  if (staff.error) throw new Error(staff.error.message)

  // Three events, chosen for the three shapes the page has to cope with.
  const soon = await db
    .from('events')
    .select('id, title, status, visibility, start_date')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gt('start_date', new Date().toISOString())
    .order('start_date', { ascending: true })
    .limit(1)
    .single()
  const far = await db
    .from('events')
    .select('id, title, status, visibility, start_date')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gt('start_date', new Date().toISOString())
    .order('start_date', { ascending: false })
    .limit(1)
    .single()
  const unlisted = await db
    .from('events')
    .select('id, title, status, visibility, start_date')
    .eq('status', 'published')
    .eq('visibility', 'unlisted')
    .gt('start_date', new Date().toISOString())
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForTimeout(1200)
  await answerTheCookieBanner(page)
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await Promise.all([
    page.waitForURL(u => !u.pathname.endsWith('/admin/login'), { timeout: 60000 }).catch(() => {}),
    page.locator('button[type="submit"]').first().click(),
  ])
  await page.waitForTimeout(2500)

  for (const [label, row] of [
    ['the soonest public event, certainly inside the picker', soon.data],
    ['the furthest public event, certainly outside it', far.data],
    ['an unlisted published event, the shape every lane fixture uses', unlisted.data],
  ]) {
    if (!row) {
      console.log(`  ${label}: none on TEST`)
      continue
    }
    await page.goto(`${BASE}/admin/matches?event=${row.id}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForTimeout(2000)
    await answerTheCookieBanner(page)
    const button = page.getByRole('button', { name: /produce a match/i })
    const disabled = await button.isDisabled().catch(() => 'no button')
    const hidden = await page.locator('input[name="event_id"]').inputValue().catch(() => 'no field')
    const selectValue = await page.locator('select#event').inputValue().catch(() => 'no select')
    const body = (await page.locator('body').innerText()).toLowerCase()
    console.log(`  ${label}`)
    console.log(`      id ${row.id}  starts ${row.start_date}  ${row.status}/${row.visibility}`)
    console.log(`      button disabled: ${disabled}`)
    console.log(`      hidden event_id: "${hidden}"   select value: "${selectValue}"`)
    console.log(`      page says switched off: ${/the matcher is switched off/.test(body)}`)
    console.log(`      page says pick an event: ${/pick an event/.test(body)}`)
  }
  await context.close()
} catch (error) {
  console.error('PROBE FAILED:', error instanceof Error ? error.message : String(error))
} finally {
  if (browser) await browser.close().catch(() => {})
  if (adminId) {
    await db.from('admin_users').delete().eq('id', adminId)
    await tearDownAccountOrFailTheRun(db, adminId)
  }
  const { count } = await db.from('admin_users').select('id', { count: 'exact', head: true }).eq('id', adminId ?? '00000000-0000-0000-0000-000000000000')
  console.log(`  teardown: ${count ?? 0} probe admin row(s) remain`)
}
