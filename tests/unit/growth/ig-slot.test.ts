import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { IG_SLOT_LEAD_MS, igPicks, type IgNight, type IgPost } from '@/lib/growth/ig-math'

/*
 * CAR T, T1 (the PM's 02:05 of 28 November 2026). Red on main, where plain /ig, the Instagram bio link, listed a post's
 * nights only once its posting was read back after publication, behind a five minute cache, so the moment the weekend
 * piece went at 9am the bio link would send people to a page without its events. Now an approved Instagram slot's nights
 * are listed from five minutes before its time (the cache window); a slot further out is not; a post needs its address.
 */
const read = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
const NOW = new Date('2026-11-27T21:58:00Z') // 8.58am in Melbourne, Saturday
const night: IgNight = { id: 'n1', start_date: '2026-11-28T08:30:00Z', end_date: '2026-11-28T11:00:00Z', timezone: 'Australia/Melbourne', listing: 'michael charles|birds basement' }
const nights = new Map([[night.id, night]])
const slot = (at: Date): IgPost => ({ postId: 'c6bdc9da', postUrl: '', postedAt: at.toISOString(), eventIds: ['n1'], slotted: true })

describe("the bio link lists an approved slot's nights the moment the post goes", () => {
  it('a slot within the lead is listed, credited to its piece', () => {
    expect(IG_SLOT_LEAD_MS).toBe(5 * 60 * 1000)
    expect(igPicks([slot(new Date('2026-11-27T22:00:00Z'))], nights, NOW).map((p) => [p.eventId, p.postId])).toEqual([['n1', 'c6bdc9da']])
  })
  it('a slot further out than the lead is not listed yet', () => {
    expect(igPicks([slot(new Date('2026-11-27T22:10:00Z'))], nights, NOW)).toEqual([])
  })
  it('a post that is not a slot still needs its Instagram address, and is never listed ahead of its time', () => {
    expect(igPicks([{ postId: 'p', postUrl: '', postedAt: '2026-11-27T21:00:00Z', eventIds: ['n1'] }], nights, NOW)).toEqual([])
    expect(igPicks([{ postId: 'p', postUrl: 'https://www.instagram.com/p/x/', postedAt: '2026-11-27T22:00:00Z', eventIds: ['n1'] }], nights, NOW)).toEqual([])
  })
  it('reads the approved slots, scheduled or gone, never a held one, with .lt on go_at (it fires nothing)', () => {
    const ig = read('src/lib/growth/ig.ts')
    expect(ig).toContain(".from('social_piece_schedules')")
    expect(ig).toContain(".in('state', ['scheduled', 'published'])")
    expect(ig).toContain(".lt('go_at', new Date(now.getTime() + IG_SLOT_LEAD_MS).toISOString())")
  })
})
