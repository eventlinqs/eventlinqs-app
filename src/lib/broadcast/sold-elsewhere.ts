import { TICKETS_SOLD_ELSEWHERE_HEADING } from '@/lib/payments/sale-status'

/**
 * True when a price line (src/lib/broadcast/price-line.ts) says the night is sold on another site, so nothing may
 * claim a presale or a door of ours. Its own module because the captions run in the browser: it carries one string.
 */
export function isSoldElsewhereLabel(label: string): boolean {
  return label === TICKETS_SOLD_ELSEWHERE_HEADING || label.startsWith('Tickets on ')
}
