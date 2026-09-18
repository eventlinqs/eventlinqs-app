/**
 * MONEY FIX, PART B, acceptance line 4. The communication tests, by the names
 * the close-out item gives them.
 *
 * The item names nine tests. The six that judge the DECLARATION live here,
 * because the matrix is a pure function of its own content and can be asserted
 * exhaustively without a database, a clock or a mailbox. The three that judge a
 * SEND live beside the sender they exercise.
 */
import { describe, it, expect } from 'vitest'
import {
  MESSAGE_TYPES,
  RECIPIENT_ROLES,
  UndeclaredMessageTypeError,
  UndeclaredRecipientRoleError,
  assertRecipientDeclared,
  declaredMessageTypes,
  isDeclaredMessageType,
  messageTypeDeclaration,
  resolveRecipientRoles,
  typesWhereOwnerDisplacesOrganiser,
  typesWithNoRecipients,
} from '@/lib/notifications/recipient-matrix'

describe('the recipient matrix (MONEY FIX B3)', () => {
  it('every_message_type_appears_in_the_recipient_matrix', () => {
    // Every declared type resolves, carries at least one role, and every role
    // it names is a real role. A typo in a role would otherwise sit in the
    // matrix looking authoritative and matching nobody.
    expect(MESSAGE_TYPES.length).toBeGreaterThan(0)

    for (const entry of MESSAGE_TYPES) {
      expect(isDeclaredMessageType(entry.type)).toBe(true)
      expect(resolveRecipientRoles(entry.type)).toEqual(entry.roles)
      expect(entry.roles.length).toBeGreaterThan(0)
      for (const role of entry.roles) {
        expect(RECIPIENT_ROLES).toContain(role)
      }
      // A register entry with no description is a row nobody can review.
      expect(entry.what.trim().length).toBeGreaterThan(0)
    }

    expect(typesWithNoRecipients()).toEqual([])
  })

  it('declares each type exactly once, so two rows cannot disagree', () => {
    const seen = declaredMessageTypes()
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('sending_a_type_absent_from_the_matrix_raises_a_named_error', () => {
    // The whole point of B3: an unknown type must not default to anyone.
    expect(() => resolveRecipientRoles('a_type_nobody_declared')).toThrow(
      UndeclaredMessageTypeError,
    )
    expect(() => messageTypeDeclaration('a_type_nobody_declared')).toThrow(
      UndeclaredMessageTypeError,
    )
    expect(() => assertRecipientDeclared('a_type_nobody_declared', 'buyer')).toThrow(
      UndeclaredMessageTypeError,
    )

    try {
      resolveRecipientRoles('a_type_nobody_declared')
      throw new Error('expected the matrix to refuse an undeclared type')
    } catch (err) {
      expect(err).toBeInstanceOf(UndeclaredMessageTypeError)
      const typed = err as UndeclaredMessageTypeError
      expect(typed.name).toBe('UndeclaredMessageTypeError')
      // Named means the type is on the error, not just in prose.
      expect(typed.messageType).toBe('a_type_nobody_declared')
      expect(typed.message).toContain('recipient matrix')
    }
  })

  it('refuses a declared type aimed at a role it does not declare', () => {
    // order_confirmation_and_ticket is the buyer's. Aiming it at the platform
    // owner is a send-site mistake and must not silently succeed.
    expect(() =>
      assertRecipientDeclared('order_confirmation_and_ticket', 'platform_owner'),
    ).toThrow(UndeclaredRecipientRoleError)
    expect(() => assertRecipientDeclared('order_confirmation_and_ticket', 'buyer')).not.toThrow()
  })

  it('owner_never_receives_an_organiser_payout_as_sole_recipient', () => {
    // Clause 2 of guard:every-message-has-a-declared-recipient, asserted here
    // as well as in the guard so a matrix edit fails the suite too.
    expect(typesWhereOwnerDisplacesOrganiser()).toEqual([])

    // And stated concretely for the four payout types, which are the ones the
    // item names: the organiser receives them and the owner is not on them.
    for (const type of [
      'payout_initiated',
      'payout_paid',
      'payout_failed',
      'payout_reserve_released',
    ]) {
      const roles = resolveRecipientRoles(type)
      expect(roles).toContain('organiser')
      expect(roles).not.toContain('platform_owner')
    }
  })

  it('organiser_receives_payout_initiated_paid_and_failed', () => {
    for (const type of ['payout_initiated', 'payout_paid', 'payout_failed']) {
      expect(isDeclaredMessageType(type)).toBe(true)
      expect(resolveRecipientRoles(type)).toContain('organiser')
    }
  })

  it('organiser_receives_every_refund', () => {
    // A refund on their event reaches them whether it was requested or settled.
    expect(resolveRecipientRoles('organiser_refund_requested')).toContain('organiser')
    expect(resolveRecipientRoles('refund_completed')).toContain('organiser')
    // And the failure case: a refund that did not settle leaves the buyer owed
    // money on the organiser's event, so the organiser is told, not only us.
    expect(resolveRecipientRoles('refund_did_not_complete')).toContain('organiser')
  })

  it('organiser_receives_dispute_immediately', () => {
    const roles = resolveRecipientRoles('organiser_dispute_opened')
    expect(roles).toContain('organiser')
    // A chargeback is platform liability too, so the owner is a co-recipient.
    // Clause 2 is about the owner REPLACING the organiser, never about the
    // owner also knowing.
    expect(roles).toContain('platform_owner')
  })

  it('buyer_receives_order_confirmation_and_ticket', () => {
    expect(resolveRecipientRoles('order_confirmation_and_ticket')).toEqual(['buyer'])
  })

  it('the owner business feed names a real organiser message for every event fact', () => {
    // platform_order_paid is the exact message that had the owner as its only
    // reader while MKLStudios heard nothing. It is now required to name the
    // organiser message that carries the same fact, and that message must
    // itself be declared and actually reach the organiser.
    const ownerFeed = messageTypeDeclaration('platform_order_paid')
    expect(ownerFeed.concernsOrganiserEvent).toBe(true)
    expect(ownerFeed.organiserToldBy).toBeTruthy()
    expect(resolveRecipientRoles(ownerFeed.organiserToldBy!)).toContain('organiser')
  })
})
