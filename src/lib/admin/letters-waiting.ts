/**
 * ONE DEFINITION OF A FIRST LETTER WAITING FOR LAWAL'S YES (16 November 2026; the PM's 02:45 fix 1, its class: Today's
 * 'Waiting for you' left out the 3 letters that 'Waiting for approval' counted): message 1, unsent, held, and held by no
 * rule. A draft a rule holds breaks that rule and is an exception to fix (Today's 'Drafts held by a rule'), never an
 * approval. Automation's First letters card counts these and Today's queue lists them, by these four filters alone
 * (tests/unit/admin/needs-you.test.ts holds both to them).
 */
export const LETTER_WAITS = { step: 1, state: 'held', heldBecause: '{}' } as const
