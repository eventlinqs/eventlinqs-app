'use client'

import { useEffect, useState } from 'react'

interface Prefs {
  push_enabled: boolean
  email_enabled: boolean
  quiet_hours_start: number | null
  quiet_hours_end: number | null
  timezone: string
}

const TIMEZONES = [
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Brisbane',
  'Australia/Adelaide',
  'Australia/Perth',
  'Australia/Hobart',
  'Australia/Darwin',
] as const

const HOURS = Array.from({ length: 24 }, (_, h) => h)

function hourLabel(h: number): string {
  const period = h < 12 ? 'am' : 'pm'
  const display = h % 12 === 0 ? 12 : h % 12
  return `${display}:00 ${period}`
}

/**
 * Channel preferences (SPEC 3.5): email alerts on or off, quiet hours, and
 * timezone. The columns have existed in notification_prefs since the alert
 * engine landed; this surfaces them. Push enablement itself lives in
 * EnableAlerts (the browser-permission flow); this form governs the email
 * channel and the send-time window for both.
 */
export function ChannelPrefs() {
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/notifications/prefs')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { ok?: boolean; prefs?: Prefs } | null) => {
        if (active && d?.ok && d.prefs) setPrefs(d.prefs)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  if (!prefs) {
    return (
      <div className="rounded-xl border border-ink-200 bg-white p-6">
        <div className="h-5 w-40 animate-pulse rounded bg-ink-100" />
        <div className="mt-3 h-4 w-64 animate-pulse rounded bg-ink-100" />
      </div>
    )
  }

  const save = async (next: Prefs) => {
    setPrefs(next)
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const res = await fetch('/api/notifications/prefs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next),
      })
      if (!res.ok) throw new Error('save failed')
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1800)
    } catch {
      setError('Could not save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-6">
      <h2 className="text-base font-semibold text-ink-900">Email alerts and quiet hours</h2>
      <p className="mt-1 text-sm text-ink-600">
        When push is unavailable we fall back to email, and nothing is sent inside your quiet
        hours.
      </p>

      <label className="mt-4 flex min-h-[44px] cursor-pointer items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink-900">Email alerts</span>
        <input
          type="checkbox"
          checked={prefs.email_enabled}
          onChange={(e) => save({ ...prefs, email_enabled: e.target.checked })}
          className="h-5 w-5 rounded border-ink-200 text-gold-500 focus:ring-2 focus:ring-gold-400"
        />
      </label>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs font-medium text-ink-600">Quiet from</span>
          <select
            value={prefs.quiet_hours_start ?? ''}
            onChange={(e) =>
              save({
                ...prefs,
                quiet_hours_start: e.target.value === '' ? null : Number(e.target.value),
              })
            }
            className="mt-1 block h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/20"
          >
            <option value="">No quiet hours</option>
            {HOURS.map((h) => (
              <option key={h} value={h}>{hourLabel(h)}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-ink-600">Quiet until</span>
          <select
            value={prefs.quiet_hours_end ?? ''}
            onChange={(e) =>
              save({
                ...prefs,
                quiet_hours_end: e.target.value === '' ? null : Number(e.target.value),
              })
            }
            className="mt-1 block h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/20"
          >
            <option value="">No quiet hours</option>
            {HOURS.map((h) => (
              <option key={h} value={h}>{hourLabel(h)}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-ink-600">Timezone</span>
          <select
            value={prefs.timezone}
            onChange={(e) => save({ ...prefs, timezone: e.target.value })}
            className="mt-1 block h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/20"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz.replace('Australia/', '')}</option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-3 min-h-[20px] text-xs" role="status">
        {error ? (
          <span className="text-error">{error}</span>
        ) : saved ? (
          <span className="text-ink-600">Saved.</span>
        ) : saving ? (
          <span className="text-ink-400">Saving</span>
        ) : null}
      </p>
    </div>
  )
}
