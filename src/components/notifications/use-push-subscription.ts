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

export function usePushSubscription(where: string): {
  status: PushStatus
  enable: () => Promise<void>
  disable: () => Promise<void>
} {
  const [status, setStatus] = useState<PushStatus>('checking')

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
    } catch (error) {
      reportClientError(error, { where })
      setStatus('idle')
    }
  }, [where])

  const disable = useCallback(async () => {
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
    } catch (error) {
      reportClientError(error, { where })
      setStatus('subscribed')
    }
  }, [where])

  return { status, enable, disable }
}
