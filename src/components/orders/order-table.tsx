'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Order } from '@/types/database'

interface OrderTableProps {
  orders: (Order & { buyer_name: string; buyer_email: string; ticket_count: number })[]
  eventId: string
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  confirmed: { label: 'Confirmed', className: 'bg-green-100 text-green-800' },
  pending: { label: 'Pending', className: 'bg-amber-100 text-amber-800' },
  cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-700' },
  refunded: { label: 'Refunded', className: 'bg-gray-100 text-gray-700' },
  partially_refunded: { label: 'Part Refunded', className: 'bg-orange-100 text-orange-700' },
  expired: { label: 'Expired', className: 'bg-gray-100 text-gray-500' },
}

export function OrderTable({ orders, eventId }: OrderTableProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filtered = orders.filter(o => {
    const matchesSearch =
      !search ||
      o.buyer_name.toLowerCase().includes(search.toLowerCase()) ||
      o.buyer_email.toLowerCase().includes(search.toLowerCase()) ||
      o.order_number.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div>
      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email or order #…"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none"
        >
          <option value="all">All statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="pending">Pending</option>
          <option value="cancelled">Cancelled</option>
          <option value="refunded">Refunded</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <p className="text-gray-500 text-sm">No orders found</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Order #</th>
                <th className="px-4 py-3">Buyer</th>
                <th className="px-4 py-3">Tickets</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(order => {
                const statusInfo = STATUS_LABELS[order.status] ?? { label: order.status, className: 'bg-gray-100 text-gray-600' }
                return (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">{order.order_number}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{order.buyer_name || '—'}</p>
                      <p className="text-xs text-gray-500">{order.buyer_email}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{order.ticket_count}</td>
                    <td className="px-4 py-3 text-gray-900 font-medium">
                      {order.currency.toUpperCase()} {(order.total_cents / 100).toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo.className}`}>
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(order.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/events/${eventId}/orders/${order.id}`}
                        className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
