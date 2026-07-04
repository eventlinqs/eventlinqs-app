import { test as setup, expect } from '@playwright/test'
import fs from 'node:fs'

const STORAGE = '.auth/admin.json'

/**
 * One-time interactive login. Opens /admin/login in a headed browser and waits
 * (up to 5 minutes) for a human to complete email + password + the 2FA code.
 * When the operations dashboard is reached the session (cookies) is saved to
 * .auth/admin.json for the desktop and mobile projects to reuse.
 *
 * This never types credentials itself: it only waits for, then captures, the
 * session a human establishes.
 */
setup('authenticate to /admin (manual login + 2FA)', async ({ page }) => {
  setup.setTimeout(300_000)
  await page.goto('/admin/login')

  console.log('\n>>> Log in to /admin in the opened browser.')
  console.log('>>> First sign-in: after email + password you will be taken to')
  console.log('>>> /admin/enrol-2fa to set up your authenticator app and recovery codes.')
  console.log('>>> Just keep going until the Operations dashboard loads - then this saves.')
  console.log('>>> Waiting up to 5 minutes...\n')

  // The dashboard lives at exactly /admin. On a first sign-in the path goes
  // /admin/login -> /admin/enrol-2fa (enrol the authenticator) -> /admin, so we
  // wait for the dashboard itself and pass straight through the enrol page
  // rather than stopping on it. The heading confirms we really landed there.
  await page.waitForURL(url => new URL(url).pathname === '/admin', { timeout: 290_000 })
  await expect(page.getByRole('heading', { name: /operations dashboard/i })).toBeVisible({ timeout: 30_000 })

  fs.mkdirSync('.auth', { recursive: true })
  await page.context().storageState({ path: STORAGE })
  console.log(`>>> Saved admin session to ${STORAGE}`)
})
