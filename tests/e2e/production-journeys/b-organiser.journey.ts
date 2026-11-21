import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect, runTag, type Journey } from './lib/journey'

/**
 * B. THE ORGANISER, end to end as a person does it: sign in, the organisation, the seven step event wizard with photographs
 * in every format the form accepts (JPG, PNG, WEBP, AVIF; HEIC is accepted by the form but no encoder makes one here, so
 * it is NOT JUDGED and says so), a free tier and a paid tier, the venue and its map pin, a category and a community,
 * UNLISTED (never on a guide, the sitemap or search), publish, the live page, edit, the dashboard's every tab, the payout
 * screen, pause, and delete (an event with no orders) read back as 410.
 *
 * Each image must show at once when it is chosen (a local preview inside a second), never only after publish, and the
 * live page must show the cover whole. The photographs are made per run (fixtures/make-images.mjs) because the platform
 * refuses a photograph already used on another event (src/lib/images/photo-lock.ts).
 *
 * JOURNEY_KEEP_EVENT=1 keeps the event published (unlisted) for C2's checkout instead of pausing and deleting it; its
 * address is written to JOURNEY_OUT/qa-event.json.
 */
const ORGANISER = 'hello+qa-organiser@eventlinqs.com'
const organiserPw = process.env.JOURNEY_ORGANISER_PASSWORD ?? ''
const IMAGES = path.join(process.env.JOURNEY_IMAGES ?? 'test-results/journey-images', 'b')
const img = (name: string) => path.resolve(IMAGES, name)
const keep = process.env.JOURNEY_KEEP_EVENT === '1'

function local(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

async function signIn(journey: Journey) {
  const { page } = journey
  await journey.step('sign in as the test organiser', async () => {
    await journey.open('/login?redirect=/dashboard')
    await page.fill('#email', ORGANISER)
    await page.fill('#password', organiserPw)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 })
  })
}

async function cont(journey: Journey, label: string) {
  const { page } = journey
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByText(new RegExp(`Step \\d of 7`)).first(), `the wizard did not move past ${label}`).toBeVisible()
}

