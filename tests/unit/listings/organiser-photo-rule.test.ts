import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  isOrganiserCover,
  mayStayPublished,
  ORGANISER_PHOTO_LAW,
  organiserCoverObject,
  photoStillOwed,
} from '../../../src/lib/listings/organiser-photo-rule'

/**
 * AN ORGANISER'S EVENT NEVER GOES UP WITHOUT THE PHOTO THEY SENT (Lawal's law of 8 November 2026, 13:32 (4): "a guard and
 * a test in the train that refuse to publish any accepted or self-listed submission that carries a photo unless its photo
 * is attached and showing"). The rule's cases, then where the self-listing run applies it. The guard's half is
 * scripts/guards/organiser-photo-before-publish.mjs, drilled red in scripts/verify/guard-failure-drills.mjs.
 */
const SUB = '52d2f81d-04e4-4d98-a675-716d441ad890'
const STORE = 'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/event-images'

describe('the rule', () => {
  test("the organiser's photo lives at one place per submission", () => {
    expect(organiserCoverObject(SUB, 'jpg')).toBe(`submissions/${SUB}/cover.jpg`)
  })
  test("only that submission's own stored photo counts as showing it", () => {
    expect(isOrganiserCover(`${STORE}/submissions/${SUB}/cover.jpg`, SUB)).toBe(true)
    expect(isOrganiserCover(`${STORE}/submissions/${SUB}/cover.webp`, SUB)).toBe(true)
    expect(isOrganiserCover(`${STORE}/generated-covers/a6778756-b6f0-4997-8f1a-8d6c2aaa0bbe/1794085887590.jpg`, SUB)).toBe(false)
    expect(isOrganiserCover(`${STORE}/submissions/760aa04a-dd8d-4617-a031-ab4cb5b15290/cover.jpg`, SUB)).toBe(false)
    expect(isOrganiserCover(null, SUB)).toBe(false)
    expect(isOrganiserCover(undefined, SUB)).toBe(false)
  })
  test('a submission with no photo may stay published; one with a photo only once it is on', () => {
    expect(mayStayPublished({ photo_path: null }, { attached: false, words: 'none sent' })).toBe(true)
    expect(mayStayPublished({ photo_path: 'x.jpg' }, { attached: true, words: 'yes' })).toBe(true)
    expect(mayStayPublished({ photo_path: 'x.jpg' }, { attached: false, words: 'sent, but it could not be stored' })).toBe(false)
  })
  test('the backstop owes a photo until the record says it is on, whatever words a failed try left', () => {
    expect(photoStillOwed({ photo_path: 'x.jpg' }, null)).toBe(true)
    expect(photoStillOwed({ photo_path: 'x.jpg' }, { photo: 'sent, but it could not be read' })).toBe(true)
    expect(photoStillOwed({ photo_path: 'x.jpg' }, { photo: 'sent, but it could not be read', photo_attached: false })).toBe(true)
    expect(photoStillOwed({ photo_path: 'x.jpg' }, { photo_attached: true })).toBe(false)
    expect(photoStillOwed({ photo_path: null }, null)).toBe(false)
  })
  test("the reason names Lawal's law", () => {
    expect(ORGANISER_PHOTO_LAW).toContain("Lawal's law of 8 November 2026, 13:32")
  })
})

describe("the guard's two judges, on known positives", () => {
  const OWN = `${STORE}/submissions/${SUB}/cover.jpg`
  const GENERATED = `${STORE}/generated-covers/a6778756-b6f0-4997-8f1a-8d6c2aaa0bbe/1794085887590.jpg`
  const sub = (status: string, photo_path: string | null = 'bfd3be94.jpg') => ({ id: SUB, status, title: 'Kyivska Perepichka', photo_path })

  test('an accepted submission with a photo and no event showing it fails, by name', async () => {
    const { judgeRows } = await import('../../../scripts/guards/organiser-photo-before-publish.mjs')
    expect(judgeRows([sub('accepted')], [])).toHaveLength(1)
    expect(judgeRows([sub('accepted')], [])[0]).toContain('Kyivska Perepichka')
    expect(judgeRows([sub('accepted')], [{ id: 'e', status: 'published', cover_image_url: GENERATED }])).toHaveLength(1)
    expect(judgeRows([sub('published')], [{ id: 'e', status: 'draft', cover_image_url: OWN }])).toHaveLength(1)
  })
  test('its own photo on a published event passes; a held row or one with no photo is not judged', async () => {
    const { judgeRows } = await import('../../../scripts/guards/organiser-photo-before-publish.mjs')
    expect(judgeRows([sub('accepted')], [{ id: 'e', status: 'published', cover_image_url: OWN }])).toEqual([])
    expect(judgeRows([sub('published')], [{ id: 'e', status: 'published', cover_image_url: OWN }])).toEqual([])
    expect(judgeRows([sub('held')], [])).toEqual([])
    expect(judgeRows([sub('accepted', null)], [])).toEqual([])
  })
  test('the code judge passes the tree and fails a run without the gate', async () => {
    const { judgeCode } = await import('../../../scripts/guards/organiser-photo-before-publish.mjs')
    const rule = readFileSync(join(process.cwd(), 'src/lib/listings/organiser-photo-rule.ts'), 'utf8')
    const run = readFileSync(join(process.cwd(), 'src/lib/listings/self-listing-run.ts'), 'utf8')
    expect(judgeCode(rule, run)).toEqual([])
    const ungated = run.replace('if (!mayStayPublished(sub, photo)) {', 'if (false) {')
    expect(judgeCode(rule, ungated).join(' ')).toContain('no longer stands the photo gate')
  })
})

describe('the self-listing run applies it', () => {
  const RUN = readFileSync(join(process.cwd(), 'src/lib/listings/self-listing-run.ts'), 'utf8').replace(/\r\n/g, '\n')
  const self = RUN.slice(RUN.indexOf('export async function selfListSubmission'), RUN.indexOf('export async function selfListWaiting'))

  test('the photo is tried before the submission is recorded published, and the gate stands between them', () => {
    const tried = self.indexOf('const photo = await attachPhoto(')
    const gate = self.indexOf('if (!mayStayPublished(sub, photo)) {')
    const published = self.indexOf("update({ status: 'published'")
    expect(tried).toBeGreaterThan(-1)
    expect(gate).toBeGreaterThan(tried)
    expect(published).toBeGreaterThan(gate)
  })
  test('a night without its photo is paused, taken away and held, never left up', () => {
    const held = self.slice(self.indexOf('if (!mayStayPublished(sub, photo)) {'), self.indexOf("update({ status: 'published'"))
    expect(held).toContain(".from('event_series').update({ status: 'paused' }).eq('id', seriesId)")
    expect(held).toContain('await deleteEventEverywhere({ eventId: made.id as string')
    expect(held).toContain("status: 'held'")
    expect(held).toContain("return { state: 'held', reason }")
  })
  test('the photo is stored at the rule\'s one place', () => {
    expect(RUN).toContain('const object = organiserCoverObject(sub.id, ext)')
  })
})
