import { describe, it, expect } from 'vitest'
import { summariseVerification, actionsForStatus } from '@/lib/admin/organisers'
import type Stripe from 'stripe'

function account(partial: Partial<Stripe.Account>): Stripe.Account {
  return partial as Stripe.Account
}

describe('summariseVerification', () => {
  it('no account -> not onboarded, nothing due', () => {
    const v = summariseVerification(null)
    expect(v).toMatchObject({ hasAccount: false, onboarded: false, requirementsDue: [], disabledReason: null, lookupError: false })
  })

  it('carries the lookupError flag', () => {
    expect(summariseVerification(null, true).lookupError).toBe(true)
  })

  it('fully enabled account -> onboarded, no requirements', () => {
    const v = summariseVerification(account({
      charges_enabled: true, payouts_enabled: true, details_submitted: true,
      requirements: { currently_due: [], disabled_reason: null } as never,
    }))
    expect(v).toMatchObject({ hasAccount: true, onboarded: true, chargesEnabled: true, payoutsEnabled: true, requirementsDue: [], disabledReason: null })
  })

  it('partial account -> not onboarded, surfaces requirements + disabled reason', () => {
    const v = summariseVerification(account({
      charges_enabled: true, payouts_enabled: false, details_submitted: false,
      requirements: { currently_due: ['external_account', 'individual.id_number'], disabled_reason: 'requirements.past_due' } as never,
    }))
    expect(v.onboarded).toBe(false)
    expect(v.payoutsEnabled).toBe(false)
    expect(v.requirementsDue).toEqual(['external_account', 'individual.id_number'])
    expect(v.disabledReason).toBe('requirements.past_due')
  })
})

describe('actionsForStatus', () => {
  it('pending -> approve, reject', () => {
    expect(actionsForStatus('pending').sort()).toEqual(['approve', 'reject'])
  })
  it('active -> suspend', () => {
    expect(actionsForStatus('active')).toEqual(['suspend'])
  })
  it('suspended -> reinstate', () => {
    expect(actionsForStatus('suspended')).toEqual(['reinstate'])
  })
  it('deactivated -> reinstate', () => {
    expect(actionsForStatus('deactivated')).toEqual(['reinstate'])
  })
})
