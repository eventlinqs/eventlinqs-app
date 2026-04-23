'use client'

import { useState, useTransition } from 'react'
import { createDiscountCode, updateDiscountCode, deleteDiscountCode } from '@/app/actions/discount-codes'
import type { DiscountCode, TicketTier } from '@/types/database'

interface Props {
  eventId: string
  currency: string
  initialCodes: DiscountCode[]
  tiers: Pick<TicketTier, 'id' | 'name'>[]
}

const initialForm = {
  code: '',
  discount_type: 'percentage' as 'percentage' | 'fixed_amount',
  discount_value: '',
  max_uses: '',
  max_uses_per_user: '1',
  min_order_amount: '',
  valid_from: '',
  valid_until: '',
  applicable_tier_ids: [] as string[],
  is_active: true,
}

export function DiscountCodesClient({ eventId, currency, initialCodes, tiers }: Props) {
  const [codes, setCodes] = useState<DiscountCode[]>(initialCodes)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleChange(field: string, value: string | boolean | string[]) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const discountValue = parseFloat(form.discount_value)
    if (isNaN(discountValue) || discountValue <= 0) {
      setFormError('Enter a valid discount value')
      return
    }

    const codeUpper = form.code.toUpperCase().trim()
    if (!/^[A-Z0-9-]{3,20}$/.test(codeUpper)) {
      setFormError('Code must be 3-20 uppercase letters, numbers, or hyphens')
      return
    }

    startTransition(async () => {
      const result = await createDiscountCode({
        event_id: eventId,
        code: codeUpper,
        discount_type: form.discount_type,
        discount_value: discountValue,
        currency: form.discount_type === 'fixed_amount' ? currency : null,
        max_uses: form.max_uses ? parseInt(form.max_uses) : null,
        max_uses_per_user: parseInt(form.max_uses_per_user) || 1,
        min_order_amount_cents: form.min_order_amount ? Math.round(parseFloat(form.min_order_amount) * 100) : null,
        applicable_tier_ids: form.applicable_tier_ids.length > 0 ? form.applicable_tier_ids : null,
        valid_from: form.valid_from || null,
        valid_until: form.valid_until || null,
        is_active: form.is_active,
      })

      if (result.error) {
        setFormError(result.error)
        return
      }

      if (result.code) {
        setCodes(prev => [result.code!, ...prev])
        setForm(initialForm)
        setShowForm(false)
      }
    })
  }

  function handleToggle(id: string, isActive: boolean) {
    startTransition(async () => {
      const result = await updateDiscountCode(id, { is_active: !isActive })
      if (!result.error) {
        setCodes(prev => prev.map(c => c.id === id ? { ...c, is_active: !isActive } : c))
      }
    })
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this discount code?')) return
    startTransition(async () => {
      const result = await deleteDiscountCode(id)
      if (result.error) {
        alert(result.error)
      } else {
        setCodes(prev => prev.filter(c => c.id !== id))
      }
    })
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-[#1A1A2E] px-4 py-2 text-sm font-medium text-white hover:bg-[#2d2d4a] transition-colors"
        >
          {showForm ? 'Cancel' : '+ Create Code'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-xl border border-ink-200 bg-white p-6">
          <h3 className="text-base font-semibold text-ink-900 mb-4">New Discount Code</h3>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-ink-400 mb-1">Code *</label>
              <input
                type="text"
                value={form.code}
                onChange={e => handleChange('code', e.target.value.toUpperCase())}
                placeholder="SUMMER20"
                className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-1 focus:ring-gold-400"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-ink-400 mb-1">Type *</label>
              <select
                value={form.discount_type}
                onChange={e => handleChange('discount_type', e.target.value)}
                className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:outline-none"
              >
                <option value="percentage">Percentage off (%)</option>
                <option value="fixed_amount">Fixed amount off</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-ink-400 mb-1">
                Value * {form.discount_type === 'percentage' ? '(1-100)' : `(${currency.toUpperCase()})`}
              </label>
              <input
                type="number"
                value={form.discount_value}
                onChange={e => handleChange('discount_value', e.target.value)}
                min="0.01"
                step={form.discount_type === 'percentage' ? '1' : '0.01'}
                max={form.discount_type === 'percentage' ? '100' : undefined}
                className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold-400"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-ink-400 mb-1">Max Total Uses</label>
              <input
                type="number"
                value={form.max_uses}
                onChange={e => handleChange('max_uses', e.target.value)}
                min="1"
                placeholder="Unlimited"
                className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold-400"
              />
            </div>

            <div>
              <label className="block text-xs text-ink-400 mb-1">Max Uses Per Person</label>
              <input
                type="number"
                value={form.max_uses_per_user}
                onChange={e => handleChange('max_uses_per_user', e.target.value)}
                min="1"
                className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold-400"
              />
            </div>

            <div>
              <label className="block text-xs text-ink-400 mb-1">Min Order Value ({currency.toUpperCase()})</label>
              <input
                type="number"
                value={form.min_order_amount}
                onChange={e => handleChange('min_order_amount', e.target.value)}
                min="0"
                step="0.01"
                placeholder="No minimum"
                className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold-400"
              />
            </div>

            <div>
              <label className="block text-xs text-ink-400 mb-1">Valid From</label>
              <input
                type="datetime-local"
                value={form.valid_from}
                onChange={e => handleChange('valid_from', e.target.value)}
                className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold-400"
              />
            </div>

            <div>
              <label className="block text-xs text-ink-400 mb-1">Valid Until</label>
              <input
                type="datetime-local"
                value={form.valid_until}
                onChange={e => handleChange('valid_until', e.target.value)}
                className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold-400"
              />
            </div>
          </div>

          {tiers.length > 0 && (
            <div className="mt-4">
              <label className="block text-xs text-ink-400 mb-2">Restrict to Ticket Types (leave blank for all)</label>
              <div className="flex flex-wrap gap-2">
                {tiers.map(tier => (
                  <label key={tier.id} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.applicable_tier_ids.includes(tier.id)}
                      onChange={e => {
                        const ids = e.target.checked
                          ? [...form.applicable_tier_ids, tier.id]
                          : form.applicable_tier_ids.filter(id => id !== tier.id)
                        handleChange('applicable_tier_ids', ids)
                      }}
                      className="rounded"
                    />
                    <span className="text-sm text-ink-600">{tier.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {formError && (
            <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-[#1A1A2E] px-5 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-[#2d2d4a]"
            >
              {isPending ? 'Creating…' : 'Create Code'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setForm(initialForm); setFormError(null) }}
              className="rounded-lg border border-ink-200 px-5 py-2 text-sm text-ink-600 hover:bg-ink-100"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {codes.length === 0 ? (
        <div className="rounded-xl border border-ink-200 bg-white p-12 text-center">
          <p className="text-ink-400 text-sm">No discount codes yet. Create one to boost ticket sales.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-ink-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs font-semibold text-ink-400 uppercase tracking-wider">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Discount</th>
                <th className="px-4 py-3">Uses</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {codes.map(code => (
                <tr key={code.id} className="hover:bg-ink-100">
                  <td className="px-4 py-3 font-mono font-semibold text-ink-900">{code.code}</td>
                  <td className="px-4 py-3 text-ink-600">
                    {code.discount_type === 'percentage'
                      ? `${code.discount_value}%`
                      : `${(code.currency ?? currency).toUpperCase()} ${(code.discount_value / 100).toFixed(2)}`}
                  </td>
                  <td className="px-4 py-3 text-ink-400">
                    {code.current_uses}{code.max_uses !== null ? ` / ${code.max_uses}` : ''}
                  </td>
                  <td className="px-4 py-3 text-ink-400 text-xs">
                    {code.valid_until
                      ? new Date(code.valid_until).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
                      : 'No expiry'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      code.is_active ? 'bg-green-100 text-green-800' : 'bg-ink-100 text-ink-600'
                    }`}>
                      {code.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleToggle(code.id, code.is_active)}
                        disabled={isPending}
                        className="text-xs text-gold-500 hover:underline"
                      >
                        {code.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      {code.current_uses === 0 && (
                        <button
                          onClick={() => handleDelete(code.id)}
                          disabled={isPending}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
