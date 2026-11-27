import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CHECK_ITEMS, checkLine, checkProblems } from '@/lib/social/studio-check'
import { moveStudioPieces } from '@/lib/social/studio-move'
import { studioProof } from '@/lib/social/studio-proof'
import { passedChecklist, studioFakeDb } from './studio-fake'

/*
 * THE PHONE CHECK (Lawal, 16:52 on 27 November 2026: "no piece reaches Lawal without a passed phone check"; the PM's 17:00,
 * car Q; migration 20261127170001). Red before it, where the bridge's move handed on every piece whose slides had arrived,
 * checked or not: a piece now moves only when every slide's ten items pass and every slide has its phone view; one failed
 * item, or a slide with no phone view, keeps it where it is, its reason on the row and said once into ops_phase_runs; the
 * phone views are stored beside the slides and /admin/social shows them with the checklist's result.
 */
const read = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
const NOW = new Date('2026-11-27T08:00:00Z')
const PNG_HEX = '\\x89504e470d0a1a0a0000000d49484452'
const BRIEF = '22222222-2222-4222-8222-222222222222'

function piece(checklist: unknown) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    brief_id: BRIEF,
    piece_key: 'mel-weekend-2026-11-28',
    format: 'feed',
    slides: 2,
    captions: { instagram: 'This weekend in Melbourne.' },
    destinations: ['instagram', 'facebook'],
    event_ids: ['33333333-3333-4333-8333-333333333333'],
    facts: [{ event_id: '33333333-3333-4333-8333-333333333333', start: '2026-11-28T09:00:00Z' }],
    link: 'https://www.eventlinqs.com.au/city/melbourne',
    objective: 'discovery',
    preferred_at: '2026-11-27T22:00:00Z',
    latest_at: '2026-11-28T02:00:00Z',
    expires_at: '2026-11-28T12:00:00Z',
    qa_checklist: checklist,
    held_reason: null,
    moved_at: null,
    error: null,
  }
}
const upload = (id: string, slide: number, view: string) => ({ id, brief_id: BRIEF, piece_key: 'mel-weekend-2026-11-28', slide_no: slide, format: 'feed', view, png: PNG_HEX, rests_on: { kind: 'own_design' }, moved_at: null })
const allUploads = () => [upload('u1', 1, 'full'), upload('u2', 2, 'full'), upload('p1', 1, 'phone'), upload('p2', 2, 'phone')]

// The night as the engine reads it (car S): the intake's facts come from here, never from the studio's text.
const LISTED = { eventId: '33333333-3333-4333-8333-333333333333', title: 'Night Market', startDate: '2026-11-28T09:00:00Z', endDate: null, venue: null, organiser: null }
const facts = async () => new Map([[LISTED.eventId, LISTED]])

function failingItem() {
  const c = passedChecklist(2)
  ;(c.slides[1].items[2] as { pass: unknown; seen: string }).pass = false
  c.slides[1].items[2].seen = 'the venue line runs into the right edge at 390 px'
  return c
}

describe('the checklist, read the one way', () => {
  it('passes ten passed items on every slide with a phone view of each', () => {
    expect(CHECK_ITEMS).toHaveLength(10)
    expect(checkProblems(passedChecklist(2), 2, new Set([1, 2]))).toEqual([])
    expect(checkLine([], 2)).toBe('Phone check passed: all 10 items on each of 2 slides, and a phone view of every slide.')
  })
  it('names a failed item with what was seen, a missing item, an item with no line, a missing slide and a missing checklist', () => {
    expect(checkProblems(failingItem(), 2, new Set([1, 2]))).toEqual([
      'slide 2 item 3 (nothing cut off, clear of the edges and the Story zones) did not pass: the venue line runs into the right edge at 390 px',
    ])
    const short = passedChecklist(1)
    short.slides[0].items.pop()
    short.slides[0].items[0].seen = ' '
    expect(checkProblems(short, 1, new Set([1]))).toEqual([
      'slide 1 item 1 (readable without zooming) has no line on what was seen',
      'slide 1 item 10 (desktop view clean) is not ticked',
    ])
    expect(checkProblems(passedChecklist(1), 2, new Set([1, 2]))).toEqual(['slide 2 has no checklist'])
    expect(checkProblems(null, 1, new Set([1]))).toEqual(['no phone checklist saved with the piece'])
  })
  it("takes the studio's word 'pass' for a pass, and nothing else", () => {
    const c = passedChecklist(1)
    c.slides[0].items.forEach((it) => ((it as { pass: unknown }).pass = 'pass'))
    expect(checkProblems(c, 1, new Set([1]))).toEqual([])
    ;(c.slides[0].items[4] as { pass: unknown }).pass = 'yes, mostly'
    expect(checkProblems(c, 1, new Set([1]))[0]).toMatch(/^slide 1 item 5 .* did not pass/)
  })
})

