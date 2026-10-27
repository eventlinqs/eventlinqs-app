import { describe, expect, it } from 'vitest'
import { CITY_HUBS, cityHubRails } from '@/lib/cities/city-hubs'

/* The locked plan of 27 October 2026, item 10: each city's hubs, and no empty rail. */

const ev = (id: string, over: Record<string, unknown> = {}) => ({ id, is_free: false, entry_mode: 'tickets', category: null as { slug: string } | null, ...over })

describe('cityHubRails', () => {
  it('draws free, music, family and nightlife from the events the city page already reads', () => {
    const rails = cityHubRails([
      ev('a', { is_free: true }),
      ev('b', { entry_mode: 'walk_in' }),
      ev('c', { category: { slug: 'music' } }),
      ev('d', { category: { slug: 'family' } }),
      ev('e', { category: { slug: 'nightlife' } }),
      ev('f', { category: { slug: 'comedy' } }),
    ])
    expect(rails.map((r) => [r.hub.key, r.events.map((e) => e.id)])).toEqual([
      ['free', ['a', 'b']],
      ['music', ['c']],
      ['family', ['d']],
      ['nightlife', ['e']],
    ])
  })

  it('draws no empty rail', () => {
    expect(cityHubRails([ev('f', { category: { slug: 'comedy' } })])).toEqual([])
  })

  it('holds each rail to its cap', () => {
    const many = Array.from({ length: 20 }, (_, i) => ev(String(i), { is_free: true }))
    expect(cityHubRails(many)[0].events).toHaveLength(12)
  })

  it("opens the directory on each hub's own filter, words in Australian English", () => {
    expect(CITY_HUBS.map((h) => [h.title('Geelong'), h.href('geelong')])).toEqual([
      ['Free in Geelong', '/events?city=geelong&date=free'],
      ['Live music in Geelong', '/events?city=geelong&category=music'],
      ['Family days out in Geelong', '/events?city=geelong&category=family'],
      ['Nightlife in Geelong', '/events?city=geelong&category=nightlife'],
    ])
  })
})
