'use client'

import { useRouter } from 'next/navigation'
import { RefundDialog, type RefundDialogReason, type RefundDialogTicket } from '@/components/refunds/refund-dialog'
import { submitAdminRefund } from './actions'

/**
 * Client host for the admin refund dialog. Wires the dialog's onSubmit to the
 * submitAdminRefund server action and refreshes the order detail on success so
 * the new refund and ticket states render.
 */
export function AdminRefundPanel({
  orderId,
  currency,
  totalCents,
  allFaceCents,
  tickets,
}: {
  orderId: string
  currency: string
  totalCents: number
  allFaceCents: number
  tickets: RefundDialogTicket[]
}) {
  const router = useRouter()

  async function handleSubmit(ticketIds: string[], reason: RefundDialogReason, buyerMessage: string | null) {
    const res = await submitAdminRefund({ orderId, ticketIds, reason, buyerMessage })
    if (!res.ok) throw new Error(res.error)
    router.refresh()
  }

  return (
    <RefundDialog
      tone="dark"
      currency={currency}
      totalCents={totalCents}
      allFaceCents={allFaceCents}
      tickets={tickets}
      onSubmit={handleSubmit}
    />
  )
}
