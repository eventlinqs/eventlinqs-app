import { isAcquisitionState, STATE_WORDS } from '@/lib/outreach/acquisition-states'
import { CRM_LINE, CRM_SIDE, CRM_STAGE_WORDS, NEXT_ACTION, NO_TICKETING, crmStageOf, type CrmStage, type TicketingFacts } from './stages'

/**
 * THE PIPELINE AS A BOARD (the CRM standard of 19 November 2026, section 2 item 3: 'THE PIPELINE BOARD for acquisition
 * ... moved by the system from real events (a reply, a claim, a first sale)'; Pipedrive's board as the bar; the PM's
 * 22:14 item 2). One column for each of Lawal's stages in his order (./stages.ts, his directive of 11 November 2026),
 * then the side stages; each card the organiser, the state the database proved, and the next action its stage asks
 * for. A card moves only when the proof moves it: a stage is never typed by a person (./stages.ts), so the board has
 * no drag. Pure.
 */
export interface BoardRow {
  readonly id: string
  readonly name: string
  readonly acquisitionState: string
}

export interface BoardCard {
  readonly id: string
  readonly name: string
  readonly stateWords: string
  readonly nextAction: string
}

export interface BoardColumn {
  readonly stage: CrmStage
  readonly words: string
  readonly side: boolean
  readonly cards: readonly BoardCard[]
}

export function pipelineBoard(rows: readonly BoardRow[], factsOf: (id: string) => TicketingFacts = () => NO_TICKETING): {
  readonly columns: readonly BoardColumn[]
  readonly unread: number
} {
  const byStage = new Map<CrmStage, BoardCard[]>()
  let unread = 0
  for (const r of rows) {
    if (!isAcquisitionState(r.acquisitionState)) {
      unread++
      continue
    }
    const stage = crmStageOf(r.acquisitionState, factsOf(r.id))
    const cards = byStage.get(stage) ?? []
    cards.push({ id: r.id, name: r.name, stateWords: STATE_WORDS[r.acquisitionState], nextAction: NEXT_ACTION[stage] })
    byStage.set(stage, cards)
  }
  const column = (stage: CrmStage, side: boolean): BoardColumn => ({
    stage,
    words: CRM_STAGE_WORDS[stage],
    side,
    cards: [...(byStage.get(stage) ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'en-AU')),
  })
  return {
    columns: [...CRM_LINE.map((s) => column(s, false)), ...CRM_SIDE.map((s) => column(s, true))],
    unread,
  }
}

/** Paid orders as Lawal's stages count them (migration 20261101044501): first sale and the months they span. Pure. */
export function ticketingFromOrders(confirmedAts: readonly (string | null)[]): TicketingFacts {
  const months = new Set(
    confirmedAts
      .filter((d): d is string => Boolean(d))
      .map((d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit' }).format(new Date(d))),
  )
  return { ticketingActivated: false, paidOrders: confirmedAts.length, paidMonths: months.size }
}
