import { test, expect, type Journey } from './lib/journey'
import type { Locator, Page } from '@playwright/test'

/**
 * C. THE BUYER, as a person looking for something to do: the home page, a search for what people ask for (comedy, jazz,
 * free, AMCF, a venue), every city guide and the weekend page, then one event page with its map, Get directions, share
 * and save. The ticket purchase on our own test event is journey C2 (c2-checkout.journey.ts).
 */

const CITIES = ['melbourne', 'geelong', 'ballarat', 'bendigo']
// A venue with upcoming published nights, read from production at the sweep (qa-5c\reads\q-venue.sql).
const VENUE = process.env.JOURNEY_VENUE ?? 'Melbourne Recital Centre'

/** The event cards a visitor can tap: links to an event page inside the main content. */
function eventCards(page: Page): Locator {
  return page.locator('main a[href^="/events/"]:visible')
}

/**
 * The search a visitor meets first: the guide's own box on the home and city pages. Typing filters the list below; Go
 * (Enter) must bring that list into view with the matching nights, as Ticketmaster's and Eventbrite's search take the
 * visitor to the results (21 November 2026: Go did nothing, the answer out of sight below the category tiles).
 */
async function guideSearch(journey: Journey, q: string) {
  const { page } = journey
  const box = page.getByRole('searchbox', { name: /^Search events in / }).first()
  await expect(box, 'no search box on the guide').toBeVisible()
  await box.fill(q)
  await box.press('Enter')
  const list = page.locator('#city-calendar')
  await expect(list, 'Go did not bring the list into view').toBeInViewport({ timeout: 10_000 })
  return list
}

/** The header's search: the magnifier opens the search, Enter goes to the results page for the whole country. */
async function headerSearch(journey: Journey, q: string) {
  const { page } = journey
  await page.getByRole('button', { name: /open search|search/i }).first().click()
  const box = page.getByRole('dialog', { name: 'Search EventLinqs' }).locator('input').first()
  await expect(box).toBeVisible()
  await box.fill(q)
  await box.press('Enter')
  await expect
    .poll(() => {
      const u = new URL(page.url())
      return u.pathname === '/events' ? (u.searchParams.get('q') ?? '').toLowerCase() : `not the results page: ${u.pathname}`
    }, { timeout: 20_000, message: 'the header search did not open the results page' })
    .toBe(q.toLowerCase())
}

test.describe('C buyer', () => {
  test('home to a search to an event page @sweep @monitor', async ({ journey, page }) => {
    await journey.step('open the home page', async () => {
      const mark = journey.mark()
      await journey.open('/')
      await expect(page.locator('h1').first()).toBeVisible()
      await expect(eventCards(page).first(), 'the home page shows no event').toBeVisible()
      await page.waitForLoadState('load')
      journey.expectClean(mark, 'home page faults')
    })
    await journey.step('search for comedy in the header: the results page', async () => {
      await headerSearch(journey, 'comedy')
      await expect(eventCards(page).first(), 'a search for comedy found nothing').toBeVisible()
    })
    let href = ''
    await journey.step('open the first result', async () => {
      const first = eventCards(page).first()
      href = (await first.getAttribute('href')) ?? ''
      await first.click()
      await expect(page).toHaveURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      await expect(page.locator('h1').first()).toBeVisible()
    })
    await eventPageWorks(journey)
  })

  // What people ask for, typed into the home page's guide search. AMCF must find its festival by the name people use.
  for (const [q, must] of [
    ['jazz', null],
    ['free', null],
    ['AMCF', '/events/amcf-2026'],
    [VENUE, null],
  ] as const) {
    test(`a search for ${q} finds events @sweep`, async ({ journey }) => {
      await journey.step('open the home page', async () => {
        await journey.open('/')
      })
      await journey.step(`search for ${q}: Go brings the matching nights into view`, async () => {
        const list = await guideSearch(journey, q)
        const found = list.locator('a[href^="/events/"]')
        await expect(found.first(), `a search for ${q} found nothing`).toBeVisible()
        if (must) await expect(list.locator(`a[href="${must}"]`).first(), `a search for ${q} did not find ${must}`).toBeVisible()
      })
    })
  }

  for (const city of CITIES) {
    test(`the ${city} guide shows its nights and every card opens @sweep`, async ({ journey, page }) => {
      await journey.step(`open /city/${city}`, async () => {
        const mark = journey.mark()
        await journey.open(`/city/${city}`)
        await expect(page.locator('h1').first()).toBeVisible()
        await expect(eventCards(page).first(), `${city} shows no night`).toBeVisible()
        await page.waitForLoadState('load')
        journey.expectClean(mark, `${city} guide faults`)
      })
      await journey.step('the first card opens its event', async () => {
        const first = eventCards(page).first()
        await first.scrollIntoViewIfNeeded()
        await first.click()
        await expect(page).toHaveURL(/\/events\//)
        await expect(page.locator('h1').first()).toBeVisible()
      })
    })
  }

  test('the weekend page shows this weekend @sweep', async ({ journey, page }) => {
    await journey.step('open the weekend page', async () => {
      const mark = journey.mark()
      await journey.open('/this-weekend')
      await expect(page.locator('h1').first()).toBeVisible()
      await expect(eventCards(page).first(), 'the weekend page shows no night').toBeVisible()
      journey.expectClean(mark, 'weekend page faults')
    })
  })
})

/** An event page as a buyer reads it: its name, its date, where it is with a map and Get directions, share and save. */
export async function eventPageWorks(journey: Journey) {
  const { page } = journey
  await journey.step('the event page names the night, its date and its place', async () => {
    await expect(page.locator('h1').first()).toBeVisible()
    await expect(page.locator('main')).toContainText(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/)
  })
  await journey.step('the map and Get directions', async () => {
    const directions = page.getByRole('link', { name: /get directions/i }).first()
    await directions.scrollIntoViewIfNeeded()
    await expect(directions, 'no Get directions link').toBeVisible()
    const target = (await directions.getAttribute('href')) ?? ''
    expect(target, `Get directions goes to ${target}`).toMatch(/^https:\/\/(www\.)?google\.[a-z.]+\/maps|^https:\/\/maps\.google\./)
    const map = page.locator('iframe[src*="google.com/maps"], iframe[title*="map" i], [data-map], [aria-label*="map" i]').first()
    await expect(map, 'no map on the event page').toBeVisible()
  })
  await journey.step('share and save are there and answer', async () => {
    const share = page.getByRole('button', { name: /share/i }).first()
    await expect(share, 'no share button').toBeVisible()
    const save = page.getByRole('button', { name: /save/i }).first()
    await expect(save, 'no save button').toBeVisible()
    await save.click()
    // A signed out visitor is asked to sign in, or the save is kept: either is an answer; nothing is not.
    await expect
      .poll(async () => {
        const url = page.url()
        if (/\/(login|signin|signup)/.test(url)) return 'sign in'
        if (await page.getByRole('dialog').isVisible().catch(() => false)) return 'dialog'
        if ((await save.getAttribute('aria-pressed')) === 'true') return 'saved'
        if (/saved/i.test((await save.textContent()) ?? '')) return 'saved'
        return 'nothing'
      }, { timeout: 10_000, message: 'pressing save did nothing a visitor could see' })
      .not.toBe('nothing')
  })
}
