import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { RefundRequestForm } from './refund-request-form'

export const metadata = {
  title: 'Request a refund | EventLinqs',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

interface OrderRow {
  id: string
  user_id: string | null
  status: string
  total_cents: number
  currency: string
  organisation_id: string
}

export default async function RefundRequestPage({
  params,
}: {
  params: Promise<{ order_id: string }>
}) {
  const { order_id: orderId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/orders/${orderId}/refund-request`)

  const admin = createAdminClient()
  const { data: orderData } = await admin
    .from('orders')
    .select('id, user_id, status, total_cents, currency, organisation_id')
    .eq('id', orderId)
    .maybeSingle()

  const order = orderData as OrderRow | null
  if (!order) notFound()
  if (order.user_id !== user.id) notFound()

  const refundable = order.status === 'confirmed' || order.status === 'partially_refunded'

  const { data: existingRefunds } = await admin
    .from('refunds')
    .select('id, status')
    .eq('order_id', orderId)
    .in('status', ['pending', 'processing'])

  const alreadyRequested = (existingRefunds ?? []).length > 0

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
      <Link
        href={`/orders/${orderId}/confirmation`}
        className="inline-flex items-center gap-2 text-sm text-ink-600 hover:text-ink-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to order
      </Link>

      <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">Request a refund</h1>
      <p className="mt-2 text-sm text-ink-600">
        The organiser of this event reviews each request. You will be notified by email once the refund is processed or if it cannot be approved.
      </p>

      <div className="mt-6">
        {!refundable ? (
          <div className="rounded-2xl border border-ink-100 bg-white p-6 text-sm text-ink-700">
            This order is not in a refundable state.
          </div>
        ) : (
          <RefundRequestForm
            orderId={order.id}
            totalCents={order.total_cents}
            currency={order.currency}
            alreadyRequested={alreadyRequested}
          />
        )}
      </div>
    </main>
  )
}
