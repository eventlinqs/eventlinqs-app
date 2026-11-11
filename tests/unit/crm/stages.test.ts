/**
 * LAWAL'S PIPELINE FROM THE DATABASE'S PROOF (the Growth OS directive, 11 November 2026, PM order 4 Part 2 item 1).
 * Every one of the 16 acquisition states has a stage; the ticketing stages come only from transaction facts; the side
 * stages hold only while nothing is proved past them; every stage has a next action.
 */
import { describe, expect, it } from 'vitest'
import { ACQUISITION_STATES } from '@/lib/outreach/acquisition-states'
import { CRM_LINE, CRM_SIDE, CRM_STAGE_WORDS, FROM_ACQUISITION, NEXT_ACTION, NO_TICKETING, crmStageOf, stageRank } from '@/lib/crm/stages'

describe("Lawal's stages", () => {
  it('are the thirteen the directive names, plus the removal request the database already proves', () => {
    expect([...CRM_LINE]).toEqual(['discovered', 'qualified', 'contact_ready', 'contacted', 'engaged', 'claimed', 'ticketing_activated', 'first_sale', 'recurring'])
    expect([...CRM_SIDE]).toEqual(['unresponsive', 'not_interested', 'disqualified', 'opted_out', 'removal_requested'])
  })

  it('every acquisition state has a stage, and every stage has words and a next action', () => {
    for (const s of ACQUISITION_STATES) expect(FROM_ACQUISITION[s], s).toBeDefined()
    for (const s of [...CRM_LINE, ...CRM_SIDE]) {
      expect(CRM_STAGE_WORDS[s], s).toBeTruthy()
      expect(NEXT_ACTION[s], s).toBeTruthy()
    }
  })

  it('maps the states the directive names by meaning', () => {
    expect(crmStageOf('ready')).toBe('contact_ready')
    expect(crmStageOf('eligibility_checked')).toBe('qualified')
    expect(crmStageOf('claim_invited')).toBe('engaged')
    expect(crmStageOf('verified')).toBe('claimed')
    expect(crmStageOf('suppressed')).toBe('opted_out')
    expect(crmStageOf('expired')).toBe('unresponsive')
    expect(crmStageOf('rejected')).toBe('not_interested')
    expect(crmStageOf('disputed')).toBe('removal_requested')
  })

  it("the database's 'recurring' (listed nights) is Claimed until paid sales prove Lawal's Recurring", () => {
    expect(crmStageOf('recurring')).toBe('claimed')
    expect(crmStageOf('recurring', { ticketingActivated: true, paidOrders: 3, paidMonths: 2 })).toBe('recurring')
  })

  it('moves past Claimed only on transaction facts, never on an acquisition state', () => {
    for (const s of ACQUISITION_STATES) expect(['ticketing_activated', 'first_sale', 'recurring']).not.toContain(crmStageOf(s, NO_TICKETING))
    expect(crmStageOf('verified', { ticketingActivated: true, paidOrders: 0, paidMonths: 0 })).toBe('ticketing_activated')
    expect(crmStageOf('active', { ticketingActivated: true, paidOrders: 1, paidMonths: 1 })).toBe('first_sale')
  })

  it('an organiser who opted out and then sells is a customer at First Sale (marketing stays stopped, a separate fact)', () => {
    expect(crmStageOf('suppressed', { ticketingActivated: true, paidOrders: 2, paidMonths: 1 })).toBe('first_sale')
  })

  it('orders the line first, then the side stages', () => {
    expect(stageRank('discovered')).toBeLessThan(stageRank('recurring'))
    expect(stageRank('recurring')).toBeLessThan(stageRank('unresponsive'))
  })

  it('no stage or action words carry a dash', () => {
    for (const w of [...Object.values(CRM_STAGE_WORDS), ...Object.values(NEXT_ACTION)]) expect(w).not.toMatch(/[\u2013\u2014]| - /)
  })
})
