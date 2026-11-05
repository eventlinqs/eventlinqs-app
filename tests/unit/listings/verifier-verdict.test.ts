import { describe, expect, it } from 'vitest'
import { NO_ANSWER, verifierVerdict } from '@/lib/listings/verifier-verdict'

/*
 * THE ENGINE VERIFIER'S VERDICT, ONE RULE (the CONTROLLER's 16:20 of 5 November 2026: NOT JUDGED is resolved, or marked
 * unverifiable with its reason). The deployed run on e46851bf (6 November 01:39) left Boost Mobile AUSX Open Geelong NOT
 * JUDGED with 'the page answered nothing': the source gave no answer to GitHub's runner. A page that cannot be read this
 * run is unverifiable this run, named, listed for the next; a page that answers with an error code is a fact for a
 * person (a moved or removed page), so it stays NOT JUDGED.
 */
describe('verifierVerdict', () => {
  it('passes only when the source agrees and the live page agrees', () => {
    expect(verifierVerdict({ sourceOk: true, liveOk: true, source: 'Sat, 7 Nov, 1:00 pm' })).toBe('PASS')
  })
  it('fails when the source states another time, or the live page disagrees with the row', () => {
    expect(verifierVerdict({ sourceOk: false, liveOk: true, source: 'states Sat, 7 Nov, 2:00 pm' })).toBe('FAIL')
    expect(verifierVerdict({ sourceOk: true, liveOk: false, source: 'Sat, 7 Nov, 1:00 pm' })).toBe('FAIL')
  })
  it('names a page that gave no answer as unverifiable this run', () => {
    expect(NO_ANSWER).toBe('the page answered nothing')
    expect(verifierVerdict({ sourceOk: null, liveOk: true, source: NO_ANSWER })).toBe('UNVERIFIABLE')
  })
  it('keeps an error code for a person: the page may have moved or gone', () => {
    expect(verifierVerdict({ sourceOk: null, liveOk: true, source: 'the page answered 404' })).toBe('NOT JUDGED')
  })
  it('keeps every reason already named unverifiable', () => {
    for (const source of ['no source page on record', 'robots.txt disallows a re-read', 'the page does not state this night', 'the page states a date with no time', 'the page states the date in words but not this time', 'the source is a PDF, which the verifier does not read', 'the page states this weekly session, but no term it states covers this night']) {
      expect(verifierVerdict({ sourceOk: null, liveOk: true, source }), source).toBe('UNVERIFIABLE')
    }
  })
})