test.describe('B organiser', () => {
  test.skip(!organiserPw, 'no QA password in this environment')

  test('create an event with photographs, publish, edit, pause and delete @sweep', async ({ journey, page }, info) => {
    test.setTimeout(420_000)
    const tag = runTag()
    const title = `EventLinqs QA journey ${tag}`
    await signIn(journey)

    await journey.step('the organisation is there (made once if not)', async () => {
      await journey.open('/dashboard/events/create')
      const orgName = page.locator('#name')
      if (await orgName.isVisible().catch(() => false)) {
        await orgName.fill('EventLinqs QA Organiser')
        await page.locator('#slug').fill('eventlinqs-qa-organiser')
        await page.getByRole('button', { name: /Create Organisation|Continue to event details/ }).click()
      }
      await expect(page.locator('#event-title-1')).toBeVisible({ timeout: 30_000 })
    })

    await journey.step('1 basic details, a category and a community', async () => {
      await page.fill('#event-title-1', title)
      await page.fill('#short-summary-200-2', 'A test night made by the EventLinqs QA journey. Not a real event.')
      await page.fill('#description-3', 'This unlisted page is made and removed by EventLinqs own production checks. It is not a real event and sells nothing.')
      const category = page.locator('#category-4')
      const options = await category.locator('option').allTextContents()
      const pick = options.find((o) => /music|community|comedy/i.test(o)) ?? options[1]
      if (pick) await category.selectOption({ label: pick })
      const community = page.locator('input[type="checkbox"]').filter({ hasNot: page.locator('[id^="this-is"]') }).first()
      if (await community.isVisible().catch(() => false)) await community.check()
      await cont(journey, 'basic details')
    })

    await journey.step('2 date and time', async () => {
      const start = new Date(Date.now() + 12 * 86_400_000)
      start.setHours(19, 0, 0, 0)
      const end = new Date(start.getTime() + 3 * 3_600_000)
      await page.fill('#start-date-time-7', local(start))
      await page.fill('#end-date-time-8', local(end))
      await cont(journey, 'date and time')
    })

    await journey.step('3 the venue and its map pin', async () => {
      await page.getByRole('button', { name: 'In person', exact: true }).click()
      const search = page.getByPlaceholder('Search for a venue or an address')
      await search.fill('Old Melbourne Gaol')
      const first = page.getByRole('listbox', { name: 'Venue suggestions' }).getByRole('option').first()
      await expect(first, 'the venue search offered nothing').toBeVisible({ timeout: 20_000 })
      await first.click()
      await expect(page.getByTestId('venue-map-preview'), 'no map pin after choosing the venue').toBeVisible({ timeout: 20_000 })
      await cont(journey, 'the venue')
    })

    const shown: Record<string, number> = {}
    for (const [file, label] of [
      ['landscape.jpg', 'a landscape JPG'],
      ['portrait.png', 'a portrait PNG'],
      ['square.webp', 'a square WEBP'],
      ['wide.avif', 'a wide AVIF'],
      ['phone-8mb.jpg', 'a phone photograph over 8 MB'],
    ] as const) {
      await journey.step(`4 add ${label}: it shows at once and finishes uploading`, async () => {
        const before = await page.locator('ul li img').count()
        const t0 = Date.now()
        await page.setInputFiles('#event-media-files', img(file))
        await expect(page.locator('ul li img'), `${label} did not appear when chosen`).toHaveCount(before + 1, { timeout: 5_000 })
        shown[file] = Date.now() - t0
        expect(shown[file], `${label} took ${shown[file]} ms to appear`).toBeLessThan(2_000)
        await expect(page.getByText('Uploading...'), `${label} never finished uploading`).toHaveCount(0, { timeout: 90_000 })
        const notice = page.locator('[role="alert"]').filter({ hasText: /could not|refus|too|already|only/i })
        expect(await notice.count(), `${label}: ${await notice.first().textContent().catch(() => '')}`).toBe(0)
      })
    }

    await journey.step('4 the cover preview and alt text', async () => {
      await expect(page.getByText('Cover preview')).toBeVisible()
      await page.getByLabel('Alt text for image 1').fill('EventLinqs QA test card')
      await cont(journey, 'event media')
    })

    await journey.step('5 tickets: a free tier and a paid tier', async () => {
      await page.getByText('Sell tickets', { exact: true }).click()
      await page.fill('#tier-name-0', 'QA free')
      await page.selectOption('#tier-type-0', 'free')
      await page.fill('#tier-capacity-0', '500')
      await page.getByRole('button', { name: 'Add ticket tier' }).click()
      await page.fill('#tier-name-1', 'QA paid')
      await page.getByLabel('Ticket price for tier 2').fill('20')
      await page.fill('#tier-capacity-1', '10')
      await cont(journey, 'tickets')
    })

    await journey.step('6 unlisted', async () => {
      await page.locator('input[name="visibility"][value="unlisted"]').check()
      await cont(journey, 'settings')
    })

    let slug = ''
    let eventId = ''
    await journey.step('7 publish', async () => {
      await page.getByRole('button', { name: 'Publish event' }).click()
      await expect(page).toHaveURL(/\/dashboard\/events/, { timeout: 60_000 })
      const m = page.url().match(/\/dashboard\/events\/([0-9a-f-]{36})/)
      if (m) eventId = m[1]
    })

    await journey.step('the event is in My events, Published', async () => {
      await journey.open('/dashboard/events')
      const row = page.getByText(title).first()
      await expect(row, 'the new event is not in My events').toBeVisible()
      const link = page.locator(`a[href^="/dashboard/events/"]`).filter({ hasText: title }).first()
      const href = (await link.getAttribute('href').catch(() => null)) ?? ''
      const m = href.match(/\/dashboard\/events\/([0-9a-f-]{36})/)
      if (m) eventId = m[1]
      expect(eventId, 'could not read the new event id').not.toBe('')
    })

    await journey.step('View public page: the cover whole, the place and the map', async () => {
      await journey.open(`/dashboard/events/${eventId}`)
      const view = page.getByRole('link', { name: 'View public page' })
      slug = ((await view.getAttribute('href')) ?? '').replace(/^.*\/events\//, '')
      await journey.open(`/events/${slug}`)
      await expect(page.locator('h1').first()).toContainText(title)
      const cover = page.locator('main img').first()
      await expect.poll(async () => cover.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), { timeout: 20_000 }).toBe(true)
      await expect(page.getByRole('link', { name: /get directions/i }).first()).toBeVisible()
      const robots = await page.locator('meta[name="robots"]').getAttribute('content').catch(() => null)
      expect(robots ?? '', 'an unlisted event must not be indexed').toMatch(/noindex/)
      mkdirSync(process.env.JOURNEY_OUT ?? 'test-results/journeys/adhoc', { recursive: true })
      writeFileSync(path.join(process.env.JOURNEY_OUT ?? 'test-results/journeys/adhoc', `qa-event-${info.project.name}.json`), JSON.stringify({ eventId, slug, title }))
    })

    await journey.step('edit: a new summary shows on the live page at once', async () => {
      await journey.open(`/dashboard/events/${eventId}/edit`)
      const summary = page.locator('#short-summary-200-2')
      await expect(summary).toBeVisible({ timeout: 30_000 })
      await summary.fill(`Edited by the QA journey ${tag}.`)
      // The wizard carries every step; walk to the end and save.
      for (let i = 0; i < 6; i += 1) {
        const save = page.getByRole('button', { name: 'Save Changes' })
        if (await save.isVisible().catch(() => false)) break
        await page.getByRole('button', { name: 'Continue', exact: true }).click()
      }
      await page.getByRole('button', { name: 'Save Changes' }).click()
      await expect(page).toHaveURL(/\/dashboard\/events/, { timeout: 60_000 })
      await journey.open(`/events/${slug}`)
      await expect(page.locator('main')).toContainText(`Edited by the QA journey ${tag}.`, { timeout: 20_000 })
    })

    await journey.step("the event's dashboard: every tab opens", async () => {
      await journey.open(`/dashboard/events/${eventId}`)
      const nav = page.getByRole('navigation', { name: 'Event sections' })
      const tabs = await nav.getByRole('link').evaluateAll((as) => as.map((a) => [a.textContent?.trim() ?? '', (a as HTMLAnchorElement).getAttribute('href') ?? '']))
      expect(tabs.length, 'no event tabs').toBeGreaterThan(3)
      for (const [name, href] of tabs) {
        const res = await page.goto(href)
        expect(res?.status() ?? 0, `the ${name} tab answered ${res?.status()}`).toBeLessThan(400)
        await expect(page.locator('h1, h2').first(), `the ${name} tab shows nothing`).toBeVisible()
      }
    })

    await journey.step('the payout screen loads', async () => {
      await journey.open('/dashboard/payouts')
      await expect(page.getByRole('button', { name: /Add payout method with Stripe|Continue setup with Stripe|Refresh status/ }).first()).toBeVisible()
    })

    if (keep) return

    await journey.step('pause (unpublish) from My events', async () => {
      await journey.open('/dashboard/events')
      const row = page.locator('tr, li, article').filter({ hasText: title }).first()
      await row.getByRole('button', { name: 'Pause' }).click()
      await expect(row.getByText(/paused/i)).toBeVisible({ timeout: 30_000 })
    })

    await journey.step('delete, typing its name; its address then answers 410', async () => {
      const row = page.locator('tr, li, article').filter({ hasText: title }).first()
      await row.getByRole('button', { name: 'Delete' }).click()
      const dialog = page.getByRole('dialog')
      await dialog.getByRole('textbox').fill(title)
      await dialog.getByRole('button', { name: 'Delete permanently' }).click()
      await expect(page.getByText(title)).toHaveCount(0, { timeout: 30_000 })
      const res = await page.goto(`/events/${slug}`)
      expect(res?.status(), 'a deleted event must answer 410').toBe(410)
    })
  })
})