describe('the move holds what the phone check does not pass', () => {
  it('a passing piece moves: its slides and their phone views stored, the piece handed to the intake, its hold cleared', async () => {
    const rows = { pieces: [piece(passedChecklist(2))], uploads: allUploads() }
    const { db, updates } = studioFakeDb(rows)
    const stored: string[] = []
    let received: unknown = null
    const held: string[] = []
    const lines = await moveStudioPieces(
      db,
      {
        store: async (path) => (stored.push(path), `https://store/${path}`),
        facts,
        receive: async (input) => ((received = input), { state: 'handed_off', id: 'intake-1' }),
        held: async (_key, reason) => void held.push(reason),
      },
      NOW,
    )
    const at = 'creative/11111111-1111-4111-8111-111111111111'
    expect(stored).toEqual([`${at}/1-feed.jpg`, `${at}/2-feed.jpg`, `${at}/1-feed-phone.jpg`, `${at}/2-feed-phone.jpg`])
    expect((received as { images: { url: string }[] }).images.map((i) => i.url)).toEqual([`https://store/${at}/1-feed.jpg`, `https://store/${at}/2-feed.jpg`])
    expect(updates.find((u) => u.table === 'studio_pieces')?.values).toMatchObject({ intake_id: 'intake-1', held_reason: null, held_at: null })
    expect(held).toEqual([])
    expect(lines).toEqual(['mel-weekend-2026-11-28: moved, 2 slides and their phone views, Phone check passed: all 10 items on each of 2 slides, and a phone view of every slide. Intake handed_off'])
  })

  it('a piece with one failed item stays, its reason on the row and said once into ops_phase_runs', async () => {
    const rows = { pieces: [piece(failingItem())], uploads: allUploads() }
    const { db, updates } = studioFakeDb(rows)
    const held: string[] = []
    const deps = { store: async () => 'never', receive: async () => ({ state: 'handed_off', id: 'never' }), facts, held: async (_key: string, reason: string) => void held.push(reason) }
    const lines = await moveStudioPieces(db, deps, NOW)
    const reason = 'Held by the phone check: slide 2 item 3 (nothing cut off, clear of the edges and the Story zones) did not pass: the venue line runs into the right edge at 390 px'
    expect(lines).toEqual([`mel-weekend-2026-11-28: HELD, ${reason}`])
    expect(updates).toEqual([{ table: 'studio_pieces', values: { held_reason: reason, held_at: NOW.toISOString() }, id: piece(null).id }])
    expect(held).toEqual([reason])
    expect(rows.pieces[0].moved_at).toBeNull()
    // The next run reads it again: the same reason is not written or said twice, and the piece still does not move.
    await moveStudioPieces(db, deps, new Date(NOW.getTime() + 600_000))
    expect(updates).toHaveLength(1)
    expect(held).toHaveLength(1)
    // Fixed by the studio (the item passes now), the next run moves it.
    rows.pieces[0].qa_checklist = passedChecklist(2)
    const after = await moveStudioPieces(db, { ...deps, store: async (p: string) => p }, new Date(NOW.getTime() + 1_200_000))
    expect(after[0]).toMatch(/^mel-weekend-2026-11-28: moved, 2 slides/)
  })

  it('a piece with no phone view for a slide stays, with its reason', async () => {
    const rows = { pieces: [piece(passedChecklist(2))], uploads: allUploads().filter((u) => u.id !== 'p2') }
    const { db } = studioFakeDb(rows)
    let receivedAny = false
    const lines = await moveStudioPieces(db, { store: async () => 'never', receive: async () => ((receivedAny = true), { state: 'handed_off' }), facts }, NOW)
    expect(lines).toEqual(['mel-weekend-2026-11-28: HELD, Held by the phone check: slide 2 has no phone view'])
    expect(rows.pieces[0].held_reason).toBe('Held by the phone check: slide 2 has no phone view')
    expect(receivedAny).toBe(false)
  })

  it('a phone view sent for a piece that moved before the check is stored beside its slide, and the piece never moves again', async () => {
    const moved = { ...piece(null), moved_at: '2026-11-27T07:00:00Z' }
    const rows = { pieces: [moved], uploads: [{ ...upload('u1', 1, 'full'), moved_at: '2026-11-27T07:00:00Z' }, upload('p1', 1, 'phone')] }
    const { db } = studioFakeDb(rows)
    const stored: string[] = []
    const lines = await moveStudioPieces(db, { store: async (p) => (stored.push(p), `https://store/${p}`), receive: async () => ({ state: 'handed_off' }), facts }, NOW)
    expect(stored).toEqual(['creative/11111111-1111-4111-8111-111111111111/1-feed-phone.jpg'])
    expect(lines).toEqual(['mel-weekend-2026-11-28: phone view of slide 1 stored'])
  })
})

