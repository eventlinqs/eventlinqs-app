// The push opt-in waits for an ACTIVE service worker, and says so when it fails.
//
// Close-out UX3.2. Found on 11 September 2026 by driving the admin backup-alert
// control in a fresh Chrome profile: every FIRST press failed and the screen
// said nothing at all. Two defects, one press.
//
//   THE RACE. `register()` resolves when the REGISTRATION exists, not when its
//   worker is running. `pushManager.subscribe()` on a registration with no
//   active worker throws, and Chrome names it exactly:
//     AbortError: Failed to execute 'subscribe' on 'PushManager':
//     Subscription failed - no active Service Worker
//   A second press worked, because by then the worker had activated on its own.
//   A first press is the only press most people make.
//
//   THE SILENCE. The catch set status to 'idle', which is the state the control
//   shows before anybody presses anything, and the error went to
//   `reportClientError` - which on a production build with no Sentry sink queues
//   it in memory where nobody reads it. So a press that failed and a press that
//   never happened were indistinguishable, on screen and in every log.
//
// These tests hold both halves. The fakes below are the browser's OWN state
// machine (installing -> activated), not a stand-in for the product.

import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/*
 * IMPORTED DYNAMICALLY, AFTER THE KEY IS SET, and the reason is the product's
 * own shape rather than a test convenience. The hook reads
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY at MODULE scope, because Next inlines a
 * NEXT_PUBLIC_ value into the client bundle at build time and a module constant
 * is the honest expression of that. A static import here would evaluate the
 * module before any beforeEach could set the variable, and every test would read
 * 'unconfigured' - which is what the first run of this file did.
 */
process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'BCMSp3WYHM0wOo9O1iGBhINtqE8'
const { usePushSubscription } = await import('@/components/notifications/use-push-subscription')

type Listener = () => void

/** A worker that starts life installing and activates only when told to. */
function fakeWorker() {
  const listeners: Listener[] = []
  return {
    state: 'installing' as string,
    addEventListener: (_: string, fn: Listener) => listeners.push(fn),
    removeEventListener: (_: string, fn: Listener) => {
      const i = listeners.indexOf(fn)
      if (i >= 0) listeners.splice(i, 1)
    },
    /** Move to a terminal state and fire statechange, as the browser does. */
    settle(next: 'activated' | 'redundant') {
      this.state = next
      for (const fn of [...listeners]) fn()
    },
    activate() {
      this.settle('activated')
    },
  }
}

type Harness = {
  subscribeCalls: number
  worker: ReturnType<typeof fakeWorker>
  registration: Record<string, unknown>
}

/**
 * Install a browser whose worker is STILL INSTALLING when register() resolves,
 * which is the state a device that has never armed before is always in.
 */
function installBrowser(options: { subscribeNeedsActive?: boolean; subscribeOk?: boolean } = {}): Harness {
  const { subscribeNeedsActive = true, subscribeOk = true } = options
  const worker = fakeWorker()
  const harness: Harness = { subscribeCalls: 0, worker, registration: {} }

  const registration = {
    get active() {
      return worker.state === 'activated' ? worker : null
    },
    get installing() {
      return worker.state === 'installing' ? worker : null
    },
    waiting: null,
    pushManager: {
      subscribe: async () => {
        harness.subscribeCalls += 1
        if (subscribeNeedsActive && worker.state !== 'activated') {
          throw new Error("Failed to execute 'subscribe' on 'PushManager': Subscription failed - no active Service Worker")
        }
        if (!subscribeOk) throw new Error('subscribe refused')
        return {
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
          toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'p', auth: 'a' } }),
          unsubscribe: async () => true,
        }
      },
      getSubscription: async () => null,
    },
  }
  harness.registration = registration as unknown as Record<string, unknown>

  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    configurable: true,
    value: {
      register: async () => registration,
      getRegistration: async () => registration,
      ready: Promise.resolve(registration),
    },
  })
  // @ts-expect-error the test installs the browser API the hook feature-detects.
  globalThis.PushManager = function PushManagerStub() {}
  // @ts-expect-error same.
  globalThis.Notification = {
    permission: 'default',
    requestPermission: async () => 'granted',
  }
  return harness
}

/** The smallest possible consumer: it renders exactly what the hook returns. */
function Probe() {
  const { status, reason, enable } = usePushSubscription('tests/component/push-subscription')
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="reason">{reason ?? ''}</p>
      <button type="button" onClick={enable}>
        Arm
      </button>
    </div>
  )
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('arming push on a device that has never armed before', () => {
  test('does not subscribe while the worker is still installing', async () => {
    const h = installBrowser()
    render(<Probe />)
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('idle'))

    await userEvent.click(screen.getByRole('button', { name: 'Arm' }))
    // The press is in flight and the worker has NOT activated. Before the fix
    // this is exactly where subscribe() was called and threw.
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('working'))
    expect(h.subscribeCalls).toBe(0)

    h.worker.activate()
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('subscribed'))
    expect(h.subscribeCalls).toBe(1)
  })

  test('subscribes immediately when the worker is already active', async () => {
    const h = installBrowser()
    h.worker.activate()
    render(<Probe />)
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('idle'))

    await userEvent.click(screen.getByRole('button', { name: 'Arm' }))
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('subscribed'))
    expect(h.subscribeCalls).toBe(1)
  })

  test('a worker that goes redundant ends the wait instead of hanging the button', async () => {
    const h = installBrowser({ subscribeNeedsActive: true })
    render(<Probe />)
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('idle'))
    await userEvent.click(screen.getByRole('button', { name: 'Arm' }))
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('working'))

    // The same statechange listener settles on 'redundant', so subscribe() runs
    // and throws its own honest error rather than the control waiting for ever.
    h.worker.settle('redundant')
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('error'))
    expect(screen.getByTestId('reason').textContent).toContain('no active Service Worker')
    expect(h.subscribeCalls).toBe(1)
  })
})

describe('a press that fails is never shown as a press that did not happen', () => {
  test('a rejected subscribe reports error with the browser reason', async () => {
    const h = installBrowser({ subscribeNeedsActive: false, subscribeOk: false })
    h.worker.activate()
    render(<Probe />)
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('idle'))

    await userEvent.click(screen.getByRole('button', { name: 'Arm' }))
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('error'))
    expect(screen.getByTestId('reason').textContent).toContain('subscribe refused')
    expect(h.subscribeCalls).toBe(1)
  })

  test('a server that will not save the device reports error with its status code', async () => {
    const h = installBrowser()
    h.worker.activate()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 500 })),
    )
    render(<Probe />)
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('idle'))

    await userEvent.click(screen.getByRole('button', { name: 'Arm' }))
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('error'))
    expect(screen.getByTestId('reason').textContent).toContain('500')
  })

  test('and "error" is not "idle", so the two presses can never look alike', async () => {
    const h = installBrowser({ subscribeNeedsActive: false, subscribeOk: false })
    h.worker.activate()
    render(<Probe />)
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('idle'))
    await userEvent.click(screen.getByRole('button', { name: 'Arm' }))
    await waitFor(() => expect(screen.getByTestId('status').textContent).not.toBe('idle'))
  })
})
