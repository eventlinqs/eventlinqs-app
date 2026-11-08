import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * EVERY ACCEPTED SUBMISSION'S OWN PHOTO GOES ON ITS EVENT (Lawal's law of 8 November 2026, 13:32, which withdrew the
 * PM's 06:52 ruling that held one screenshot back). Source assertions: an accepted row that carries a photo and names the
 * event it became is given its photo through the self-listed photo's own path (the photo lock, the rights record, the
 * credit), with no mark needed, and tried until the record says it is on.
 */
const RUN = readFileSync(join(process.cwd(), 'src/lib/listings/self-listing-run.ts'), 'utf8').replace(/\r\n/g, '\n')
const body = RUN.slice(RUN.indexOf('export async function attachApprovedPhotos'))

describe('attachApprovedPhotos', () => {
  test('reads only accepted submissions that carry a photo and name the event they became', () => {
    expect(body).toContain(".eq('status', 'accepted')")
    expect(body).toContain(".not('photo_path', 'is', null)")
    expect(body).toContain(".not('published_event_id', 'is', null)")
  })
  test('needs no approval mark any more, and stops only once the photo is on', () => {
    expect(body).not.toContain('photo_approved')
    expect(body).toContain('if (!photoStillOwed(r, result)) continue')
  })
  test("puts the photo on through the self-listed photo's own path and records whether it is on", () => {
    expect(body).toContain('await attachPhoto(admin, r, r.published_event_id, credit.slice(0, 200))')
    expect(body).toContain('check_result: { ...result, photo: photo.words, photo_attached: photo.attached }')
  })
  test('the hourly listings run calls it', () => {
    const cron = readFileSync(join(process.cwd(), 'src/app/api/cron/listing-occurrences/route.ts'), 'utf8')
    expect(cron).toContain('await attachApprovedPhotos()')
  })
})
