import { describe, expect, test } from 'vitest'
import { judgeKey, planEndpointMoves, WEBHOOK_PATH } from '../../../scripts/ops/point-stripe-test-webhook.mjs'

/**
 * STRIPE'S TEST WEBHOOKS WERE LANDING ON JULY CODE. Close-out D2, 12 September
 * 2026: every POST /api/webhooks/stripe on the TEST account reached the branch
 * alias of feat/walkthrough-defects (built from f8d85e9f), so a confirmed sale
 * on a current preview wrote no ledger row and a refund would never reach the
 * recovery engine. The script that moves the endpoints is the founder's one
 * command (he holds the only working TEST key); these hold its decisions.
 */

const OLD = 'https://eventlinqs-app-git-feat-walkthr-37f703-lawals-projects-c20c0be8.vercel.app'
const NEW = 'https://eventlinqs-app-git-verify-l5-la-11db7d-lawals-projects-c20c0be8.vercel.app'

describe('which endpoints move', () => {
  test('a preview endpoint on the old alias moves to the target, keeping its id and path', () => {
    const plan = planEndpointMoves([{ id: 'we_1', url: `${OLD}${WEBHOOK_PATH}`, enabled_events: ['payment_intent.succeeded', 'charge.refunded'], status: 'enabled' }], NEW)
    expect(plan.moves).toEqual([{ id: 'we_1', from: `${OLD}${WEBHOOK_PATH}`, to: `${NEW}${WEBHOOK_PATH}`, events: 2, status: 'enabled' }])
    expect(plan.untouched).toEqual([])
  })

  test('an endpoint that is not on a Vercel preview host is never touched, whatever the target', () => {
    // The production host is declared once in src/lib/site-url.ts and is not
    // typed here either: any non-preview host is left alone, by shape.
    const plan = planEndpointMoves(
      [
        { id: 'we_prod', url: `https://www.example-canonical-host.test${WEBHOOK_PATH}` },
        { id: 'we_custom', url: `https://tickets.example.test${WEBHOOK_PATH}` },
      ],
      NEW,
    )
    expect(plan.moves).toEqual([])
    expect(plan.untouched.map((u) => u.why)).toEqual([
      'not a Vercel preview host, so production or a custom domain; never touched by this script',
      'not a Vercel preview host, so production or a custom domain; never touched by this script',
    ])
  })

  test('an endpoint already at the target, and one on another path, are left alone and say why', () => {
    const plan = planEndpointMoves(
      [
        { id: 'we_same', url: `${NEW}${WEBHOOK_PATH}` },
        { id: 'we_other', url: `${OLD}/api/webhooks/something-else` },
      ],
      NEW,
    )
    expect(plan.moves).toEqual([])
    expect(plan.untouched.find((u) => u.id === 'we_same')?.why).toBe('already at the target')
    expect(plan.untouched.find((u) => u.id === 'we_other')?.why).toContain(WEBHOOK_PATH)
  })

  test('both endpoints at one old alias move together, which is the shape this account has', () => {
    const plan = planEndpointMoves(
      [
        { id: 'we_account', url: `${OLD}${WEBHOOK_PATH}` },
        { id: 'we_connect', url: `${OLD}${WEBHOOK_PATH}` },
      ],
      NEW,
    )
    expect(plan.moves.map((m) => m.id)).toEqual(['we_account', 'we_connect'])
  })

  test('a target that is not a Vercel preview host is refused', () => {
    expect(() => planEndpointMoves([], 'https://www.eventlinqs.com.au')).toThrow(/previews only/)
  })
})

describe('which key may run it', () => {
  test('a live key is refused before anything is read', () => {
    expect(judgeKey('sk_live_abc').ok).toBe(false)
    expect(judgeKey('sk_live_abc').reason).toMatch(/LIVE/)
  })

  test('a test key is accepted, and nothing else is', () => {
    expect(judgeKey('sk_test_abc').ok).toBe(true)
    expect(judgeKey('').ok).toBe(false)
    expect(judgeKey('whatever').ok).toBe(false)
  })
})