describe('/admin/social shows what the phone shows', () => {
  it('lists each slide\'s phone view in order, a gap named, with the result', () => {
    const proof = studioProof({ piece_key: 'k', slides: 2, qa_checklist: passedChecklist(2) }, new Map([[2, 'https://store/2-feed-phone.png']]))
    expect(proof.phoneViews).toEqual([null, 'https://store/2-feed-phone.png'])
    expect(proof.passed).toBe(false)
    expect(proof.line).toBe('Phone check NOT passed: slide 1 has no phone view.')
    expect(proof.rows.map((r) => r.items.length)).toEqual([10, 10])
  })
  it('the page reads the proofs beside its other reads, contained, and draws them beside the slides', () => {
    const page = read('src/app/admin/(authed)/social/page.tsx')
    expect(page).toContain('readStudioProofs(db, now).catch(')
    expect(page).toContain('{proof ? <StudioProofView proof={proof} /> : null}')
    expect(page).toContain('<Piece key={p.id} p={p} proof={studio.byPiece.get(p.id)} />')
    expect(page).toContain('data-section="studio-held"')
  })
})

describe('the database keeps the proof with the piece', () => {
  const sql = read('supabase/migrations/20261127170001_the_phone_check_travels_with_the_piece.sql')
  it('adds the checklist, the hold and the view, one upload a slide, format and view', () => {
    expect(sql).toContain("add column if not exists qa_checklist jsonb check (qa_checklist is null or jsonb_typeof(qa_checklist) = 'object')")
    expect(sql).toContain("add column if not exists view text not null default 'full' check (view in ('full', 'phone', 'grid', 'desktop'))")
    expect(sql).toContain('drop constraint if exists studio_uploads_piece_key_slide_no_format_key')
    expect(sql).toContain('unique (piece_key, slide_no, format, view)')
  })
  it('checks each view at its own size, and lets a slide be replaced only until it has moved', () => {
    expect(sql).toContain("if new.view = 'full' and (w, h) <> (1080, tall) then")
    expect(sql).toContain("if new.view = 'phone' and (w not in (390, 780, 1170) or abs(h * 1080 - w * tall) > 2 * 1080) then")
    expect(sql).toContain("if new.view = 'desktop' and (w not in (470, 940, 1410) or abs(h * 1080 - w * tall) > 2 * 1080) then")
    expect(sql).toMatch(/if new\.png is not distinct from old\.png then\n\s+return new;\n\s+end if;\n\s+if old\.moved_at is not null then/)
  })
})
