import { describe, it, expect } from 'vitest'
import {
  browserIsOnline,
  describeCheckoutSubmitFailure,
} from '@/lib/checkout/network-failure'

/**
 * Close-out C8B.5, Scope v5 10.3: "Checkout must not fail under poor network
 * conditions."
 *
 * These execute the decision rather than asserting on a rendered string. The
 * driven half of the proof (that the buyer is not thrown to the error boundary
 * and keeps what they typed, at 390, 768 and 1440) is
 * scripts/verify/scope-10-3-audit.mjs; a unit test cannot cut a network.
 */
describe('describeCheckoutSubmitFailure', () => {
  it('calls it offline when the browser knows it has no route', () => {
    expect(describeCheckoutSubmitFailure(false).kind).toBe('offline')
  })

  it('calls it unreachable when the browser believes it is online', () => {
    // navigator.onLine === true only means an interface is up, so the copy must
    // not blame the buyer's connection outright.
    expect(describeCheckoutSubmitFailure(true).kind).toBe('unreachable')
  })

  it('tells the buyer nothing was charged, on both branches', () => {
    for (const online of [true, false]) {
      expect(describeCheckoutSubmitFailure(online).message).toMatch(/nothing has been charged/i)
    }
  })

  it('tells the buyer their details are still on the page, on both branches', () => {
    // This is the sentence the whole fix exists to make true: before it, the
    // error boundary replaced the route segment and every typed value went.
    for (const online of [true, false]) {
      expect(describeCheckoutSubmitFailure(online).message).toMatch(/still on this page/i)
    }
  })

  it('names the network rather than the payment, on both branches', () => {
    // A buyer told "payment failed" on a dropped connection rings their bank.
    for (const online of [true, false]) {
      const { message } = describeCheckoutSubmitFailure(online)
      expect(message).toMatch(/\b(offline|reach|connection)\b/i)
      expect(message).not.toMatch(/payment failed|card was declined/i)
    }
  })

  it('obeys the house copy rules on both branches', () => {
    for (const online of [true, false]) {
      const { message } = describeCheckoutSubmitFailure(online)
      expect(message).not.toMatch(/[–—]/) // no en-dash, no em-dash
      expect(message).not.toContain('!')
    }
  })

  it('gives the two branches different copy, so the distinction is visible to a buyer', () => {
    expect(describeCheckoutSubmitFailure(true).message).not.toBe(
      describeCheckoutSubmitFailure(false).message,
    )
  })
})

describe('browserIsOnline', () => {
  it('assumes online where there is no navigator, so a server render cannot crash', () => {
    // The checkout form renders on the server first. A bare `navigator` read
    // there would replace one crash with another.
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    // @ts-expect-error deleting a global for the duration of one assertion
    delete globalThis.navigator
    try {
      expect(browserIsOnline()).toBe(true)
    } finally {
      if (saved) Object.defineProperty(globalThis, 'navigator', saved)
    }
  })

  it('reports offline only when navigator.onLine is explicitly false', () => {
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true })
    try {
      expect(browserIsOnline()).toBe(false)
    } finally {
      if (saved) Object.defineProperty(globalThis, 'navigator', saved)
      else {
        // @ts-expect-error removing the stand-in we installed
        delete globalThis.navigator
      }
    }
  })

  it('reports online when navigator.onLine is true', () => {
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
    try {
      expect(browserIsOnline()).toBe(true)
    } finally {
      if (saved) Object.defineProperty(globalThis, 'navigator', saved)
      else {
        // @ts-expect-error removing the stand-in we installed
        delete globalThis.navigator
      }
    }
  })
})
