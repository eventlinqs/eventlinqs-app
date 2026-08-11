import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * One sign-in, reused by every proof script in this run.
 *
 * WHY THIS EXISTS. Login runs CLIENT-side against Supabase GoTrue
 * (src/app/actions/auth-rate-limit.ts documents this: the server action is only an
 * edge throttle in front of it), and GoTrue keeps its own per-IP limit underneath.
 * Driving several proof scripts in a row, each logging in fresh, exhausts it, and
 * the browser then sits on /login with no server-side trace. That is the auth
 * protection working correctly, and it has nothing to do with what these scripts
 * are proving, so it must not be allowed to look like a failure of the thing under
 * test.
 *
 * The session file holds live auth tokens, so it is written OUTSIDE the repository,
 * to the scratch directory, and never committed.
 */

function sessionFile() {
  return (
    process.env.PROOF_SESSION_FILE ??
    path.join(os.tmpdir(), 'eventlinqs-proof-session.json')
  )
}

/**
 * Return a Playwright storageState for the proof organiser, signing in only if the
 * cached one is missing or no longer works.
 */
export async function proofSession(browser, baseUrl, email, password) {
  const file = sessionFile()

  if (fs.existsSync(file)) {
    const cached = JSON.parse(fs.readFileSync(file, 'utf8'))
    const context = await browser.newContext({ storageState: cached })
    const page = await context.newPage()
    let stillIn = false
    try {
      // A GENEROUS timeout, because the first hit on a freshly restarted dev server
      // compiles the route on demand and can take far longer than a default
      // navigation allowance. Treating that as "the session is dead" throws away a
      // perfectly good session and spends a login against the auth rate limit,
      // which then fails and looks like a product fault. That happened here once.
      await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
      stillIn = !new URL(page.url()).pathname.startsWith('/login')
    } catch (err) {
      console.warn(`  (session check could not complete: ${err.message.split('\n')[0]})`)
    }
    await context.close()
    if (stillIn) return cached
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
  await page.getByLabel(/email/i).first().fill(email)
  await page.getByLabel(/password/i).first().fill(password)
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45_000 }),
    page.getByRole('button', { name: /sign in|log in/i }).first().click(),
  ])
  const state = await context.storageState()
  await context.close()
  fs.writeFileSync(file, JSON.stringify(state))
  return state
}
