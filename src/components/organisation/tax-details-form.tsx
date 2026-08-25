'use client'

/**
 * The organiser records the two facts a tax invoice needs from them.
 *
 * The form is deliberately explicit about WHY it asks. An ABN field with no
 * explanation reads as bureaucracy; the same field beside "your buyers cannot
 * claim GST without it" reads as something worth doing. The Australian Taxation
 * Office requires a tax invoice to carry the seller's identity and the seller's
 * ABN, and under this platform's collection-agent posture the seller is the
 * organiser, so without these fields nobody's receipt can be a tax invoice.
 *
 * The ABN hint is computed from the SAME function the server action validates
 * with (src/lib/tax/abn.ts), so the message a person sees while typing and the
 * message that rejects the save can never disagree.
 */

import { useActionState, useState } from 'react'
import { abnValidationMessage, formatAbn } from '@/lib/tax/abn'
import { updateOrganisationTaxDetails } from '@/app/(dashboard)/dashboard/organisation/actions'

interface Props {
  organisationId: string
  legalName: string | null
  abn: string | null
  gstRegistered: boolean
  tradingName: string
}

export function TaxDetailsForm({ organisationId, legalName, abn, gstRegistered, tradingName }: Props) {
  const [state, action, pending] = useActionState(updateOrganisationTaxDetails, null)
  const [abnValue, setAbnValue] = useState(abn ? formatAbn(abn) : '')
  const [gstOn, setGstOn] = useState(gstRegistered)
  const hint = abnValidationMessage(abnValue)

  return (
    <form action={action} className="rounded-xl border border-ink-200 bg-white p-6">
      <input type="hidden" name="organisationId" value={organisationId} />

      <h2 className="type-rail-heading text-ink-900">Tax details</h2>
      <p className="mt-2 text-sm text-ink-500">
        You are the seller on every ticket you sell here; EventLinqs collects on your behalf. Record
        these and your buyers receive a valid tax invoice instead of a plain receipt.
      </p>

      <div className="mt-6 space-y-5">
        <div>
          <label htmlFor="legalName" className="block text-sm font-medium text-ink-900">
            Registered business name
          </label>
          <p className="mt-1 text-xs text-ink-400">
            Only if it differs from {tradingName}. Left blank, invoices use {tradingName}.
          </p>
          <input
            id="legalName"
            name="legalName"
            type="text"
            defaultValue={legalName ?? ''}
            maxLength={200}
            autoComplete="organization"
            className="mt-2 min-h-[44px] w-full rounded-lg border border-ink-200 px-3 text-ink-900"
          />
        </div>

        <div>
          <label htmlFor="abn" className="block text-sm font-medium text-ink-900">
            ABN
          </label>
          <p className="mt-1 text-xs text-ink-400">
            Eleven digits. Without it a receipt cannot be a tax invoice and your buyers cannot claim
            the GST.
          </p>
          <input
            id="abn"
            name="abn"
            type="text"
            inputMode="numeric"
            value={abnValue}
            onChange={e => setAbnValue(e.target.value)}
            onBlur={e => setAbnValue(formatAbn(e.target.value))}
            placeholder="51 824 753 556"
            maxLength={20}
            aria-describedby={hint ? 'abn-hint' : undefined}
            aria-invalid={hint ? true : undefined}
            className="mt-2 min-h-[44px] w-full rounded-lg border border-ink-200 px-3 text-ink-900"
          />
          {hint ? (
            <p id="abn-hint" className="mt-2 text-sm text-red-600">
              {hint}
            </p>
          ) : null}
        </div>

        <div className="flex items-start gap-3">
          <input
            id="gstRegistered"
            name="gstRegistered"
            type="checkbox"
            checked={gstOn}
            onChange={e => setGstOn(e.target.checked)}
            className="mt-1 h-5 w-5 rounded border-ink-300"
          />
          <label htmlFor="gstRegistered" className="text-sm text-ink-900">
            My business is registered for GST
            <span className="mt-1 block text-xs text-ink-400">
              Registration is separate from having an ABN. Turn this on only if you are registered,
              because a tax invoice tells your buyer they may claim the GST back.
            </span>
          </label>
        </div>
      </div>

      {state?.error ? (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p role="status" className="mt-4 text-sm text-green-700">
          {state.ok}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || Boolean(hint)}
        className="mt-6 min-h-[44px] rounded-full bg-navy px-6 text-sm font-medium text-white transition-colors duration-200 hover:bg-navy/90 disabled:opacity-50"
      >
        {pending ? 'Saving...' : 'Save tax details'}
      </button>
    </form>
  )
}
