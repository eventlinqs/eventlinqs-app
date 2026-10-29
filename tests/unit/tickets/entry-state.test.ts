import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { admitsEntry, notValidSentence } from '@/lib/tickets/entry-state'

/*
 * ONE ANSWER TO "DOES THIS TICKET GET ITS HOLDER IN" (window 2, 30 October 2026).
 *
 * Found on TEST by the E3 journey (C:\dev\EVIDENCE\E3-30OCT\run-1\06-buyer-refunded-ticket.png):
 * the page for a REFUNDED ticket said "not valid for entry" and, under it, "Bring someone with
 * you ... You will both be there" with a share bar whose message reads "I have my ticket to ...".
 * Reading the page for the cause found the same class twice more: its only not-valid branch was
 * `status === 'void' || status === 'refunded'`, so a void ticket was told it had been REFUNDED,
 * and a TRANSFERRED ticket still drew a scannable QR and "Show this QR code at entry" although
 * scan_ticket refuses it ('transferred'). The email and the confirmation page each kept their own
 * copy of the rule (valid and scanned admit), the ticket page a third that disagreed.
 *
 * The five statuses are the tickets table's own check (20260517000001: 'valid','scanned',
 * 'refunded','void','transferred'); the sentences are the confirmation email's, unchanged.
 */
const STATUSES = ['valid', 'scanned', 'refunded', 'void', 'transferred'] as const

describe('which ticket admits entry', () => {
  it('admits a valid or scanned ticket and nothing else', () => {
    expect(STATUSES.filter(admitsEntry)).toEqual(['valid', 'scanned'])
    expect(admitsEntry('anything else')).toBe(false)
  })

  it('says why a ticket does not admit, in the words the email already uses', () => {
    expect(notValidSentence('valid')).toBeNull()
    expect(notValidSentence('scanned')).toBeNull()
    expect(notValidSentence('refunded')).toBe('This ticket was refunded and is no longer valid.')
    expect(notValidSentence('void')).toBe('This ticket was cancelled and is no longer valid.')
    expect(notValidSentence('transferred')).toBe('This ticket was transferred and is no longer valid.')
    expect(notValidSentence('unknown')).toBe('This ticket is no longer valid.')
  })
})

const read = (p: string) => readFileSync(p, 'utf8')
const PAGE = read('src/app/t/[code]/page.tsx')

describe('the ticket page asks the one rule', () => {
  it('draws the QR, the entry line and the share invitation only for a ticket that admits', () => {
    expect(PAGE).toMatch(/import \{[^}]*admitsEntry[^}]*\} from '@\/lib\/tickets\/entry-state'/)
    expect(PAGE).toMatch(/const admits = admitsEntry\(ticket\.status\)/)
    // the old two-status test, which let a transferred ticket keep its QR, is gone
    expect(PAGE).not.toMatch(/isVoided/)
    expect(PAGE).not.toMatch(/status === 'void' \|\| ticket\.status === 'refunded'/)
    // the share section sits behind the same answer
    expect(PAGE).toMatch(/\{admits && ticket\.event && \(\s*<section/)
    // a void or transferred ticket is never told it was refunded
    expect(PAGE).not.toContain('This ticket has been refunded and is not valid for entry.')
    expect(PAGE).toMatch(/notValidSentence\(ticket\.status\)/)
  })

  it('leaves no second copy of the rule in the email or the confirmation page', () => {
    for (const f of ['src/lib/email/order-confirmation.ts', 'src/app/orders/[order_id]/confirmation/page.tsx']) {
      const src = read(f)
      expect(src, f).not.toMatch(/new Set\(\['valid', 'scanned'\]\)/)
      expect(src, f).toMatch(/from '@\/lib\/tickets\/entry-state'/)
    }
  })
})
