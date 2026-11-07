import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A PHOTO LAWAL APPROVED for a submission accepted before self-listing (the PM's 06:52 of 8 November 2026: A Moment of
 * Sanity's artwork, once the photo path is proved; Kyivska Perepichka's screenshot never). Source assertions: only an
 * accepted row a reviewed write marked photo_approved, with its event named, is ever given its photo, once, through the
 * self-listed photo's own path (the photo lock, the rights record, the credit).
 */
const RUN = readFileSync(join(process.cwd(), 'src/lib/listings/self-listing-run.ts'), 'utf8').replace(/\r\n/g, '\n')
const body = RUN.slice(RUN.indexOf('export async function attachApprovedPhotos'))

describe('attachApprovedPhotos', () => {
  test('reads only accepted submissions that carry a photo and name the event they became', () => {
    expect(body).toContain(".eq('status', 'accepted')")
    expect(body).toContain(".not('photo_path', 'is', null)")
    expect(body).toContain(".not('published_event_id', 'is', null)")
  })
  test('acts only on the explicit mark, and never twice', () => {
    expect(body).toContain("if (result.photo_approved !== true || typeof result.photo === 'string') continue")
  })
  test("puts the photo on through the self-listed photo's own path and records what happened", () => {
    expect(body).toContain('await attachPhoto(admin, r, r.published_event_id, credit.slice(0, 200))')
    expect(body).toContain("update({ check_result: { ...result, photo } })")
  })
  test('the hourly listings run calls it', () => {
    const cron = readFileSync(join(process.cwd(), 'src/app/api/cron/listing-occurrences/route.ts'), 'utf8')
    expect(cron).toContain('await attachApprovedPhotos()')
  })
})
