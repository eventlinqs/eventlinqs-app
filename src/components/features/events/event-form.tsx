'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createEvent, updateEvent } from '@/app/(dashboard)/dashboard/events/actions'
import { uploadEventImage } from '@/lib/upload'
import type {
  EventCategory,
  EventType,
  EventVisibility,
  EventStatus,
  TicketTierType,
  TicketTier,
} from '@/types/database'

// ─── Types ───────────────────────────────────────────────────────────────────

export type TicketTierInput = {
  id: string // client-side only
  name: string
  description: string
  tier_type: TicketTierType
  price: string // string for input binding
  currency: string
  total_capacity: string
  sale_start: string
  sale_end: string
  min_per_order: string
  max_per_order: string
  sort_order: number
}

type FormData = {
  // Step 1
  title: string
  summary: string
  description: string
  category_id: string
  tags: string
  // Step 2
  start_date: string
  end_date: string
  timezone: string
  is_multi_day: boolean
  is_recurring: boolean
  recurrence_rule: string
  // Step 3
  event_type: EventType
  venue_name: string
  venue_address: string
  venue_city: string
  venue_state: string
  venue_country: string
  venue_postal_code: string
  virtual_url: string
  // Step 4
  cover_image_url: string
  // Step 5
  ticket_tiers: TicketTierInput[]
  // Step 6
  visibility: EventVisibility
  is_age_restricted: boolean
  age_restriction_min: string
  max_capacity: string
}

const TIMEZONES = [
  'Australia/Melbourne',
  'Australia/Sydney',
  'Australia/Brisbane',
  'Australia/Perth',
  'Australia/Adelaide',
  'Africa/Lagos',
  'Africa/Nairobi',
  'Africa/Accra',
  'Africa/Johannesburg',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Singapore',
  'UTC',
]

const CURRENCIES = ['AUD', 'USD', 'GBP', 'EUR', 'NGN', 'KES', 'GHS', 'ZAR']

const TIER_TYPES: { value: TicketTierType; label: string }[] = [
  { value: 'general_admission', label: 'General Admission' },
  { value: 'vip', label: 'VIP' },
  { value: 'vvip', label: 'VVIP' },
  { value: 'early_bird', label: 'Early Bird' },
  { value: 'group', label: 'Group' },
  { value: 'student', label: 'Student' },
  { value: 'table_booth', label: 'Table / Booth' },
  { value: 'donation', label: 'Donation' },
  { value: 'free', label: 'Free' },
]

const RECURRENCE_OPTIONS = [
  { value: 'FREQ=DAILY', label: 'Daily' },
  { value: 'FREQ=WEEKLY', label: 'Weekly' },
  { value: 'FREQ=MONTHLY', label: 'Monthly' },
]

const STEPS = [
  'Basic Details',
  'Date & Time',
  'Location',
  'Cover Image',
  'Tickets',
  'Settings',
  'Review & Publish',
]

function newTier(sort_order: number): TicketTierInput {
  return {
    id: crypto.randomUUID(),
    name: '',
    description: '',
    tier_type: 'general_admission',
    price: '0',
    currency: 'AUD',
    total_capacity: '100',
    sale_start: '',
    sale_end: '',
    min_per_order: '1',
    max_per_order: '10',
    sort_order,
  }
}

function getDefaultFormData(): FormData {
  const now = new Date()
  const start = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000)
  const fmt = (d: Date) => d.toISOString().slice(0, 16)

  return {
    title: '',
    summary: '',
    description: '',
    category_id: '',
    tags: '',
    start_date: fmt(start),
    end_date: fmt(end),
    timezone: 'Australia/Melbourne',
    is_multi_day: false,
    is_recurring: false,
    recurrence_rule: 'FREQ=WEEKLY',
    event_type: 'in_person',
    venue_name: '',
    venue_address: '',
    venue_city: '',
    venue_state: '',
    venue_country: 'Australia',
    venue_postal_code: '',
    virtual_url: '',
    cover_image_url: '',
    ticket_tiers: [newTier(0)],
    visibility: 'public',
    is_age_restricted: false,
    age_restriction_min: '18',
    max_capacity: '',
  }
}

