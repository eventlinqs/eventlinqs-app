import { describe, expect, it } from 'vitest'
import { SKIP_REASON, SKIP_SENTENCE } from '@/lib/campaigner/pacing'
import { RENDER_FAILURE, RENDER_FAILURE_SENTENCE } from '@/lib/campaigner/render'
import { campaignSkipSentence, looksLikeACode } from '@/lib/campaigner/skip-sentence'

/**
 * EVERY REASON A PERSON WAS NOT SENT TO IS RENDERED IN WORDS.
 *
 * FOUND BY THE RED HALF OF A DRIVE, 19 September 2026. /admin/campaigns
 * resolved each skip line as `SKIP_SENTENCE[reason] ?? reason`, and
 * SKIP_SENTENCE holds the five PACING reasons only. A campaign that refused
 * seventy people over a missing unsubscribe link therefore printed
 *
 *     unsubscribe_link_missing                    70
 *
 * to a person, on a shipped admin surface, while the sentence for that code sat
 * unread in RENDER_FAILURE_SENTENCE.
 *
 * The test that matters is the SWEEP, not the spot check: it walks both code
 * tables, so a sixth pacing reason or a fifth render failure added tomorrow
 * fails here rather than being discovered on a screen.
 */
describe('campaignSkipSentence', () => {
  it.each(Object.values(SKIP_REASON))('renders the pacing reason %s in words', reason => {
    const sentence = campaignSkipSentence(reason)
    expect(sentence).toBe(SKIP_SENTENCE[reason])
    expect(looksLikeACode(sentence)).toBe(false)
  })

  it.each(Object.values(RENDER_FAILURE))('renders the render failure %s in words', reason => {
    const sentence = campaignSkipSentence(reason)
    expect(sentence).toBe(RENDER_FAILURE_SENTENCE[reason])
    expect(looksLikeACode(sentence)).toBe(false)
  })

  /*
   * THE SWEEP. Every code either table can hand this screen, judged by the one
   * property that matters: a person never reads a bare identifier.
   */
  it('leaves no code in either table rendering as itself', () => {
    const codes = [...Object.values(SKIP_REASON), ...Object.values(RENDER_FAILURE)]
    const bare = codes.filter(code => campaignSkipSentence(code) === code)
    expect(bare).toEqual([])
    expect(codes.length).toBeGreaterThanOrEqual(9)
  })

  it('passes a reason that is already a sentence through untouched', () => {
    // These are written at the call site in run.ts rather than looked up.
    for (const written of [
      'the consent door refused this message',
      'the step names a template that does not exist',
      'the audience row this admission points at no longer exists',
      'the campaign volume cap was reached',
    ]) {
      expect(campaignSkipSentence(written)).toBe(written)
    }
  })

  it('never prints an unknown CODE as though it were an explanation', () => {
    const rendered = campaignSkipSentence('some_future_reason')
    expect(rendered).not.toBe('some_future_reason')
    expect(rendered).toContain('some_future_reason')
    expect(rendered).toMatch(/no explanation written for it yet/)
  })

  it.each([
    ['unsubscribe_link_missing', true],
    ['already_sent_this_step', true],
    ['a', true],
    ['The event has already started, so nothing is queued for it.', false],
    ['the consent door refused this message', false],
    ['Mixed_Case_Code', false],
    ['', false],
  ])('tells a code from a sentence: %s', (value, isCode) => {
    expect(looksLikeACode(value)).toBe(isCode)
  })
})
