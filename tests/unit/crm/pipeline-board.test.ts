import { describe, expect, test } from 'vitest'
import { pipelineBoard, ticketingFromOrders } from '@/lib/crm/pipeline-board'
import { CRM_LINE, CRM_SIDE, NEXT_ACTION } from '@/lib/crm/stages'

/*
 * THE PIPELINE BOARD (the CRM standard of 19 November 2026, section 2 item 3; the PM's 22:14 item 2): every one of
 * Lawal's stages a column in his order, then the side stages; each organiser on the stage its proof gives it, with that
 * stage's next action; a first sale moves a card on, never a hand.
 */
const rows = [
  { id: 'o1', name: 'Murphy\'s Geelong', acquisitionState: 'contacted' },
  { id: 'o2', name: 'Asia Oasis', acquisitionState: 'contacted' },
  { id: 'o3', name: 'Comedy Republic', acquisitionState: 'engaged' },
  { id: 'o4', name: 'The Quakers', acquisitionState: 'verified' },
  { id: 'o5', name: 'Bendigo Library', acquisitionState: 'suppressed' },
  { id: 'o6', name: 'A typo', acquisitionState: 'not-a-state' },
]

describe('the board', () => {
  test("one column per stage, Lawal's line first in his order, then the side stages", () => {
    const b = pipelineBoard(rows)
    expect(b.columns.map((c) => c.stage)).toEqual([...CRM_LINE, ...CRM_SIDE])
    expect(b.columns.filter((c) => c.side).map((c) => c.stage)).toEqual([...CRM_SIDE])
  })

  test('each card on the stage its state gives it, sorted by name, with its next action', () => {
    const b = pipelineBoard(rows)
    const col = (s: string) => b.columns.find((c) => c.stage === s)!
    expect(col('contacted').cards.map((c) => c.name)).toEqual(['Asia Oasis', 'Murphy\'s Geelong'])
    expect(col('engaged').cards[0].nextAction).toBe(NEXT_ACTION.engaged)
    expect(col('claimed').cards.map((c) => c.id)).toEqual(['o4'])
    expect(col('opted_out').cards.map((c) => c.id)).toEqual(['o5'])
    expect(col('claimed').cards[0].stateWords).toBe('Claimed and verified')
  })

  test('a state the board does not know is counted, never placed', () => {
    const b = pipelineBoard(rows)
    expect(b.unread).toBe(1)
    expect(b.columns.flatMap((c) => c.cards).map((c) => c.id)).not.toContain('o6')
  })

  test('a first sale moves the card on, and paid orders in two months make it recurring', () => {
    const sold = ticketingFromOrders(['2026-11-05T09:00:00Z'])
    expect(sold).toEqual({ ticketingActivated: false, paidOrders: 1, paidMonths: 1 })
    const b = pipelineBoard(rows, (id) => (id === 'o4' ? sold : { ticketingActivated: false, paidOrders: 0, paidMonths: 0 }))
    expect(b.columns.find((c) => c.stage === 'first_sale')!.cards.map((c) => c.id)).toEqual(['o4'])
    const twice = ticketingFromOrders(['2026-10-05T09:00:00Z', '2026-11-05T09:00:00Z', null])
    expect(twice.paidMonths).toBe(2)
    const b2 = pipelineBoard(rows, (id) => (id === 'o4' ? twice : { ticketingActivated: false, paidOrders: 0, paidMonths: 0 }))
    expect(b2.columns.find((c) => c.stage === 'recurring')!.cards.map((c) => c.id)).toEqual(['o4'])
  })

  test('a month is read in Melbourne: 31 October at 2 pm UTC is 1 November there', () => {
    expect(ticketingFromOrders(['2026-10-31T14:00:00Z', '2026-11-02T00:00:00Z']).paidMonths).toBe(1)
  })
})
