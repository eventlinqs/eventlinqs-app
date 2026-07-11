'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { postGigAction } from '@/app/actions/gigs'
import {
  PAY_TYPES,
  PAY_TYPE_LABELS,
  PERFORMANCE_TYPES,
  PERFORMANCE_TYPE_LABELS,
  type PayType,
  type PerformanceType,
} from '@/lib/marketplace/gigs'

const inputClass =
  'h-11 w-full rounded-lg border border-ink-200 bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/20'
const labelClass = 'block text-sm font-semibold text-ink-900'

/** Post a gig: the structured listing form (no free-form contact fields). */
export function PostGigForm({
  cities,
  events,
}: {
  cities: { slug: string; name: string }[]
  events: { id: string; title: string }[]
}) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [citySlug, setCitySlug] = useState('geelong')
  const [venueName, setVenueName] = useState('')
  const [performanceType, setPerformanceType] = useState<PerformanceType>('musician')
  const [payType, setPayType] = useState<PayType>('negotiable')
  const [payAmount, setPayAmount] = useState('')
  const [payNote, setPayNote] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [deadline, setDeadline] = useState('')
  const [eventId, setEventId] = useState('')
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    const amountCents = payAmount ? Math.round(parseFloat(payAmount) * 100) : null
    startTransition(async () => {
      const res = await postGigAction({
        title,
        description,
        citySlug,
        venueName: venueName || undefined,
        performanceType,
        payType,
        payAmountCents: Number.isFinite(amountCents as number) ? amountCents : null,
        payNote: payNote || undefined,
        eventDate: eventDate ? new Date(eventDate).toISOString() : '',
        applicationDeadline: deadline ? new Date(deadline).toISOString() : '',
        eventId: eventId || null,
      })
      if (res.ok) {
        setMessage({ kind: 'ok', text: 'Gig posted. Matching performers in that city are being told now.' })
        setTitle('')
        setDescription('')
        setVenueName('')
        setPayAmount('')
        setPayNote('')
        setEventDate('')
        setDeadline('')
        setEventId('')
        router.refresh()
      } else {
        setMessage({ kind: 'err', text: res.error ?? 'Could not post the gig.' })
      }
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-ink-200 bg-white p-6">
      <h2 className="font-display text-lg font-bold text-ink-900">Post a gig</h2>
      <p className="text-sm text-ink-600">
        Structured and specific fills faster: performers apply with their real numbers, you
        compare side by side.
      </p>

      <div>
        <label htmlFor="gig-title" className={labelClass}>Gig title</label>
        <input id="gig-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={140} placeholder="Opening comedy set, Friday season opener" className={`mt-1 ${inputClass}`} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="gig-type" className={labelClass}>Performance type</label>
          <select id="gig-type" value={performanceType} onChange={(e) => setPerformanceType(e.target.value as PerformanceType)} className={`mt-1 ${inputClass}`}>
            {PERFORMANCE_TYPES.map((t) => (
              <option key={t} value={t}>{PERFORMANCE_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="gig-city" className={labelClass}>City</label>
          <select id="gig-city" value={citySlug} onChange={(e) => setCitySlug(e.target.value)} className={`mt-1 ${inputClass}`}>
            {cities.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="gig-venue" className={labelClass}>Venue (optional)</label>
        <input id="gig-venue" value={venueName} onChange={(e) => setVenueName(e.target.value)} maxLength={140} placeholder="The Cellar Comedy Room" className={`mt-1 ${inputClass}`} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="gig-date" className={labelClass}>Performance date and time</label>
          <input id="gig-date" type="datetime-local" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required className={`mt-1 ${inputClass}`} />
        </div>
        <div>
          <label htmlFor="gig-deadline" className={labelClass}>Applications close</label>
          <input id="gig-deadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} required className={`mt-1 ${inputClass}`} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="gig-pay-type" className={labelClass}>Pay</label>
          <select id="gig-pay-type" value={payType} onChange={(e) => setPayType(e.target.value as PayType)} className={`mt-1 ${inputClass}`}>
            {PAY_TYPES.map((t) => (
              <option key={t} value={t}>{PAY_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        {payType === 'fixed_fee' && (
          <div>
            <label htmlFor="gig-pay-amount" className={labelClass}>Fee (AUD)</label>
            <input id="gig-pay-amount" type="number" min="0" step="1" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="250" className={`mt-1 ${inputClass}`} />
          </div>
        )}
        <div className={payType === 'fixed_fee' ? '' : 'sm:col-span-2'}>
          <label htmlFor="gig-pay-note" className={labelClass}>Pay note (optional)</label>
          <input id="gig-pay-note" value={payNote} onChange={(e) => setPayNote(e.target.value)} maxLength={280} placeholder="Plus a rider, 30 minute set" className={`mt-1 ${inputClass}`} />
        </div>
      </div>

      <div>
        <label htmlFor="gig-description" className={labelClass}>Description</label>
        <textarea id="gig-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={4000} placeholder="The room, the crowd, the set length, what you are after." className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/20" />
      </div>

      <div>
        <label htmlFor="gig-event" className={labelClass}>Link an event (optional, recommended)</label>
        <select id="gig-event" value={eventId} onChange={(e) => setEventId(e.target.value)} className={`mt-1 ${inputClass}`}>
          <option value="">No linked event yet</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.title}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-ink-600">
          With an event linked, accepting a performer adds them to its lineup in one tap and
          their ticket sales are attributed automatically.
        </p>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 items-center rounded-lg bg-gold-400 px-6 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Posting' : 'Post gig'}
      </button>
      {message && (
        <p role="status" className={`rounded-lg px-3 py-2 text-sm ${message.kind === 'ok' ? 'bg-success/15 text-success' : 'bg-error/15 text-error'}`}>
          {message.text}
        </p>
      )}
    </form>
  )
}
