'use client'

import { usePushSubscription } from './use-push-subscription'

/**
 * Push opt-in control for attendees. Push is the demand engine's primary alert
 * channel. The subscribe flow itself lives in usePushSubscription so the admin
 * console's backup-alert control cannot drift from it; this file is the attendee
 * presentation and copy. It degrades gracefully: unsupported browsers and a
 * not-yet-configured VAPID key show a clear state, and email alerts remain the
 * backbone regardless.
 */
export function EnableAlerts() {
  const { status, enable, disable } = usePushSubscription('components/notifications/enable-alerts')

  const note =
    status === 'unsupported'
      ? 'This browser does not support push alerts. You will still get email alerts.'
      : status === 'unconfigured'
        ? 'Push alerts are being switched on shortly. Email alerts are already active.'
        : status === 'denied'
          ? 'Notifications are blocked in your browser settings. Allow them to get push alerts.'
          : null

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-5">
      <p className="font-display text-lg font-semibold text-ink-900">Event alerts</p>
      <p className="mt-1 text-sm text-ink-600">
        Get a push the moment an organiser you follow announces a new event, when tickets go on sale,
        and when an event is going fast. Push is instant; email is the backbone.
      </p>

      {note && <p className="mt-3 text-sm text-ink-500">{note}</p>}

      <div className="mt-4">
        {status === 'subscribed' ? (
          <button
            type="button"
            onClick={disable}
            className="inline-flex h-11 items-center rounded-lg border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-900 transition-colors hover:bg-ink-100"
          >
            Turn off push alerts
          </button>
        ) : (
          <button
            type="button"
            onClick={enable}
            disabled={status === 'working' || status === 'checking' || status === 'unsupported' || status === 'unconfigured' || status === 'denied'}
            className="inline-flex h-11 items-center rounded-lg bg-gold-400 px-4 text-sm font-semibold text-ink-900 transition-all hover:-translate-y-0.5 hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === 'working' ? 'Enabling' : 'Enable push alerts'}
          </button>
        )}
      </div>
    </div>
  )
}
