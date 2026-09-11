'use client'

import { useCallback, useEffect, useState } from 'react'
import { reportClientError } from '@/lib/observability/client-error-report'

/**
 * THE PUSH OPT-IN, AS ONE IMPLEMENTATION.
 *
 * Extracted from components/notifications/enable-alerts.tsx when the admin
 * console needed the same subscribe flow for the owner's backup alert channel
 * (close-out UX3.2). The two surfaces look nothing alike - one is the light
 * attendee card, one is the dark admin panel - but the part that can go wrong is
 * identical: register the service worker, ask permission, convert the VAPID key,
 * subscribe, and persist. A second copy of that would be a second place a
 * subscription can be written in a shape the server does not expect.
 *
 * So the LOGIC lives here once and the two components are presentation only.
 */

export type PushStatus =
  | 'checking'
  | 'unsupported'
  | 'unconfigured'
  | 'idle'
  | 'subscribed'
  | 'denied'
  | 'working'
  /** The press was made, it was refused, and the control must say so. */
  | 'error'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

/**
 * WAIT FOR AN ACTIVE WORKER BEFORE SUBSCRIBING. This is not a nicety.
 *
 * `register()` resolves as soon as the REGISTRATION exists, which on a device
 * that has never armed before is while the worker is still installing.
 * `pushManager.subscribe()` on a registration with no active worker throws, and
 * Chrome says exactly that:
 *
 *   AbortError: Failed to execute 'subscribe' on 'PushManager':
 *   Subscription failed - no active Service Worker
 *
 * Found on 11 September 2026 by driving the admin backup-alert control in a
 * fresh Chrome profile (close-out UX3.2). Every FIRST press failed, on both
 * surfaces this hook serves, and the second press worked because by then the
 * worker had activated on its own. A first press is the only press most people
 * make, so in practice the channel could not be armed at all.
 *
 * It waits on THIS registration's own worker rather than on
 * `navigator.serviceWorker.ready`, because `ready` resolves for whichever
 * registration matches the PAGE's scope. The door scanner registers a second
 * worker (`/scan-sw.js` at scope `/scan/`) and a page under that scope would
 * hand back the wrong one.
 *
 * `redundant` ends the wait as well as `activated`: a worker that will never
 * activate must not hang the button for ever. `subscribe()` then throws its own
 * honest error, which the caller now shows.
 */
async function withActiveWorker(
  registration: ServiceWorkerRegistration,
): Promise<ServiceWorkerRegistration> {
  if (registration.active) return registration
  const pending = registration.installing ?? registration.waiting
  if (!pending) return registration
  await new Promise<void>((resolve) => {
    const settle = (): void => {
      if (pending.state === 'activated' || pending.state === 'redundant') {
        pending.removeEventListener('statechange', settle)
        resolve()
      }
    }
    pending.addEventListener('statechange', settle)
    // Re-read once, in case the state moved between the check above and the
    // listener being attached. Without this the wait can miss its own event.
    settle()
  })
  return registration
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const buffer = new ArrayBuffer(raw.length)
  const out = new Uint8Array(buffer)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function usePushSubscription(where: string): {
  status: PushStatus
  /** Why the last press failed, in words a person can act on. */
  reason: string | null
  enable: () => Promise<void>
  disable: () => Promise<void>
} {
  const [status, setStatus] = useState<PushStatus>('checking')
  const [reason, setReason] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    // Resolve the initial state off the effect's synchronous path: every
    // setState happens in the promise callback below, never in the effect body.
    const resolve = async (): Promise<PushStatus> => {
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

  const enable = useCallback(async () => {
    if (!VAPID_PUBLIC_KEY) return
    setStatus('working')
    setReason(null)
    try {
      const reg = await withActiveWorker(await navigator.serviceWorker.register('/push-sw.js'))
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
      if (res.ok) {
        setStatus('subscribed')
        return
      }
      /*
       * A REFUSAL IS SHOWN, NEVER SWALLOWED.
       *
       * This branch used to set 'idle', which is the same state the control
       * shows before anybody presses anything. So a press that failed and a
       * press that never happened looked identical, and the only record of the
       * failure went to `reportClientError` - which, on a production build with
       * no Sentry sink installed, queues it in memory where nobody ever reads
       * it. That is precisely the silent failure close-out UX3.2 forbids, and
       * it was hiding the activation-race defect above for as long as it did.
       */
      setStatus('error')
      setReason(`the server would not save this device (HTTP ${res.status})`)
    } catch (error) {
      reportClientError(error, { where })
      setStatus('error')
      setReason(error instanceof Error ? error.message : String(error))
    }
  }, [where])

  const disable = useCallback(async () => {
    setStatus('working')
    setReason(null)
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
    } catch (error) {
      reportClientError(error, { where })
      setStatus('subscribed')
    }
  }, [where])

  return { status, reason, enable, disable }
}