function fromExistingEvent(
  event: {
    title: string
    summary: string | null
    description: string | null
    category_id: string | null
    tags: string[]
    start_date: string
    end_date: string
    timezone: string
    is_multi_day: boolean
    is_recurring: boolean
    recurrence_rule: string | null
    event_type: EventType
    venue_name: string | null
    venue_address: string | null
    venue_city: string | null
    venue_state: string | null
    venue_country: string | null
    venue_postal_code: string | null
    virtual_url: string | null
    cover_image_url: string | null
    visibility: EventVisibility
    is_age_restricted: boolean
    age_restriction_min: number | null
    max_capacity: number | null
  },
  tiers: TicketTier[]
): FormData {
  const fmt = (d: string) => new Date(d).toISOString().slice(0, 16)
  return {
    title: event.title,
    summary: event.summary ?? '',
    description: event.description ?? '',
    category_id: event.category_id ?? '',
    tags: event.tags.join(', '),
    start_date: fmt(event.start_date),
    end_date: fmt(event.end_date),
    timezone: event.timezone,
    is_multi_day: event.is_multi_day,
    is_recurring: event.is_recurring,
    recurrence_rule: event.recurrence_rule ?? 'FREQ=WEEKLY',
    event_type: event.event_type,
    venue_name: event.venue_name ?? '',
    venue_address: event.venue_address ?? '',
    venue_city: event.venue_city ?? '',
    venue_state: event.venue_state ?? '',
    venue_country: event.venue_country ?? '',
    venue_postal_code: event.venue_postal_code ?? '',
    virtual_url: event.virtual_url ?? '',
    cover_image_url: event.cover_image_url ?? '',
    ticket_tiers: tiers.map((t, i) => ({
      id: t.id,
      name: t.name,
      description: t.description ?? '',
      tier_type: t.tier_type,
      price: (t.price / 100).toString(),
      currency: t.currency,
      total_capacity: t.total_capacity.toString(),
      sale_start: t.sale_start ? new Date(t.sale_start).toISOString().slice(0, 16) : '',
      sale_end: t.sale_end ? new Date(t.sale_end).toISOString().slice(0, 16) : '',
      min_per_order: t.min_per_order.toString(),
      max_per_order: t.max_per_order.toString(),
      sort_order: t.sort_order ?? i,
    })),
    visibility: event.visibility,
    is_age_restricted: event.is_age_restricted,
    age_restriction_min: (event.age_restriction_min ?? 18).toString(),
    max_capacity: event.max_capacity?.toString() ?? '',
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  userId: string
  organisationId: string
  categories: EventCategory[]
  // For edit mode
  editMode?: boolean
  existingEventId?: string
  existingEvent?: Parameters<typeof fromExistingEvent>[0]
  existingTiers?: TicketTier[]
  existingStatus?: EventStatus
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function EventForm({
  userId,
  organisationId,
  categories,
  editMode = false,
  existingEventId,
  existingEvent,
  existingTiers = [],
  existingStatus = 'draft',
}: Props) {
  const router = useRouter()
  const eventIdRef = useRef(existingEventId ?? crypto.randomUUID())

  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState<FormData>(() =>
    editMode && existingEvent
      ? fromExistingEvent(existingEvent, existingTiers)
      : getDefaultFormData()
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageUploading, setImageUploading] = useState(false)
  const [imageDragOver, setImageDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const set = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setFormData(d => ({ ...d, [key]: value }))
  }, [])

  const buildPayload = (status: EventStatus) => ({
    eventId: eventIdRef.current,
    organisationId,
    title: formData.title,
    summary: formData.summary,
    description: formData.description,
    category_id: formData.category_id || null,
    tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
    start_date: new Date(formData.start_date).toISOString(),
    end_date: new Date(formData.end_date).toISOString(),
    timezone: formData.timezone,
    is_multi_day: formData.is_multi_day,
    is_recurring: formData.is_recurring,
    recurrence_rule: formData.is_recurring ? formData.recurrence_rule : null,
    event_type: formData.event_type,
    venue_name: formData.venue_name || null,
    venue_address: formData.venue_address || null,
    venue_city: formData.venue_city || null,
    venue_state: formData.venue_state || null,
    venue_country: formData.venue_country || null,
    venue_postal_code: formData.venue_postal_code || null,
    venue_latitude: null,
    venue_longitude: null,
    virtual_url: formData.virtual_url || null,
    cover_image_url: formData.cover_image_url || null,
    visibility: formData.visibility,
    is_age_restricted: formData.is_age_restricted,
    age_restriction_min: formData.is_age_restricted ? parseInt(formData.age_restriction_min) : null,
    max_capacity: formData.max_capacity ? parseInt(formData.max_capacity) : null,
    status,
    scheduled_publish_at: null,
    ticket_tiers: formData.ticket_tiers.map((t, i) => ({
      name: t.name,
      description: t.description,
      tier_type: t.tier_type,
      price: parseFloat(t.price) || 0,
      currency: t.currency,
      total_capacity: parseInt(t.total_capacity) || 0,
      sale_start: t.sale_start ? new Date(t.sale_start).toISOString() : null,
      sale_end: t.sale_end ? new Date(t.sale_end).toISOString() : null,
      min_per_order: parseInt(t.min_per_order) || 1,
      max_per_order: parseInt(t.max_per_order) || 10,
      sort_order: i,
    })),
  })

  const handleSubmit = async (status: EventStatus) => {
    if (!formData.title.trim()) {
      setError('Event title is required.')
      setStep(1)
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      const payload = buildPayload(status)
      let result: { error?: string }
      if (editMode && existingEventId) {
        result = await updateEvent({ ...payload, eventId: existingEventId })
      } else {
        result = await createEvent(payload)
      }
      if (result.error) {
        setError(result.error)
      } else {
        router.push('/dashboard/events')
        router.refresh()
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB')
      return
    }
    setImageUploading(true)
    const url = await uploadEventImage(file, userId, eventIdRef.current)
    setImageUploading(false)
    if (url) {
      set('cover_image_url', url)
    } else {
      setError('Image upload failed. Please try again.')
    }
  }

  // ─── Step Renderers ────────────────────────────────────────────────────────

  const renderStep1 = () => (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Event Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.title}
          onChange={e => set('title', e.target.value)}
          placeholder="e.g. Summer Music Festival 2026"
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Short Summary
          <span className="ml-2 text-xs text-gray-400">({formData.summary.length}/200)</span>
        </label>
        <input
          type="text"
          value={formData.summary}
          onChange={e => e.target.value.length <= 200 && set('summary', e.target.value)}
          placeholder="A brief one-line description shown on event cards"
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          rows={6}
          value={formData.description}
          onChange={e => set('description', e.target.value)}
          placeholder="Describe your event in detail…"
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
        <select
          value={formData.category_id}
          onChange={e => set('category_id', e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Select a category</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Tags
          <span className="ml-2 text-xs text-gray-400">Comma-separated</span>
        </label>
        <input
          type="text"
          value={formData.tags}
          onChange={e => set('tags', e.target.value)}
          placeholder="music, outdoor, family-friendly"
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
    </div>
  )

  const renderStep2 = () => (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Start Date & Time <span className="text-red-500">*</span>
          </label>
          <input
            type="datetime-local"
            value={formData.start_date}
            onChange={e => set('start_date', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            End Date & Time <span className="text-red-500">*</span>
          </label>
          <input
            type="datetime-local"
            value={formData.end_date}
            onChange={e => set('end_date', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
        <select
          value={formData.timezone}
          onChange={e => set('timezone', e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {TIMEZONES.map(tz => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={formData.is_multi_day}
          onChange={e => set('is_multi_day', e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm font-medium text-gray-700">This is a multi-day event</span>
      </label>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={formData.is_recurring}
          onChange={e => set('is_recurring', e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm font-medium text-gray-700">This is a recurring event</span>
      </label>

      {formData.is_recurring && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Recurrence</label>
          <select
            value={formData.recurrence_rule}
            onChange={e => set('recurrence_rule', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {RECURRENCE_OPTIONS.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )

  const renderStep3 = () => (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Event Type</label>
        <div className="flex gap-3">
          {(['in_person', 'virtual', 'hybrid'] as EventType[]).map(type => (
            <button
              key={type}
              type="button"
              onClick={() => set('event_type', type)}
              className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium capitalize transition-colors ${
                formData.event_type === type
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-300 text-gray-700 hover:border-gray-400'
              }`}
            >
              {type.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {(formData.event_type === 'in_person' || formData.event_type === 'hybrid') && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Venue Name</label>
            <input
              type="text"
              value={formData.venue_name}
              onChange={e => set('venue_name', e.target.value)}
              placeholder="e.g. Melbourne Convention Centre"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <input
              type="text"
              value={formData.venue_address}
              onChange={e => set('venue_address', e.target.value)}
              placeholder="Street address"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input
                type="text"
                value={formData.venue_city}
                onChange={e => set('venue_city', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">State / Region</label>
              <input
                type="text"
                value={formData.venue_state}
                onChange={e => set('venue_state', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
              <input
                type="text"
                value={formData.venue_country}
                onChange={e => set('venue_country', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
              <input
                type="text"
                value={formData.venue_postal_code}
                onChange={e => set('venue_postal_code', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      {(formData.event_type === 'virtual' || formData.event_type === 'hybrid') && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Virtual / Streaming URL
            <span className="ml-2 text-xs text-gray-400">Hidden from attendees until after purchase</span>
          </label>
          <input
            type="url"
            value={formData.virtual_url}
            onChange={e => set('virtual_url', e.target.value)}
            placeholder="https://zoom.us/j/..."
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      )}
    </div>
  )

  const renderStep4 = () => (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Cover Image</label>
        <p className="text-xs text-gray-500 mb-4">Max 5MB. Accepted formats: JPEG, PNG, WebP.</p>

        {formData.cover_image_url ? (
          <div className="relative">
            <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-gray-200">
              <Image
                src={formData.cover_image_url}
                alt="Cover image preview"
                fill
                className="object-cover"
              />
            </div>
            <button
              type="button"
              onClick={() => set('cover_image_url', '')}
              className="mt-2 text-sm text-red-600 hover:text-red-800"
            >
              Remove image
            </button>
          </div>
        ) : (
          <div
            onDragOver={e => { e.preventDefault(); setImageDragOver(true) }}
            onDragLeave={() => setImageDragOver(false)}
            onDrop={e => {
              e.preventDefault()
              setImageDragOver(false)
              const file = e.dataTransfer.files[0]
              if (file) handleImageFile(file)
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 transition-colors ${
              imageDragOver
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
            }`}
          >
            {imageUploading ? (
              <p className="text-sm text-gray-600">Uploading…</p>
            ) : (
              <>
                <svg className="mb-3 h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm text-gray-600">
                  <span className="font-medium text-blue-600">Click to upload</span> or drag and drop
                </p>
              </>
            )}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) handleImageFile(file)
          }}
        />
      </div>
    </div>
  )

  const renderStep5 = () => (
    <div className="space-y-6">
      {formData.ticket_tiers.map((tier, idx) => (
        <div key={tier.id} className="rounded-lg border border-gray-200 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-900">
              Ticket Tier {idx + 1}
            </h4>
            {formData.ticket_tiers.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  const tiers = formData.ticket_tiers.filter((_, i) => i !== idx)
                  set('ticket_tiers', tiers)
                }}
                className="text-xs text-red-600 hover:text-red-800"
              >
                Remove
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={tier.name}
                onChange={e => {
                  const tiers = [...formData.ticket_tiers]
                  tiers[idx] = { ...tiers[idx], name: e.target.value }
                  set('ticket_tiers', tiers)
                }}
                placeholder="e.g. General Admission"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
              <select
                value={tier.tier_type}
                onChange={e => {
                  const tiers = [...formData.ticket_tiers]
                  tiers[idx] = { ...tiers[idx], tier_type: e.target.value as TicketTierType }
                  set('ticket_tiers', tiers)
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {TIER_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Price</label>
              <div className="flex gap-2">
                <select
                  value={tier.currency}
                  onChange={e => {
                    const tiers = [...formData.ticket_tiers]
                    tiers[idx] = { ...tiers[idx], currency: e.target.value }
                    set('ticket_tiers', tiers)
                  }}
                  className="w-24 rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {CURRENCIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={tier.price}
                  onChange={e => {
                    const tiers = [...formData.ticket_tiers]
                    tiers[idx] = { ...tiers[idx], price: e.target.value }
                    set('ticket_tiers', tiers)
                  }}
                  placeholder="0.00"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Total Capacity</label>
              <input
                type="number"
                min="1"
                value={tier.total_capacity}
                onChange={e => {
                  const tiers = [...formData.ticket_tiers]
                  tiers[idx] = { ...tiers[idx], total_capacity: e.target.value }
                  set('ticket_tiers', tiers)
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Sale Starts</label>
              <input
                type="datetime-local"
                value={tier.sale_start}
                onChange={e => {
                  const tiers = [...formData.ticket_tiers]
                  tiers[idx] = { ...tiers[idx], sale_start: e.target.value }
                  set('ticket_tiers', tiers)
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Sale Ends</label>
              <input
                type="datetime-local"
                value={tier.sale_end}
                onChange={e => {
                  const tiers = [...formData.ticket_tiers]
                  tiers[idx] = { ...tiers[idx], sale_end: e.target.value }
                  set('ticket_tiers', tiers)
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Min per Order</label>
              <input
                type="number"
                min="1"
                value={tier.min_per_order}
                onChange={e => {
                  const tiers = [...formData.ticket_tiers]
                  tiers[idx] = { ...tiers[idx], min_per_order: e.target.value }
                  set('ticket_tiers', tiers)
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Max per Order</label>
              <input
                type="number"
                min="1"
                value={tier.max_per_order}
                onChange={e => {
                  const tiers = [...formData.ticket_tiers]
                  tiers[idx] = { ...tiers[idx], max_per_order: e.target.value }
                  set('ticket_tiers', tiers)
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Description (optional)</label>
              <input
                type="text"
                value={tier.description}
                onChange={e => {
                  const tiers = [...formData.ticket_tiers]
                  tiers[idx] = { ...tiers[idx], description: e.target.value }
                  set('ticket_tiers', tiers)
                }}
                placeholder="What's included in this ticket?"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => {
          set('ticket_tiers', [...formData.ticket_tiers, newTier(formData.ticket_tiers.length)])
        }}
        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Ticket Tier
      </button>
    </div>
  )

  const renderStep6 = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">Visibility</label>
        <div className="space-y-3">
          {([
            { value: 'public', label: 'Public', desc: 'Listed on EventLinqs and visible to everyone' },
            { value: 'private', label: 'Private', desc: 'Only visible to invited attendees' },
            { value: 'unlisted', label: 'Unlisted', desc: 'Accessible via direct link only, not listed publicly' },
          ] as { value: EventVisibility; label: string; desc: string }[]).map(opt => (
            <label key={opt.value} className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-4 hover:bg-gray-50">
              <input
                type="radio"
                name="visibility"
                value={opt.value}
                checked={formData.visibility === opt.value}
                onChange={() => set('visibility', opt.value)}
                className="mt-0.5 h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                <p className="text-xs text-gray-500">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.is_age_restricted}
            onChange={e => set('is_age_restricted', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">Age restriction applies</span>
        </label>
        {formData.is_age_restricted && (
          <div className="mt-3 ml-7">
            <label className="block text-xs font-medium text-gray-700 mb-1">Minimum Age</label>
            <input
              type="number"
              min="1"
              max="99"
              value={formData.age_restriction_min}
              onChange={e => set('age_restriction_min', e.target.value)}
              className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Max Event Capacity
          <span className="ml-2 text-xs text-gray-400">Optional — leave blank if unlimited</span>
        </label>
        <input
          type="number"
          min="1"
          value={formData.max_capacity}
          onChange={e => set('max_capacity', e.target.value)}
          placeholder="e.g. 500"
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
    </div>
  )

  const renderStep7 = () => {
    const totalCapacity = formData.ticket_tiers.reduce(
      (sum, t) => sum + (parseInt(t.total_capacity) || 0), 0
    )
    const minPrice = formData.ticket_tiers.length > 0
      ? Math.min(...formData.ticket_tiers.map(t => parseFloat(t.price) || 0))
      : 0
    const isFree = minPrice === 0

    return (
      <div className="space-y-6">
        {editMode && existingStatus === 'published' && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This event is live. Changes you save will be visible to the public immediately.
          </div>
        )}

        <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
          <div className="px-5 py-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Basic Details</h3>
            <p className="text-sm font-semibold text-gray-900">{formData.title || <em className="text-gray-400">Untitled</em>}</p>
            {formData.summary && <p className="mt-1 text-sm text-gray-600">{formData.summary}</p>}
            {formData.tags && <p className="mt-1 text-xs text-gray-400">Tags: {formData.tags}</p>}
          </div>

          <div className="px-5 py-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Date & Time</h3>
            <p className="text-sm text-gray-700">
              {formData.start_date ? new Date(formData.start_date).toLocaleString() : '—'} →{' '}
              {formData.end_date ? new Date(formData.end_date).toLocaleString() : '—'}
            </p>
            <p className="text-xs text-gray-400">{formData.timezone}</p>
          </div>

          <div className="px-5 py-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Location</h3>
            <p className="text-sm text-gray-700 capitalize">{formData.event_type.replace('_', ' ')}</p>
            {formData.venue_name && <p className="text-sm text-gray-600">{formData.venue_name}</p>}
            {formData.venue_city && (
              <p className="text-xs text-gray-400">
                {[formData.venue_city, formData.venue_state, formData.venue_country].filter(Boolean).join(', ')}
              </p>
            )}
          </div>

          <div className="px-5 py-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Tickets</h3>
            <p className="text-sm text-gray-700">
              {formData.ticket_tiers.length} tier{formData.ticket_tiers.length !== 1 ? 's' : ''} · {totalCapacity.toLocaleString()} total capacity
            </p>
            <p className="text-xs text-gray-400">
              {isFree ? 'Free event' : `From ${formData.ticket_tiers[0]?.currency} ${minPrice.toFixed(2)}`}
            </p>
          </div>

          <div className="px-5 py-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Settings</h3>
            <p className="text-sm text-gray-700 capitalize">{formData.visibility}</p>
            {formData.is_age_restricted && (
              <p className="text-xs text-gray-400">Age restricted: {formData.age_restriction_min}+</p>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => handleSubmit('draft')}
            disabled={isSubmitting}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? 'Saving…' : 'Save as Draft'}
          </button>
          <button
            type="button"
            onClick={() => handleSubmit('published')}
            disabled={isSubmitting || !formData.title.trim()}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? 'Publishing…' : editMode ? 'Save Changes' : 'Publish Now'}
          </button>
        </div>
      </div>
    )
  }

  const stepContent = [
    renderStep1,
    renderStep2,
    renderStep3,
    renderStep4,
    renderStep5,
    renderStep6,
    renderStep7,
  ]

  return (
    <div className="mx-auto max-w-2xl">
      {/* Step indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-500">Step {step} of {STEPS.length}</span>
          <span className="text-sm font-medium text-gray-900">{STEPS[step - 1]}</span>
        </div>
        <div className="flex gap-1">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i < step ? 'bg-blue-600' : i === step - 1 ? 'bg-blue-400' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">{STEPS[step - 1]}</h2>
        {stepContent[step - 1]()}
      </div>

      {/* Navigation */}
      {step < 7 && (
        <div className="mt-6 flex justify-between">
          <button
            type="button"
            onClick={() => setStep(s => Math.max(s - 1, 1))}
            disabled={step === 1}
            className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:invisible transition-colors"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => setStep(s => Math.min(s + 1, 7))}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Continue
          </button>
        </div>
      )}

      {step === 7 && (
        <div className="mt-6 flex justify-start">
          <button
            type="button"
            onClick={() => setStep(s => Math.max(s - 1, 1))}
            className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Back
          </button>
        </div>
      )}
    </div>
  )
}
