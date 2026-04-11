'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSquad } from '@/app/actions/squads'

interface StartSquadModalProps {
  isOpen: boolean
  onClose: () => void
  eventId: string
  tierId: string
  tierName: string
  totalSpots: number
  pricePerSpotCents: number
  currency: string
}

function formatPrice(cents: number, currency: string) {
  return `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`
}

type ModalStep = 'form' | 'success'

export function StartSquadModal({
  isOpen,
  onClose,
  eventId,
  tierId,
  tierName,
  totalSpots,
  pricePerSpotCents,
  currency,
}: StartSquadModalProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState<ModalStep>('form')
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [squadId, setSquadId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')

  const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const shareUrl = shareToken ? `${appUrl}/squad/${shareToken}` : ''

  function handleClose() {
    if (isPending) return
    // Reset state on close only if not in success step
    if (step !== 'success') {
      setError(null)
    }
    onClose()
  }

  function handleCopy() {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      // Fallback for browsers without clipboard API
      const el = document.createElement('textarea')
      el.value = shareUrl
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleWhatsAppShare() {
    const msg = encodeURIComponent(
      `Join my squad for this event! ${totalSpots} spots — each person pays their own share.\n\n${shareUrl}`
    )
    window.open(`https://wa.me/?text=${msg}`, '_blank', 'noopener,noreferrer')
  }

  function handleNativeShare() {
    if (navigator.share) {
      navigator.share({
        title: 'Join my EventLinqs Squad',
        text: `I'm organising a group — ${totalSpots} spots, everyone pays their own share!`,
        url: shareUrl,
      }).catch(() => {
        // User dismissed or share failed — fall back to copy
        handleCopy()
      })
    } else {
      handleCopy()
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError('Please fill in all required fields.')
      return
    }

    startTransition(async () => {
      const result = await createSquad({
        event_id: eventId,
        ticket_tier_id: tierId,
        total_spots: totalSpots,
        attendee_first_name: firstName.trim(),
        attendee_last_name: lastName.trim(),
        attendee_email: email.trim(),
      })

      if (result.error) {
        setError(result.error)
        return
      }

      setShareToken(result.share_token ?? null)
      setSquadId(result.squad_id ?? null)
      setStep('success')
    })
  }

  function handleGoToSquad() {
    if (shareToken) {
      router.push(`/squad/${shareToken}`)
    }
    onClose()
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal — full-screen sheet on mobile, centered on md+ */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="squad-modal-title"
        className="
          fixed inset-0 z-50 flex flex-col bg-white overflow-y-auto
          md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2
          md:w-[520px] md:h-auto md:max-h-[90vh] md:rounded-2xl md:shadow-2xl
        "
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 id="squad-modal-title" className="text-lg font-bold text-gray-900">
            {step === 'success' ? '🎉 Squad Created!' : 'Start a Squad'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6">
          {step === 'form' ? (
            <form onSubmit={handleSubmit} noValidate>
              {/* Squad summary */}
              <div className="rounded-xl bg-[#F0F6FF] border border-blue-100 p-4 mb-6">
                <p className="text-sm font-semibold text-[#1A1A2E]">{tierName}</p>
                <p className="text-sm text-gray-600 mt-1">
                  <span className="font-medium">{totalSpots} spots</span> — each person pays{' '}
                  <span className="font-semibold text-[#4A90D9]">
                    {formatPrice(pricePerSpotCents, currency)} each
                  </span>
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  When all {totalSpots} spots are filled, everyone gets their ticket automatically.
                  If the squad expires unfilled, all payments are refunded.
                </p>
              </div>

              {/* Leader details */}
              <p className="text-sm font-semibold text-gray-900 mb-3">Your details</p>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label htmlFor="squad-first" className="block text-sm font-medium text-gray-700 mb-1">
                    First name <span aria-hidden="true" className="text-red-500">*</span>
                  </label>
                  <input
                    id="squad-first"
                    type="text"
                    required
                    autoComplete="given-name"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base text-gray-900 focus:border-[#4A90D9] focus:outline-none focus:ring-1 focus:ring-[#4A90D9]"
                    placeholder="Alice"
                  />
                </div>
                <div>
                  <label htmlFor="squad-last" className="block text-sm font-medium text-gray-700 mb-1">
                    Last name <span aria-hidden="true" className="text-red-500">*</span>
                  </label>
                  <input
                    id="squad-last"
                    type="text"
                    required
                    autoComplete="family-name"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base text-gray-900 focus:border-[#4A90D9] focus:outline-none focus:ring-1 focus:ring-[#4A90D9]"
                    placeholder="Smith"
                  />
                </div>
              </div>

              <div className="mb-5">
                <label htmlFor="squad-email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email address <span aria-hidden="true" className="text-red-500">*</span>
                </label>
                <input
                  id="squad-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base text-gray-900 focus:border-[#4A90D9] focus:outline-none focus:ring-1 focus:ring-[#4A90D9]"
                  placeholder="alice@example.com"
                />
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="w-full h-12 rounded-xl bg-[#1A1A2E] text-white font-semibold text-base
                           disabled:opacity-50 hover:bg-[#2d2d4a] transition-colors"
              >
                {isPending ? 'Creating your squad…' : `Create Squad — ${totalSpots} Spots`}
              </button>
            </form>
          ) : (
            /* ─── Success step ─── */
            <div>
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 mb-6 text-center">
                <p className="text-sm font-semibold text-emerald-800">
                  Your squad is live! Share the link with your friends.
                </p>
                <p className="text-xs text-emerald-600 mt-1">
                  {totalSpots - 1} spot{totalSpots - 1 !== 1 ? 's' : ''} remaining — link expires in 24 hours.
                </p>
              </div>

              {/* Share link */}
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your squad link
                </label>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={shareUrl}
                    aria-label="Squad share link"
                    className="flex-1 min-w-0 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 truncate"
                  />
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="shrink-0 h-11 px-4 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    aria-label={copied ? 'Copied!' : 'Copy link'}
                  >
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Share buttons */}
              <div className="space-y-3 mb-6">
                <button
                  type="button"
                  onClick={handleWhatsAppShare}
                  className="w-full h-12 rounded-xl bg-[#25D366] text-white font-semibold text-sm
                             flex items-center justify-center gap-2 hover:bg-[#1ebe5e] transition-colors"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  Share on WhatsApp
                </button>

                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="w-full h-12 rounded-xl border border-gray-300 text-gray-700 font-semibold text-sm
                             flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  Share via…
                </button>
              </div>

              <button
                type="button"
                onClick={handleGoToSquad}
                className="w-full h-12 rounded-xl bg-[#4A90D9] text-white font-semibold text-base
                           hover:bg-[#3478C5] transition-colors"
              >
                Go to My Squad →
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
