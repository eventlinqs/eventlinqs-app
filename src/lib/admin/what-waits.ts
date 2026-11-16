/**
 * ONE DEFINITION OF A FIRST LETTER WAITING FOR LAWAL'S YES (16 November 2026; the PM's 02:45 fix 1, its class: Today's
 * 'Waiting for you' left out the 3 letters that 'Waiting for approval' counted): message 1, unsent, held, and held by no
 * rule. A draft a rule holds breaks that rule and is an exception to fix (Today's 'Drafts held by a rule'), never an
 * approval. Automation's First letters card counts these and Today's queue lists them, by these four filters alone
 * (tests/unit/admin/needs-you.test.ts holds both to them).
 */
export const LETTER_WAITS = { step: 1, state: 'held', heldBecause: '{}' } as const

/**
 * AN ORGANISER PHOTO WAITING TO BE LOOKED AT (the PM's 05:37 fix 2: one unit on Today and Automation): a photograph its
 * organiser gave with permission, held until a person looks at it once (law 5). Automation's Photo permission card
 * counts these and Today's queue lists them. Only one still pending its look and not withdrawn waits: on 16 November 2026
 * production counted 21 to look at while 14 of them were approved already.
 */
export const PHOTO_WAITS = { assetState: 'organiser_authorised', approvalStatus: 'pending', withdrawalStatus: 'current' } as const
