'use client'

import { useState, useTransition } from 'react'
import { validateDiscountCode } from '@/app/actions/discount-codes'

interface DiscountCodeInputProps {
  eventId: string
  userId: string | null
  subtotalCents: number
  tierIds: string[]
  appliedCode: string | null
  discountCents: number
  onApply: (code: string, discountCents: number, discountCodeId: string) => void
  onRemove: () => void
}

export function DiscountCodeInput({
  eventId,
  userId,
  subtotalCents,
  tierIds,
  appliedCode,
  discountCents,
  onApply,
  onRemove,
}: DiscountCodeInputProps) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleApply() {
    if (!code.trim()) return
    setError(null)

    startTransition(async () => {
      const result = await validateDiscountCode(
        code.trim(),
        eventId,
        userId,
        subtotalCents,
        tierIds
      )

      if (result.valid) {
        onApply(code.trim().toUpperCase(), result.discount_cents, result.discount_code_id!)
        setCode('')
      } else {
        setError(result.error ?? 'Invalid code')
      }
    })
  }

  if (appliedCode) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-green-800">
              Code <span className="font-mono">{appliedCode}</span> applied
            </p>
            <p className="text-xs text-green-600 mt-0.5">
              −{(discountCents / 100).toFixed(2)} discount
            </p>
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-green-700 underline hover:text-green-900"
          >
            Remove
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-6">
      <h3 className="text-base font-semibold text-ink-900 mb-3">Discount Code</h3>
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && handleApply()}
          placeholder="Enter code"
          className="flex-1 rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500 font-mono uppercase"
        />
        <button
          type="button"
          onClick={handleApply}
          disabled={isPending || !code.trim()}
          className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-ink-600 transition-colors"
        >
          {isPending ? 'Checking…' : 'Apply'}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  )
}
