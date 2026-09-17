import { describe, expect, it } from 'vitest'
import {
  judgeVerificationTagPlacement,
} from '../../../scripts/verify/lib/verification-tag-placement.mjs'

/*
 * WHY THIS RULING EXISTS AT ALL, in one paragraph, because the tests below only
 * make sense against it. SEO2's acceptance says adding the Search Console
 * verification tag changes nothing a visitor sees. Two attempts to prove that
 * with photographs were thrown away: a cross-run comparison that failed one run
 * in four on unchanged code, and a same-load comparison that a drill proved
 * could not fail under any input, because the browser hides every child of
 * `<head>`. What is left is the only falsifiable part: the tag must BE a meta
 * element, must be inside `<head>`, and must not appear after `</head>` where
 * its content could be rendered as text.
 *
 * The red cases below are the drill. Each one is a document this platform could
 * plausibly emit if the tag were wired in wrongly, and each must be refused.
 */

const page = (head: string, body = '<h1>Events</h1>') =>
  `<!DOCTYPE html><html lang="en-AU"><head><title>EventLinqs</title>${head}</head><body>${body}</body></html>`

const TAG = '<meta name="google-site-verification" content="laneC0000drill"/>'

describe('the verification tag is placed where it cannot paint', () => {
  it('accepts exactly one meta element inside head', () => {
    expect(judgeVerificationTagPlacement(page(TAG))).toEqual({ ok: true, reason: null })
  })

  it('accepts it regardless of attribute order or quoting', () => {
    const reordered = "<meta content='abc' name='google-site-verification'>"
    expect(judgeVerificationTagPlacement(page(reordered)).ok).toBe(true)
  })

  it('REFUSES a document with no head at all', () => {
    const ruling = judgeVerificationTagPlacement(`<html><body>${TAG}</body></html>`)
    expect(ruling.ok).toBe(false)
    expect(ruling.reason).toContain('no <head>')
  })

  it('REFUSES a tag that is absent from head', () => {
    const ruling = judgeVerificationTagPlacement(page(''))
    expect(ruling.ok).toBe(false)
    expect(ruling.reason).toContain('0 time(s)')
  })

  it('REFUSES two tags in head, because Search Console reads one', () => {
    const ruling = judgeVerificationTagPlacement(page(`${TAG}${TAG}`))
    expect(ruling.ok).toBe(false)
    expect(ruling.reason).toContain('2 time(s)')
  })

  /*
   * THE ONE THAT MATTERS MOST. A meta element in the BODY is parsed, and its
   * position means its content can end up rendered. This is the single way this
   * platform could make the verification tag visible to a reader, so it is the
   * case the whole ruling exists for.
   */
  it('REFUSES a tag that appears after </head>', () => {
    const ruling = judgeVerificationTagPlacement(page(TAG, `<h1>Events</h1>${TAG}`))
    expect(ruling.ok).toBe(false)
    expect(ruling.reason).toContain('AFTER </head>')
  })

  it('REFUSES a tag in the body even when head has none', () => {
    const ruling = judgeVerificationTagPlacement(page('', `<h1>Events</h1>${TAG}`))
    expect(ruling.ok).toBe(false)
  })

  it('is not fooled by a null or empty response', () => {
    expect(judgeVerificationTagPlacement('').ok).toBe(false)
    // @ts-expect-error the drive hands it whatever a fetch returned
    expect(judgeVerificationTagPlacement(undefined).ok).toBe(false)
  })
})
