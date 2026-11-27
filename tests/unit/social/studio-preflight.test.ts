import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { moveStudioPieces, preflightOf, preflightStudioPieces, studioPath, PREFLIGHT_LIMIT } from '@/lib/social/studio-move'
import type { IntakeInput } from '@/lib/creative/intake'
import { passedChecklist, studioFakeDb } from './studio-fake'

/*
 * CAR T, T3 (the PM's 02:05 of 28 November 2026: "a studio piece flagged preflight runs the intake's checks within 10
 * minutes and writes its reasons back, with no handoff"). Red on main, where the studio learned a hold only after its
 * slides had travelled and the piece had moved: now a piece it flags preflight is judged by the intake's own gates on
 * every social run, before any slide travels, its answer written on the piece, and it never moves until the studio
 * clears the flag.
 */
const read = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
const NOW = new Date('2026-11-28T08:00:00Z')
const NIGHT = '33333333-3333-4333-8333-333333333333'
const LISTED = { eventId: NIGHT, title: 'Night Market', startDate: '2026-11-29T09:00:00Z', endDate: null, venue: 'Queen Victoria Market', organiser: null }
const piece = (over: object = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  brief_id: '22222222-2222-4222-8222-222222222222',
  piece_key: 'mel-comingsoon-2026-12-01',
  format: 'feed',
  slides: 2,
  captions: { instagram: 'Night Market, Sunday 29 November.', facebook: 'Night Market, Sunday 29 November.' },
  destinations: ['instagram', 'facebook'],
  event_ids: [NIGHT],
  facts: [{ eventId: NIGHT, startDate: '2026-11-29T09:00:00Z' }],
  link: 'https://www.eventlinqs.com.au/ig?piece=PIECE_ID_HERE',
  objective: 'discovery',
  preferred_at: '2026-11-29T01:30:00Z',
  latest_at: '2026-11-29T07:00:00Z',
  expires_at: '2026-11-29T09:00:00Z',
  qa_checklist: passedChecklist(2),
  preflight: true,
  preflight_of: null,
  moved_at: null,
  error: null,
  ...over,
})
const deps = (reasons: readonly string[] = [], seen: IntakeInput[] = []) => ({
  urlOf: (path: string) => `https://store.example/storage/v1/object/public/event-images/${path}`,
  facts: async () => new Map([[NIGHT, LISTED]]),
  check: async (input: IntakeInput) => (seen.push(input), reasons),
})
const answers = (updates: { table: string; values: Record<string, unknown> }[]) => updates.filter((u) => u.table === 'studio_pieces').map((u) => u.values)

