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

  console.log('\n>>> Log in to /admin in the opened browser, including the 2FA code.')
  console.log('>>> Waiting up to 5 minutes for the operations dashboard...\n')

  await page.waitForURL(
    url => {
      const p = new URL(url).pathname
      return p === '/admin' || (p.startsWith('/admin/') && !p.startsWith('/admin/login'))
    },
    { timeout: 290_000 },
  )
  await expect(page.getByRole('heading', { name: /operations dashboard/i })).toBeVisible({ timeout: 30_000 })

  fs.mkdirSync('.auth', { recursive: true })
  await page.context().storageState({ path: STORAGE })
  console.log(`>>> Saved admin session to ${STORAGE}`)
})
