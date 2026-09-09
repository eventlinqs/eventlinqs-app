'use client'

import { usePushSubscription } from '@/components/notifications/use-push-subscription'

/**
 * ARM THE SECOND CHANNEL. Close-out UX3.2.
 *
 * Owner notifications go out by email. When email fails three times in a row the
 * worker escalates to Web Push, which shares no vendor, no domain and no rate
 * limit with Resend. That channel only exists once a device has been armed, so
 * the control that arms it sits on the screen the notifications appear on, and
 * it says plainly what happens if nobody presses it.
 */
export function BackupAlerts({ armed }: { armed: number }) {
  const { status, enable, disable } = usePushSubscription(
    'app/admin/notifications/backup-alerts',
  )

  const note =
    status === 'unsupported'
      ? 'This browser cannot receive push. Open the admin console on a browser that can, or the backup channel stays empty.'
      : status === 'unconfigured'
        ? 'Push is not configured on this deployment (the VAPID keys are absent), so the backup channel cannot be armed here.'
        : status === 'denied'
          ? 'Notifications are blocked for this site in your browser settings. Allow them, then press the button again.'
          : armed === 0
            ? 'No device is armed. If email delivery fails, a notification will be recorded as failed and shown in red below, and nothing will reach you until you open this page.'
            : `${armed} device${armed === 1 ? '' : 's'} armed.`

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-5">
      <p className="font-display text-sm uppercase tracking-widest text-white/60">Backup channel</p>
      <p className="mt-2 text-sm text-white/60">
        Notifications are emailed. If email fails three times, they are pushed to the devices armed
        here instead. Push does not share a vendor, a domain or a rate limit with email, so the two
        cannot fail together for the same reason.
      </p>
      <p className={`mt-3 text-sm ${armed === 0 ? 'text-amber-300' : 'text-white/50'}`}>{note}</p>
      <div className="mt-4">
        {status === 'subscribed' ? (
          <button
            type="button"
            onClick={disable}
            className="inline-flex h-11 items-center rounded-lg border border-white/15 bg-white/[0.04] px-4 text-sm font-semibold text-white outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
          >
            Disarm this device
          </button>
        ) : (
          <button
            type="button"
            onClick={enable}
            disabled={
              status === 'working' ||
              status === 'checking' ||
              status === 'unsupported' ||
              status === 'unconfigured' ||
              status === 'denied'
            }
            className="inline-flex h-11 items-center rounded-lg bg-[var(--brand-accent)] px-4 text-sm font-semibold text-ink-900 outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === 'working' ? 'Arming' : 'Arm backup alerts on this device'}
          </button>
        )}
      </div>
    </div>
  )
}
