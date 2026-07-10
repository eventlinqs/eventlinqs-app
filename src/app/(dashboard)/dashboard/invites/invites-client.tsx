'use client'

import { useState, useTransition } from 'react'
import { Check, Copy } from 'lucide-react'
import { generateMyFoundingInvite } from './actions'

type InviteRow = { code: string; url: string; cityName: string; status: string; acceptedAt: string | null }

export function InvitesClient({
  initialInvites,
  allowance,
  bonusMonths,
  bonusPerReferral,
  acceptedCount,
}: {
  initialInvites: InviteRow[]
  allowance: number
  bonusMonths: number
  bonusPerReferral: number
  acceptedCount: number
}) {
  const [invites, setInvites] = useState<InviteRow[]>(initialInvites)
  const [city, setCity] = useState<'geelong' | 'melbourne'>('geelong')
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const remaining = allowance - invites.length

  const generate = () => {
    setError(null)
    startTransition(async () => {
      const result = await generateMyFoundingInvite(city)
      if (result.error) { setError(result.error); return }
      if (result.code) {
        const url = `${window.location.origin}/join/${result.code}`
        setInvites(prev => [
          { code: result.code!, url, cityName: city === 'geelong' ? 'Geelong' : 'Melbourne', status: 'pending', acceptedAt: null },
          ...prev,
        ])
      }
    })
  }

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(url)
      window.setTimeout(() => setCopied(c => (c === url ? null : c)), 1800)
    } catch {
      // the URL is visible in the row for manual selection
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Invites left" value={`${remaining} of ${allowance}`} />
        <Stat label="Organisers joined" value={String(acceptedCount)} />
        <Stat label="Fee-free months earned" value={`+${bonusMonths}`} hint={`${bonusPerReferral} per referral`} />
      </div>

      <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-ink-900">Generate a personal invite</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select
            value={city}
            onChange={e => setCity(e.target.value as 'geelong' | 'melbourne')}
            className="h-11 rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 focus:border-gold-400 focus:outline-none"
          >
            <option value="geelong">Geelong</option>
            <option value="melbourne">Melbourne</option>
          </select>
          <button
            type="button"
            onClick={generate}
            disabled={isPending || remaining <= 0}
            className="inline-flex min-h-[44px] items-center rounded-full bg-gold-500 px-5 py-2 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-600 disabled:opacity-50"
          >
            {isPending ? 'Creating...' : remaining <= 0 ? 'No invites left' : 'Create invite link'}
          </button>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      </div>

      {invites.length > 0 && (
        <div className="rounded-2xl border border-ink-200 bg-white shadow-sm">
          <div className="border-b border-ink-100 px-5 py-3">
            <p className="text-sm font-semibold text-ink-900">Your invites</p>
          </div>
          <ul className="divide-y divide-ink-100">
            {invites.map(inv => (
              <li key={inv.code} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900">{inv.url}</p>
                  <p className="text-xs text-ink-500">
                    {inv.cityName}
                    {' · '}
                    {inv.status === 'accepted' ? 'Joined' : 'Waiting to be claimed'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => copy(inv.url)}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-900 hover:bg-ink-50"
                >
                  {copied === inv.url ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                  {copied === inv.url ? 'Copied' : 'Copy'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-600">{label}</p>
      <p className="mt-2 font-display text-2xl font-bold text-[var(--brand-accent-strong)]">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-400">{hint}</p>}
    </div>
  )
}
