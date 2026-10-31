import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { assetStateWords, IMAGE_REPLACED_WORDS, IMAGE_WITHDRAWN_WORDS, YES_WITHDRAWN_WORDS } from '@/lib/listings/media-words'

/*
 * THE ORGANISER'S PAGE SAYS WHAT HAPPENED, AFTER IT REFRESHES (the claim drive on TEST, drive-4, 29 October 2026).
 * Withdrawing an image refreshes /dashboard/organisation/media (its lists must move), and the refreshed page draws a
 * withdrawn image without its forms, so the form's own "Withdrawn. It comes out of every post not yet published within
 * the hour." went with it: the organiser saw a bare "Withdrawn" and never the promise. The page now says each outcome
 * from the record, in the same words the forms use, so the promise stands after the refresh.
 */

describe('the outcome words', () => {
  it('an image withdrawn, replaced, or current says what is true of it', () => {
    expect(assetStateWords({ withdrawal_status: 'withdrawn', approval_status: 'approved' })).toBe(IMAGE_WITHDRAWN_WORDS)
    expect(IMAGE_WITHDRAWN_WORDS).toBe('Withdrawn. It comes out of every post not yet published within the hour.')
    expect(assetStateWords({ withdrawal_status: 'replaced', approval_status: 'approved' })).toBe(IMAGE_REPLACED_WORDS)
    expect(assetStateWords({ withdrawal_status: 'current', approval_status: 'pending' })).toBe('Waiting for our team to check it')
    expect(assetStateWords({ withdrawal_status: 'current', approval_status: 'approved' })).toBe('In use')
  })
})

describe('the page and the forms use the one set of words', () => {
  it('the media page draws the image state and a withdrawn yes from them', () => {
    const page = readFileSync('src/app/(dashboard)/dashboard/organisation/media/page.tsx', 'utf8')
    expect(page).toMatch(/assetStateWords\(a\)/)
    expect(page).toMatch(/YES_WITHDRAWN_WORDS/)
    expect(page).not.toMatch(/'Replaced' : 'Withdrawn'/)
  })

  it('the forms confirm in the same words', () => {
    const forms = readFileSync('src/components/listings/organiser-media-forms.tsx', 'utf8')
    // Each kind's done words, held by the section (src/components/ui/section-answers.tsx) since 31 October 2026.
    expect(forms).toMatch(/done: IMAGE_WITHDRAWN_WORDS/)
    expect(forms).toMatch(/done: IMAGE_REPLACED_WORDS/)
    expect(forms).toMatch(/done: YES_WITHDRAWN_WORDS/)
    expect(YES_WITHDRAWN_WORDS).toBe('Withdrawn. Every image under it comes out of every post not yet published within the hour. Your listings stay up.')
  })
})
