'use client'

import { useEffect, useState } from 'react'

type Status =
  | 'checking'
  | 'unsupported'
  | 'unconfigured'
  | 'idle'
  | 'subscribed'
  | 'denied'
  | 'working'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const buffer = new ArrayBuffer(raw.length)
  const out = new Uint8Array(buffer)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/**
 * Push opt-in control. Push is the demand engine's primary alert channel. This
 * registers the push-only service worker, asks permission, subscribes via the
 * VAPID key, and stores the subscription. It degrades gracefully: unsupported
 * browsers and a not-yet-configured VAPID key show a clear state, and email
 * alerts remain the backbone regardless.
 */
export function EnableAlerts() {
  const [status, setStatus] = useState<Status>('checking')

  useEffect(() => {
    let active = true
    // Resolve the initial state off the effect's synchronous path: every
    // setState happens in the promise callback below, never in the effect body.
    const resolve = async (): Promise<Status> => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        return 'unsupported'
      }
      if (!VAPID_PUBLIC_KEY) return 'unconfigured'
      if (Notification.permission === 'denied') return 'denied'
      const reg = await navigator.serviceWorker.getRegistration('/push-sw.js')
      const sub = await reg?.pushManager.getSubscription()
      return sub ? 'subscribed' : 'idle'
    }
    resolve()
      .then((s) => {
        if (active) setStatus(s)
      })
      .catch(() => {
        if (active) setStatus('idle')
      })
    return () => {
      active = false
    }
  }, [])

  async function enable() {
    if (!VAPID_PUBLIC_KEY) return
    setStatus('working')
    try {
      const reg = await navigator.serviceWorker.register('/push-sw.js')
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'idle')
        return
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      })
      setStatus(res.ok ? 'subscribed' : 'idle')
    } catch {
      setStatus('idle')
    }
  }

  async function disable() {
    setStatus('working')
    try {
      const reg = await navigator.serviceWorker.getRegistration('/push-sw.js')
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setStatus('idle')
    } catch {
      setStatus('subscribed')
    }
  }

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
