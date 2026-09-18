import { formatMoneyDisplay } from '@/lib/money/format'
import { FIGURE, UNAVAILABLE_SENTENCE, type FigureKey, type ProofResult, type SourcedFigure } from './compose'

/**
 * TURNING THE FIGURES INTO WORDS, IN ONE PLACE.
 *
 * The page renders what this returns and composes nothing of its own. Two
 * reasons, and the second is the one that matters: a screen that writes its own
 * wording starts saying something slightly different from the record it
 * describes, and a screen with no strings in it cannot hide a typed number. The
 * test that scans the rendering path for a numeric literal, a currency string or
 * a percentage would have nowhere to look if the page formatted its own money.
 *
 * MONEY IS WRITTEN THE AUSTRALIAN WAY by `formatMoneyDisplay`, en-AU, grouped,
 * always to the cent. Rounding to whole dollars broke reconciliation on the
 * admin revenue tiles once already and the note is in that file.
 */

export interface PresentedFigure {
  key: FigureKey
  label: string
  /** The figure as a person reads it, or the sentence saying why there is none. */
  display: string
  /** True when there is no number, so the page can style it as words. */
  unavailable: boolean
  /** Where the number came from, for the expansion. Empty when unavailable. */
  sourceSentence: string
  rowCount: number
  border: string | null
}

const LABEL: Record<FigureKey, string> = {
  [FIGURE.PRODUCED_BY_US]: 'Revenue we produced',
  [FIGURE.PRODUCED_BY_US_ORDERS]: 'Sales we produced',
  [FIGURE.PRODUCED_ELSEWHERE]: 'Revenue produced elsewhere',
  [FIGURE.PRODUCED_ELSEWHERE_ORDERS]: 'Sales produced elsewhere',
  [FIGURE.REVERSED]: 'Taken back',
  [FIGURE.REVERSED_ORDERS]: 'Sales taken back',
  [FIGURE.FEE_DUE]: 'Fee due',
  [FIGURE.COST_PER_SALE]: 'Cost per sale',
  [FIGURE.SENDS_DISPATCHED]: 'Messages that left',
  [FIGURE.LEDGER_NET]: 'The money ledger for this event',
}

/** The figures that are money and are written as money. The rest are counts. */
const MONEY: readonly FigureKey[] = [
  FIGURE.PRODUCED_BY_US,
  FIGURE.PRODUCED_ELSEWHERE,
  FIGURE.REVERSED,
  FIGURE.FEE_DUE,
  FIGURE.COST_PER_SALE,
  FIGURE.LEDGER_NET,
]

export function presentFigure(key: FigureKey, figure: SourcedFigure, currency: string | null): PresentedFigure {
  if (figure.unavailable) {
    return {
      key,
      label: LABEL[key],
      display: UNAVAILABLE_SENTENCE[figure.unavailable.reason],
      unavailable: true,
      sourceSentence: '',
      rowCount: 0,
      border: figure.unavailable.border,
    }
  }
  const value = figure.value as number
  const isMoney = MONEY.includes(key)
  return {
    key,
    label: LABEL[key],
    display: isMoney && currency ? formatMoneyDisplay(value, currency) : String(value),
    unavailable: false,
    sourceSentence: figure.source?.query ?? '',
    rowCount: figure.source?.rowIds.length ?? 0,
    border: null,
  }
}

export function presentAll(result: ProofResult, currency: string | null): Record<FigureKey, PresentedFigure> {
  const out = {} as Record<FigureKey, PresentedFigure>
  for (const key of Object.keys(result.figures) as FigureKey[]) {
    out[key] = presentFigure(key, result.figures[key], currency)
  }
  return out
}

/**
 * THE FEE BASIS, IN ONE PLAIN SENTENCE, READ FROM THE CONFIGURATION.
 *
 * The rate is never written down here: it arrives as a number from the pricing
 * resolver and is turned into words. A campaign with no configured rate gets
 * the sentence that says so, because the page must be able to explain an
 * absence as readily as a figure.
 */
export function feeBasisSentence(commissionPercent: number | null): string {
  if (commissionPercent === null) {
    return 'No commission rate is configured for this campaign, so no fee is quoted.'
  }
  return `The fee is ${commissionPercent} per cent of the revenue above, which is the rate configured for this client. It is charged on sales tied to a campaign click by evidence and on nothing else.`
}

/** One line per order we are charging for, written rather than tabulated. */
export function producedByUsLines(
  result: ProofResult,
  currency: string | null,
): { reference: string; amount: string; why: string }[] {
  return result.producedByUsOrders.map(o => ({
    reference: o.reference,
    amount: currency ? formatMoneyDisplay(o.totalCents, currency) : String(o.totalCents),
    why: o.explanation,
  }))
}

export function reversalLines(
  result: ProofResult,
  currency: string | null,
): { reference: string; amount: string; reason: string }[] {
  return result.reversalRows.map(r => ({
    reference: r.reference,
    amount: currency ? formatMoneyDisplay(r.amountCents, currency) : String(r.amountCents),
    reason: r.reason,
  }))
}
