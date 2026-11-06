import { describe, expect, it } from 'vitest'
import { sourcesToSwitchOff } from '@/lib/listings/verifier-verdict'

/*
 * LAW 19 SECTION 4.3 AND 7.2: 'that source's publication flag switches off', automatically, by a failed check. The rule
 * the verifier's --enforce applies (scripts/verify/engine-verifier.mts), as one pure function so it is tested and so a
 * planted failure on TEST runs the same rule production runs.
 */
const sources = [
  { id: 'forum-whats-on', page_url: 'https://forummelbourne.com.au/law19-demonstration-test-only/whats-on/', collection: 'read' },
  { id: 'forum-sitemap', page_url: 'https://www.forummelbourne.com.au/sitemap.xml', collection: 'read' },
  { id: 'forum-asked', page_url: 'https://forummelbourne.com.au/other/', collection: 'ask' },
  { id: 'palais', page_url: 'https://palaistheatre.com.au/whats-on', collection: 'read' },
  { id: 'broken', page_url: 'not a url', collection: 'read' },
]
const failed = { verdict: 'FAIL', why: 'the source states another time', sourceUrl: 'https://forummelbourne.com.au/shows/the-planted-quartet/' }

describe('sourcesToSwitchOff', () => {
  it("switches off every 'read' source of the failing night's host, www or not, and no other", () => {
    expect(sourcesToSwitchOff([failed], sources)).toEqual(['forum-whats-on', 'forum-sitemap'])
  })

  it('switches nothing off for a night that fails only on the live page, or is unverifiable, or passes', () => {
    const results = [
      { verdict: 'FAIL', why: 'the live page disagrees with the stored row', sourceUrl: failed.sourceUrl },
      { verdict: 'UNVERIFIABLE', why: 'the page does not state this night', sourceUrl: failed.sourceUrl },
      { verdict: 'PASS', why: 'source, stored and live agree', sourceUrl: failed.sourceUrl },
      { verdict: 'FAIL', why: 'the source states another time', sourceUrl: '' },
    ]
    expect(sourcesToSwitchOff(results, sources)).toEqual([])
  })
})
