import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect, type Journey } from './lib/journey'

/**
 * F1. THE COMPLAINT OF 19 NOVEMBER 2026: Aria (Asia Oasis) wrote 'I tried uploading our festival photos through your
 * website, but unfortunately I wasn't able to'. The page she used is the organiser's own photo link. This journey uses
 * it as she did, on the test contact's own link (its only night is the unlisted acceptance test night), with every
 * format and shape the page accepts: a landscape JPG, a portrait PNG and a square WEBP together; her two narrow sizes
 * (973 and 916 pixels wide); and a 12 megapixel phone photograph over 8 MB. Each press must end in the page's thank you
 * with nothing refused, and the night's page must then answer with its photograph whole.
 *
 * JOURNEY_PHOTO_LINK   the test contact's photo link (kept out of git; the run reads it from where it is stored)
 * JOURNEY_IMAGES       the folder make-images.mjs wrote (default test-results/journey-images)
 */
const LINK_FILE = 'C:/dev/EVIDENCE/EL-20NOV/acceptance/T4T5/photo-link.txt'
const link = process.env.JOURNEY_PHOTO_LINK ?? (existsSync(LINK_FILE) ? readFileSync(LINK_FILE, 'utf8').trim() : '')
const IMAGES = path.join(process.env.JOURNEY_IMAGES ?? 'test-results/journey-images', 'f1')
const img = (name: string) => path.resolve(IMAGES, name)
const NIGHT = '/events/eventlinqs-acceptance-test-night'

async function sendPhotos(journey: Journey, files: string[], label: string) {
  const { page } = journey
  await journey.step(`open the photo link (${label})`, async () => {
    await journey.open(new URL(link).pathname)
    await expect(page.locator('#ph-photos')).toBeVisible()
    await expect(page.locator('#ph-night option:checked')).toContainText('EventLinqs acceptance test night')
  })
  await journey.step(`choose ${label}`, async () => {
    await page.setInputFiles('#ph-photos', files)
    // The page fits large photos into one request in the browser; its note clears when they are ready.
    await page.waitForTimeout(800)
    await expect(page.getByText('Making your photos ready to send...')).toHaveCount(0, { timeout: 90_000 })
    await expect(page.getByText('These are too large to send together')).toHaveCount(0)
  })
  await journey.step(`fill and send (${label})`, async () => {
    // One tick, one checkbox (Lawal, 13:49 of 23 November 2026): the form carries exactly one.
    await expect(page.locator('form[data-photo-permission] input[type="checkbox"]')).toHaveCount(1)
    await page.fill('#ph-name', 'EventLinqs QA journey')
    await page.check('input[name="rights"]')
    await Promise.all([page.waitForURL(/[?&](sent|problem)=/, { timeout: 120_000 }), page.locator('button[type="submit"]').click()])
    const said = new URL(page.url())
    const problem = said.searchParams.get('problem')
    expect(problem, `the photo page refused: ${problem}`).toBeNull()
    const sent = said.searchParams.get('sent') ?? ''
    expect(sent, 'the photo page did not thank the organiser').toMatch(/^Thank you\. Your photos? (is|are) now (on|with) your event/)
    expect(sent, `the page refused part of it: ${sent}`).not.toContain('Not added:')
    await expect(page.locator('[data-said="sent"]')).toBeVisible()
  })
}

test.describe('F1 photo link', () => {
  test.skip(!link, 'no photo link stored on this machine')

  test('three formats together, JPG PNG WEBP @sweep', async ({ journey }) => {
    await sendPhotos(journey, [img('landscape.jpg'), img('portrait.png'), img('square.webp')], 'a landscape JPG, a portrait PNG and a square WEBP')
    await nightShowsWhole(journey)
  })

  test("Aria's narrow sizes, 973 and 916 wide @sweep", async ({ journey }) => {
    await sendPhotos(journey, [img('aria-973.jpg'), img('aria-916.jpg')], 'two narrow photographs')
    await nightShowsWhole(journey)
  })

  test('a phone photograph over 8 MB @sweep @monitor', async ({ journey }) => {
    await sendPhotos(journey, [img('phone-8mb.jpg')], 'a 12 megapixel phone photograph')
    await nightShowsWhole(journey)
  })
})

/** The night's page answers at once, fresh, with its photograph shown whole: the box keeps the picture's own shape. */
async function nightShowsWhole(journey: Journey) {
  const { page } = journey
  await journey.step('the night shows its photograph whole', async () => {
    await journey.open(NIGHT)
    const hero = page.locator('main img').first()
    await expect(hero).toBeVisible()
    await expect.poll(async () => hero.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), { timeout: 20_000 }).toBe(true)
    const fit = await hero.evaluate((i: HTMLImageElement) => {
      const box = i.getBoundingClientRect()
      const style = getComputedStyle(i)
      return { nat: i.naturalWidth / i.naturalHeight, box: box.width / box.height, fit: style.objectFit, w: box.width, h: box.height }
    })
    const whole = fit.fit === 'contain' || fit.fit === 'scale-down' || Math.abs(fit.nat - fit.box) / fit.nat < 0.03
    expect(whole, `the photograph is cropped: picture ${fit.nat.toFixed(3)}, box ${fit.box.toFixed(3)} (${fit.w}x${fit.h}), object-fit ${fit.fit}`).toBe(true)
  })
}
