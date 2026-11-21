import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { test, expect, runTag } from './lib/journey'

/**
 * A. ACCOUNTS, as a person does them: sign up with a fresh address on our own domain (hello+qa-...@eventlinqs.com, which
 * lands in our own hello@ inbox), sign in, sign out, ask for a password reset, and the Google button if it is offered.
 * The standing test accounts (hello+qa-buyer@ and hello+qa-organiser@) are made once by the @setup journey, their
 * passwords kept in Windows Credential Manager (with-qa-creds.ps1) and, for the monitor, in GitHub's secrets.
 *
 * The sign-up limit is five a ten minutes per address (src/lib/rate-limit/policies.ts), so a fresh sign-up runs at 390
 * only; every width signs in.
 */
const BUYER = 'hello+qa-buyer@eventlinqs.com'
const ORGANISER = 'hello+qa-organiser@eventlinqs.com'
const buyerPw = process.env.JOURNEY_BUYER_PASSWORD ?? ''
const organiserPw = process.env.JOURNEY_ORGANISER_PASSWORD ?? ''

function remember(line: string) {
  const out = process.env.JOURNEY_OUT ?? 'test-results/journeys/adhoc'
  mkdirSync(out, { recursive: true })
  appendFileSync(path.join(out, 'made.txt'), `${new Date().toISOString()} ${line}\n`)
}

test.describe('A accounts', () => {
  test('a fresh sign up reaches check your inbox @sweep', async ({ journey, page }, info) => {
    test.skip(info.project.name !== 'phone-390', 'one fresh sign up a run (the sign up limit)')
    test.skip(!buyerPw, 'no QA password in this environment')
    const address = `hello+${runTag()}@eventlinqs.com`
    await journey.step('open sign up', async () => {
      await journey.open('/signup')
      await expect(page.locator('#email')).toBeVisible()
    })
    await journey.step('fill and create the account', async () => {
      await page.fill('#fullName', 'EventLinqs QA')
      await page.fill('#email', address)
      await page.fill('#password', buyerPw)
      await page.getByRole('button', { name: /^Create (organiser )?account$/ }).click()
      await expect(page).toHaveURL(/\/verify-email-sent/, { timeout: 30_000 })
      await expect(page.getByText(/check your inbox/i).first()).toBeVisible()
      remember(`signup ${address}`)
    })
  })

  test('the standing test accounts exist @setup', async ({ journey, page }, info) => {
    test.skip(info.project.name !== 'phone-390', 'made once')
    for (const [address, pw, role] of [
      [BUYER, buyerPw, 'buyer'],
      [ORGANISER, organiserPw, 'organiser'],
    ] as const) {
      await journey.step(`sign up ${role}`, async () => {
        await journey.open(role === 'organiser' ? '/signup?role=organiser' : '/signup')
        await page.fill('#fullName', role === 'organiser' ? 'EventLinqs QA Organiser' : 'EventLinqs QA Buyer')
        await page.fill('#email', address)
        await page.fill('#password', pw)
        await page.getByRole('button', { name: /^Create (organiser )?account$/ }).click()
        // A second run finds the account already made: the form says so and offers 'Reset your password', which is the same
        // truth. (The header's own 'Sign in' link is no answer: on 21 November 09:52 a looser check matched it while the
        // form still read 'Creating account'.)
        await expect(page.getByText(/check your inbox/i).or(page.getByRole('link', { name: 'Reset your password' })).first()).toBeVisible({ timeout: 30_000 })
        remember(`standing ${role} ${address} -> ${page.url()}`)
      })
    }
  })

  test('sign in, the account menu, sign out @sweep @monitor', async ({ journey, page }) => {
    test.skip(!buyerPw, 'no QA password in this environment')
    await journey.step('open sign in', async () => {
      await journey.open('/login')
      await expect(page.locator('#email')).toBeVisible()
    })
    await journey.step('sign in with the test buyer', async () => {
      await page.fill('#email', BUYER)
      await page.fill('#password', buyerPw)
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
      await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 })
    })
    await journey.step('signed in: My tickets opens', async () => {
      await journey.open('/tickets')
      await expect(page).toHaveURL(/\/tickets/)
      await expect(page.locator('h1').first()).toBeVisible()
    })
    await journey.step('sign out', async () => {
      await journey.open('/')
      const width = page.viewportSize()?.width ?? 0
      if (width < 1024) {
        await page.getByRole('button', { name: 'Open navigation menu' }).click()
      } else {
        await page.getByRole('button', { name: /^Account menu for/ }).click()
      }
      const out = page.getByRole('menuitem', { name: 'Sign out' }).or(page.getByRole('button', { name: 'Sign out' })).first()
      await expect(out, 'no Sign out where a person looks for it').toBeVisible()
      await out.click()
      await expect(page.getByRole('link', { name: /sign in|get started/i }).first()).toBeVisible({ timeout: 20_000 })
    })
    await journey.step('signed out: My tickets asks to sign in', async () => {
      await page.goto('/tickets')
      await expect(page).toHaveURL(/\/login/)
    })
  })

  test('forgot password sends the reset @sweep', async ({ journey, page }, info) => {
    test.skip(info.project.name !== 'phone-390', 'one reset a run (the reset limit)')
    await journey.step('open forgot password from sign in', async () => {
      await journey.open('/login')
      await page.getByRole('link', { name: 'Forgot password?' }).click()
      await expect(page).toHaveURL(/\/forgot-password/)
    })
    await journey.step('ask for the reset link', async () => {
      await page.fill('#email', BUYER)
      await page.getByRole('button', { name: 'Send reset link' }).click()
      await expect(page.getByText(/check your (email|inbox)|sent|on its way/i).first()).toBeVisible({ timeout: 20_000 })
      remember(`reset asked ${BUYER}`)
    })
  })

  test('Google sign in, when offered, opens Google @sweep', async ({ journey, page }) => {
    await journey.step('open sign in', async () => {
      await journey.open('/login')
    })
    const google = page.getByRole('button', { name: 'Continue with Google' })
    const offered = await google.isVisible().catch(() => false)
    test.skip(!offered, 'Google sign in is not offered')
    await journey.step('Continue with Google opens Google', async () => {
      await google.click()
      await expect(page).toHaveURL(/accounts\.google\.com/, { timeout: 30_000 })
    })
  })
})
