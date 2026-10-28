import { PERMISSION_WORDS } from './submission'
import type { ClaimTarget } from './claim'

/**
 * THE CLAIM AS ACCEPTANCE (the engine plan of 28 October 2026, part D: "the CLAIM writes the permission"). The claim
 * page asks, beside the code, the two ticks of the project manager's claim page words (C:\dev\START-16OCT\
 * EVENTLINQS-ORGANISER-MESSAGES-28OCT.md, section 6): Lawal's one permission line, and that the claimant can give it.
 * The database writes the yes into organiser_permissions in the same transaction as the move, only when the code is
 * right (listing_claim_check, 20261028220201_claim_acceptance.sql). Unticked, the listing is still claimed and carries
 * no yes: a factual listing never waits for a permission (the checklist's section K, core rule).
 *
 * The words kept are always the constant, never the form's text, so a row says exactly what its sender agreed to.
 * The line says "now and for future events", so the yes covers the organiser's nights to come with no re-ask.
 */

/** Tick 2, the claim page's words for a venue, and the same sentence for one event. */
export function claimAuthorityWords(kind: ClaimTarget['kind']): string {
  return kind === 'venue'
    ? 'I run this venue or act for it, and I can give this permission.'
    : 'I run this event or act for it, and I can give this permission.'
}

export type ClaimYes = { readonly words: string; readonly scope: 'current_and_future'; readonly at: Date }
export type ClaimYesAnswer = { readonly state: 'none' } | ({ readonly state: 'given' } & ClaimYes) | { readonly state: 'refused'; readonly reason: string }

export function claimYes(form: { ticked: boolean; authority: boolean }, at: Date): ClaimYesAnswer {
  if (!form.ticked) return { state: 'none' }
  if (!form.authority) return { state: 'refused', reason: 'Confirm you can give this permission, or untick it and claim the listing without it.' }
  return { state: 'given', words: PERMISSION_WORDS, scope: 'current_and_future', at }
}
