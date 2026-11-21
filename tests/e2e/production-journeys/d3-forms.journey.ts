import { test, expect } from './lib/journey'

/**
 * D3. THE CONTACT AND HELP FORMS, as a visitor uses them. A form that says it received a message must have sent it to
 * EventLinqs: the press reaches our own site and the thanks follows its answer. The help assistant answers a question.
 * Both run at 390 only (the help assistant spends a little on every question).
 */
test.describe('D3 forms', () => {
  test('the contact form sends the message to EventLinqs before it says thanks @sweep', async ({ journey, page }, info) => {
    test.skip(info.project.name !== 'phone-390', 'one message a run')
    await journey.step('open /contact', async () => {
      await journey.open('/contact')
      await expect(page.getByRole('heading', { name: 'Send us a message' })).toBeVisible()
    })
    await journey.step('fill and press Send message: it must reach EventLinqs', async () => {
      await page.getByLabel('Full name').fill('EventLinqs QA')
      await page.getByLabel('Email address').fill('hello+qa-contact@eventlinqs.com')
      await page.getByLabel('Subject').fill('QA journey: please ignore')
      await page.getByLabel('Message').fill('This message is sent by the EventLinqs production QA journey. No reply is needed.')
      const origin = new URL(page.url()).origin
      const posted = page.waitForRequest((r) => r.method() === 'POST' && r.url().startsWith(origin), { timeout: 10_000 }).catch(() => null)
      let leftForMailApp = ''
      page.on('framenavigated', (f) => {
        if (f.url().startsWith('mailto:')) leftForMailApp = f.url().slice(0, 40)
      })
      page.on('request', (r) => {
        if (r.url().startsWith('mailto:')) leftForMailApp = r.url().slice(0, 40)
      })
      await page.getByRole('button', { name: 'Send message' }).click()
      const req = await posted
      expect(
        req,
        `Send message posted nothing to EventLinqs${leftForMailApp ? ` (it handed the visitor to their mail app: ${leftForMailApp})` : ''}, yet the page says 'Message received'`,
      ).not.toBeNull()
      await expect(page.getByText(/Message received/)).toBeVisible({ timeout: 20_000 })
    })
  })

  test('the help assistant answers a question @sweep', async ({ journey, page }, info) => {
    test.skip(info.project.name !== 'phone-390', 'one question a run')
    await journey.step('open /help', async () => {
      await journey.open('/help')
      await expect(page.getByLabel('Message the assistant')).toBeVisible()
    })
    await journey.step('ask how to get a refund', async () => {
      const log = page.locator('[aria-live="polite"]').first()
      const answersBefore = await log.locator('div.justify-start').count()
      await page.getByLabel('Message the assistant').fill('How do I get a refund for a ticket?')
      await page.getByLabel('Message the assistant').press('Enter')
      // The assistant's own answer: a new message on its side of the conversation, with words in it (not the page's
      // own FAQ, which already says 'refund': on 21 November 09:52 a looser check passed on that alone).
      await expect
        .poll(async () => {
          const replies = log.locator('div.justify-start').filter({ hasNotText: /^\s*$/ })
          const n = await replies.count()
          if (n <= answersBefore) return ''
          return ((await replies.nth(n - 1).textContent()) ?? '').trim()
        }, { timeout: 60_000, message: 'the assistant never answered' })
        .toMatch(/refund/i)
    })
  })
})