describe('the preflight, check only', () => {
  it('judges a flagged piece before any slide travels, its slides at the addresses the move would store them under, and writes the pass back', async () => {
    const { db, updates } = studioFakeDb({ pieces: [piece()], uploads: [] })
    const seen: IntakeInput[] = []
    const lines = await preflightStudioPieces(db, deps([], seen), NOW)
    expect(seen).toHaveLength(1)
    expect(seen[0].images).toEqual([1, 2].map((n) => ({ url: `https://store.example/storage/v1/object/public/event-images/${studioPath(piece().id, n, 'feed')}`, restsOn: { kind: 'own_design' } })))
    expect(seen[0].facts).toEqual([LISTED])
    expect(answers(updates)).toEqual([{ preflight_at: NOW.toISOString(), preflight_passed: true, preflight_reasons: [], preflight_of: expect.any(String) }])
    expect(lines).toEqual(['mel-comingsoon-2026-12-01: preflight PASSED; clear preflight to send it'])
  })
  it("writes every reason back: the checklist's, then the intake's", async () => {
    const { db, updates } = studioFakeDb({ pieces: [piece({ qa_checklist: null })], uploads: [] })
    await preflightStudioPieces(db, deps(['[words] The instagram caption carries 7 emoji; 1 to 5.']), NOW)
    const a = answers(updates)[0]
    expect(a.preflight_passed).toBe(false)
    expect((a.preflight_reasons as string[])[0]).toMatch(/^\[phone check\] /)
    expect(a.preflight_reasons).toContain('[words] The instagram caption carries 7 emoji; 1 to 5.')
  })
  it('a night not public now is a reason, and the intake is not asked', async () => {
    const { db, updates } = studioFakeDb({ pieces: [piece()], uploads: [] })
    const seen: IntakeInput[] = []
    await preflightStudioPieces(db, { ...deps([], seen), facts: async () => new Map() }, NOW)
    expect(seen).toHaveLength(0)
    expect(answers(updates)[0].preflight_reasons).toEqual([`[facts] its night ${NIGHT} is not public now, so its facts cannot be stated.`])
  })
  it('judges again only when what it states changes, and a failed read is never kept as an answer', async () => {
    const rows = { pieces: [piece()], uploads: [] as Record<string, unknown>[] }
    const { db, updates } = studioFakeDb(rows)
    await preflightStudioPieces(db, deps(['[timing] too late']), NOW)
    expect(await preflightStudioPieces(db, deps(), NOW)).toEqual([])
    rows.pieces[0].captions = { instagram: 'Night Market, Sunday 29 November, fixed.', facebook: 'Night Market, Sunday 29 November.' }
    await preflightStudioPieces(db, deps(), NOW)
    expect(answers(updates).map((a) => a.preflight_passed)).toEqual([false, true])
    const failing = studioFakeDb({ pieces: [piece()], uploads: [] })
    await preflightStudioPieces(failing.db, { ...deps(), check: async () => { throw new Error('the nights could not be read') } }, NOW)
    expect(answers(failing.updates)[0]).toMatchObject({ preflight_passed: false, preflight_of: null })
    expect(preflightOf(piece() as never, [])).not.toBe(preflightOf(piece() as never, [{ slide_no: 1, view: 'full', rests_on: { kind: 'own_design' } }]))
    expect(PREFLIGHT_LIMIT).toBe(5)
  })
  it('a preflight piece never moves, even with every slide and phone view sent', async () => {
    const PNG = '\\x89504e470d0a1a0a0000000d49484452'
    const uploads = [1, 2].flatMap((n) => ['full', 'phone'].map((view) => ({ id: `${view}${n}`, brief_id: piece().brief_id, piece_key: piece().piece_key, format: 'feed', slide_no: n, view, png: PNG, rests_on: { kind: 'own_design' }, moved_at: null })))
    const flagged = studioFakeDb({ pieces: [piece()], uploads })
    expect(await moveStudioPieces(flagged.db, { store: async (p) => p, receive: async () => ({ state: 'handed_off', id: 'i' }), facts: async () => new Map([[NIGHT, LISTED]]) }, NOW)).toEqual([])
    const cleared = studioFakeDb({ pieces: [piece({ preflight: false })], uploads })
    const lines = await moveStudioPieces(cleared.db, { store: async (p) => p, receive: async () => ({ state: 'handed_off', id: 'i' }), facts: async () => new Map([[NIGHT, LISTED]]) }, NOW)
    expect(lines[0]).toMatch(/^mel-comingsoon-2026-12-01: moved, 2 slides/)
  })
})

describe('the wiring', () => {
  it('runs every social run beside the move, on the intake gates and the handoff refusals, its fit measured when the slides travel', () => {
    expect(read('src/app/api/cron/social-publish/route.ts')).toContain('for (const line of await preflightStudioNow(db, { now, siteOrigin: getSiteUrl() })) console.log(`[cron/social-publish] studio preflight: ${line}`)')
    const store = read('src/lib/social/store.ts')
    expect(store).toContain("const facts = await readIntakeFacts(db, r, opts.now, { stage: 'intake', siteOrigin: opts.siteOrigin, fetcher: opts.fetcher, measureFit: false })")
    expect(store).toContain('    const refused = pieceRefusal(p) ?? law37Refusal(p.slides)\n    if (refused) faults.push(`[handoff] ${refused}`)')
    expect(read('src/lib/social/carousel-wiring.ts')).toContain('check: (record) => preflightIntake(db, record, { now: input.now, siteOrigin: input.siteOrigin }),')
    expect(read('supabase/migrations/20261128050001_the_studio_asks_before_it_sends.sql')).toContain('add column if not exists preflight boolean not null default false,')
  })
})
