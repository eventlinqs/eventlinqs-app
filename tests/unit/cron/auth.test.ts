// Cron auth helper proof: FAIL CLOSED.
//
// The security invariant under test is that an absent CRON_SECRET locks the
// crons rather than opening them. Every money-moving cron routes through this
// helper, so this is the single guard that prevents a public trigger of
// disbursement/payout/alerts on a deploy that forgot to set the secret.

import { afterEach, describe, expect, test } from 'vitest'
import type { NextRequest } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'

function makeReq(authHeader?: string): NextRequest {
  return {
    headers: {
      get: (k: string) => (k.toLowerCase() === 'authorization' ? authHeader ?? null : null),
    },
  } as unknown as NextRequest
}

const original = process.env.CRON_SECRET
afterEach(() => {
  if (original === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = original
})

describe('requireCronAuth: fail closed', () => {
  test('refuses (401) when CRON_SECRET is unset, even with no auth header', () => {
    delete process.env.CRON_SECRET
    const denied = requireCronAuth(makeReq())
    expect(denied).not.toBeNull()
    expect(denied!.status).toBe(401)
  })

  test('refuses (401) when CRON_SECRET is unset, even if a bearer is supplied', () => {
    delete process.env.CRON_SECRET
    const denied = requireCronAuth(makeReq('Bearer anything'))
    expect(denied).not.toBeNull()
    expect(denied!.status).toBe(401)
  })

  test('refuses (401) when the secret is set but the header is missing', () => {
    process.env.CRON_SECRET = 'sekret'
    const denied = requireCronAuth(makeReq())
    expect(denied!.status).toBe(401)
  })

  test('refuses (401) when the secret is set but the bearer is wrong', () => {
    process.env.CRON_SECRET = 'sekret'
    const denied = requireCronAuth(makeReq('Bearer nope'))
    expect(denied!.status).toBe(401)
  })

  test('admits (null) only when the bearer matches the configured secret', () => {
    process.env.CRON_SECRET = 'sekret'
    const denied = requireCronAuth(makeReq('Bearer sekret'))
    expect(denied).toBeNull()
  })
})
