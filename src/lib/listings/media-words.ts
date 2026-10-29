/**
 * WHAT HAPPENED TO AN ORGANISER'S IMAGE OR PERMISSION, in one set of words for /dashboard/organisation/media and the
 * forms on it. Each press refreshes the page so its lists move, and the refreshed page draws a withdrawn image or
 * permission without its form, so the page itself says the outcome from the record in these words, and the promise
 * stands after the refresh (the claim drive on TEST, 29 October 2026).
 */

export const IMAGE_WITHDRAWN_WORDS = 'Withdrawn. It comes out of every post not yet published within the hour.'
export const IMAGE_REPLACED_WORDS = 'Replaced. The new image is checked before it is used.'
export const YES_WITHDRAWN_WORDS =
  'Withdrawn. Every image under it comes out of every post not yet published within the hour. Your listings stay up.'

const APPROVAL_WORDS: Record<string, string> = { pending: 'Waiting for our team to check it', approved: 'In use', refused: 'Not used' }

/** One image's state as the organiser reads it. */
export function assetStateWords(a: { withdrawal_status: string; approval_status: string }): string {
  if (a.withdrawal_status === 'withdrawn') return IMAGE_WITHDRAWN_WORDS
  if (a.withdrawal_status === 'replaced') return IMAGE_REPLACED_WORDS
  return APPROVAL_WORDS[a.approval_status] ?? a.approval_status
}
