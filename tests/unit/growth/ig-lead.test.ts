import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { inPostOrder, type IgItem } from '@/lib/growth/ig'

/*
 * CAR U, U1 (the PM's 02:12 of 28 November 2026; car T's T1 folded in). Red on main, where the bio link listed every posted
 * night newest post first and nothing about the post a visitor came from: now the newest approved Instagram slot whose time
 * has come leads, under its own heading, its nights in the order its slides name them and numbered, the other posted
 * nights after it once each.
 */
const read = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
const item = (id: string) => ({ card: { id }, href: `/events/${id}`, postId: 'p' }) as unknown as IgItem

describe("the leading post's nights in the post's own order", () => {
  it('follows the order its slides name them, a night no slide names after them in its own order', () => {
    const items = [item('a'), item('b'), item('c'), item('d')]
    const slides = [{ t: 'file', eventId: 'c' }, { t: 'file', eventId: 'a' }, { t: 'file', eventId: 'c' }, { t: 'file' }]
    expect(inPostOrder(items, slides).map((i) => i.card.id)).toEqual(['c', 'a', 'b', 'd'])
    expect(inPostOrder(items, []).map((i) => i.card.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('the bio link leads with the post a visitor came from', () => {
  const page = read('src/app/ig/page.tsx')
  const ig = read('src/lib/growth/ig.ts')
  it("reads the newest approved slot whose time has come, with .lt on go_at, and that piece's own nights", () => {
    expect(ig).toContain("export async function readIgLead(now: Date = new Date()): Promise<IgLead | null> {")
    expect(ig).toContain(".lt('go_at', new Date(now.getTime() + IG_SLOT_LEAD_MS).toISOString())\n      .order('go_at', { ascending: false })\n      .limit(1),")
    expect(ig).toContain("const page = await readIgPiecePage(slot.piece_id, 'instagram', now)")
  })
  it('draws the leading post first under its heading, numbered, and every other posted night once after it', () => {
    expect(page).toContain("const leadPost = unstable_cache(() => readIgLead(), ['ig-lead-post-v1'], { revalidate: 300, tags: [EVENT_DATA_CACHE_TAGS[0]] })")
    expect(page).toContain('items = all.filter((i) => !ledIds.has(i.card.id))')
    expect(page).toContain('<p className="mb-2 font-display text-sm font-bold text-ink-600">#{i + 1}</p>')
    expect(page.indexOf('data-ig-lead={lead.pieceId}')).toBeLessThan(page.indexOf('{items.length > 0 ? (\n            <>'))
  })
})
