import { describe, expect, it } from 'vitest'
import { rankPhotos, showsTheEvent, type PhotoAsset } from '@/lib/social/lifecycle'
import { scopeFromGrantWords, scopeToRecord } from '@/lib/social/grant-scope'

/*
 * THE PHOTO CHOICE (the PM's 11:05 of 22 November 2026; Lawal, 10:52: "I don't like your photo selection ... use those
 * better ones"). AMCF's own set, as the PM looked at it: bb4fd8a5 (three women dancing, a close crop with a camera rig
 * behind them), 5cbb0e5e (AMCF-2024-WebRes-0980: the full Fed Square crowd under the city skyline, the stalls and the
 * green, 2100 x 1400) and afb0ea48 (AMCF-2024-WebRes-0245: the main stage at dusk, the band playing, AMCF's name and logo
 * on the Fed Square screen, the crowd on the grass). bb4fd8a5 led by rank and carried the final day feed. Red on main:
 * rank alone put bb4fd8a5 first.
 */
const asset = (assetId: string, leadRank: number, shows: string[]): PhotoAsset => ({ assetId, url: `https://x/${assetId}.jpg`, type: 'photo', leadRank, width: 2100, height: 1400, shows })
const AMCF = [
  asset('bb4fd8a5', 1, ['performers', 'close']),
  asset('5cbb0e5e', 2, ['crowd', 'setting']),
  asset('afb0ea48', 3, ['stage', 'name', 'crowd', 'setting']),
]

describe('a photograph is chosen by how strongly it shows the event', () => {
  it("AMCF's feed takes the Fed Square crowd or the stage, never the close crop of three dancers", () => {
    const first = rankPhotos(AMCF, 'feed', new Set())[0]
    expect(['5cbb0e5e', 'afb0ea48']).toContain(first.assetId)
    expect(first.assetId).not.toBe('bb4fd8a5')
  })

  it("each post of a run takes a different photograph: the story after the feed takes the other of the two", () => {
    const feed = rankPhotos(AMCF, 'feed', new Set())[0]
    const story = rankPhotos(AMCF, 'story', new Set([feed.url]))[0]
    expect(story.assetId).not.toBe(feed.assetId)
    expect(['5cbb0e5e', 'afb0ea48']).toContain(story.assetId)
  })

  it('the close crop is the fallback, used only when nothing better exists', () => {
    const feed = rankPhotos(AMCF, 'feed', new Set(['https://x/5cbb0e5e.jpg', 'https://x/afb0ea48.jpg']))[0]
    expect(feed.assetId).toBe('bb4fd8a5')
  })

  it('a set no one has described ranks by lead rank, as before', () => {
    const plain = [asset('a', 2, []), asset('b', 1, [])]
    expect(rankPhotos(plain, 'feed', new Set())[0].assetId).toBe('b')
    expect(showsTheEvent(undefined)).toBe(0)
    expect(showsTheEvent(['stage', 'name', 'crowd', 'setting'])).toBe(4)
    expect(showsTheEvent(['performers', 'close'])).toBe(-2)
  })
})

describe("an emailed grant's own words set its scope", () => {
  const FRED = 'photographs from previous festivals that you are welcome to use to promote AMCF'

  it("Fred Alale AM's grant of 14 October 2026 permits promotion: recorded for social as well as site", () => {
    expect(scopeFromGrantWords(FRED)).toBe('both')
    expect(scopeToRecord('site', FRED)).toBe('both')
  })

  it('a grant that keeps photographs to the website, or names no promotion, stays as chosen', () => {
    expect(scopeToRecord('site', 'You may use these on your website only, not on social media.')).toBe('site')
    expect(scopeToRecord('site', 'Photos from our Night Market for the listing.')).toBe('site')
    expect(scopeToRecord('social', FRED)).toBe('social')
    expect(scopeToRecord('site', null)).toBe('site')
  })
})
