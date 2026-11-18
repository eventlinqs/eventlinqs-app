import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HISTORY_COLUMNS, sameDrawing, withdrawnSlides } from '@/lib/social/store'

/*
 * THE P0 OF 18 NOVEMBER 2026: Lawal could not open /admin/social. Production read at 11:53: the week's read carried every
 * revision of 57 pieces, 904 revisions and 2.4 MB of slides and words, and the hourly sweep was the cause of the growth:
 * a slide whose photo was already empty read as withdrawn, so the same drawing was written again every hour (119 of the
 * 141 revisions since 08:00 identical to the one before; one piece held 56). Each such revision also voided an approval.
 */
const STORE = readFileSync(join(process.cwd(), 'src/lib/social/store.ts'), 'utf8').replace(/\r\n/g, '\n')
const bodyOf = (src: string, head: string) => {
  const at = src.indexOf(head)
  return src.slice(at, src.indexOf('\n}\n', at))
}

describe('the hourly sweep never writes the same drawing twice', () => {
  const slides = [
    { t: 'night', photo: 'https://img.example/a.jpg', credit: 'A' },
    { t: 'night', photo: null, credit: null },
    { t: 'brand', photo: null },
  ] as never

  it('only a slide that holds a photograph now can lose one', () => {
    const usable = { url: 'https://img.example/a.jpg' }
    expect(withdrawnSlides(slides, new Map<number, unknown>([[0, usable], [1, null]]))).toEqual([])
    expect(withdrawnSlides(slides, new Map<number, unknown>([[0, null], [1, null]]))).toEqual([0])
    expect(withdrawnSlides(slides, new Map<number, unknown>([[0, usable], [1, null], [2, null]]))).toEqual([])
  })

  it('a drawing read back from the database equals the same drawing made in code, whatever its keys order', () => {
    const made = { eventIds: ['e1'], slides: [{ t: 'night', photo: null, title: 'Gig' }], versions: { instagram: { caption: 'x', hook: 'h' } }, caption: 'x' }
    const readBack = { eventIds: ['e1'], slides: [{ title: 'Gig', photo: null, t: 'night' }], versions: { instagram: { hook: 'h', caption: 'x' } }, caption: 'x' }
    expect(sameDrawing(made, readBack)).toBe(true)
    expect(sameDrawing(made, { ...readBack, caption: 'y' })).toBe(false)
    expect(sameDrawing(made, { ...readBack, slides: [{ t: 'night', photo: 'https://img.example/b.jpg', title: 'Gig' }] })).toBe(false)
  })

  it('the sweep reads withdrawn slides through the rule and skips a drawing equal to the newest', () => {
    const sweep = bodyOf(STORE, 'export async function sweepWithdrawnImages(')
    expect(sweep).toContain('const goneAt = withdrawnSlides(rev.slides, images)')
    expect(sweep).toContain('if (sameDrawing(plan, rev)) continue')
    expect(sweep).not.toMatch(/\.filter\(\(\[, u\]\) => u === null\)/)
  })
})

describe('/admin/social reads one drawing a piece, never every revision', () => {
  it("the week's read asks for each revision's number and maker only, and the newest revision in full", () => {
    const read = bodyOf(STORE, 'export async function readCampaign(')
    expect(HISTORY_COLUMNS).toBe('version, made_by, made_at')
    expect(read).toContain('social_piece_revisions(${HISTORY_COLUMNS})')
    expect(read).not.toContain('social_piece_revisions(${REVISION_COLUMNS})')
    expect(read).toContain('await newestRevisions(db,')
  })
})
