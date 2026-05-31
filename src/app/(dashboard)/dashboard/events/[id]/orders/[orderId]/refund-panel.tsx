'use client'

import { useRouter } from 'next/navigation'
import { RefundDialog, type RefundDialogReason, type RefundDialogTicket } from '@/components/refunds/refund-dialog'
import { submitOrganiserRefund } from './actions'

/**
 * Client host for the organiser refund dialog (light tone). Wires onSubmit to
 * submitOrganiserRefund and refreshes on success. Authorisation is enforced
 * server-side by resolveRefundScope + create_refund_request.
 */
export function OrganiserRefundPanel({
  eventId,
  orderId,
  currency,
  totalCents,
  allFaceCents,
  tickets,
}: {
  eventId: string
  orderId: string
  currency: string
  totalCents: number
  allFaceCents: number
  tickets: RefundDialogTicket[]
}) {
  const router = useRouter()

  async function handleSubmit(ticketIds: string[], reason: RefundDialogReason, buyerMessage: string | null) {
    const res = await submitOrganiserRefund({ eventId, orderId, ticketIds, reason, buyerMessage })
    if (!res.ok) throw new Error(res.error)
    router.refresh()
  }

  return (
    <RefundDialog
      tone="light"
      currency={currency}
      totalCents={totalCents}
      allFaceCents={allFaceCents}
      tickets={tickets}
      onSubmit={handleSubmit}
    />
  )
}
