import { describe, expect, test } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isUnsubscribeToken, UNSUBSCRIBE_TOKEN_SHAPE } from '@/lib/consent/token'
import { findSubjectByToken } from '@/lib/consent/ledger'
import {
  findDigestUnsubscribeTarget,
  withdrawDigestByAnyToken,
  withdrawOrganiserConsentByToken,
} from '@/lib/consent/record'

/**
 * A MANGLED UNSUBSCRIBE LINK IS NOT AN OUTAGE, AND MUST NOT ANSWER 500.
 *
 * The route sweep in the push gate refused the whole push on 21 September 2026
 * with two lines:
 *
 *     http://127.0.0.1:63687/unsubscribe/zzzzzzzzzzzz: server error 500
 *     http://127.0.0.1:63687/waitlist/unsubscribe/zzzzzzzzzzzz: server error 500
 *
 * `unsubscribe_token` is a uuid column, so `zzzzzzzzzzzz` is not a query that
 * finds nothing: it is `22P02 invalid input syntax for type uuid`, an error,
 * which `readOrThrow` correctly raises because a failed read must never be
 * reported to somebody as "this link has already been used".
 *
 * The shape test is what tells the two apart, and the tests below insist on the
 * part that actually matters: a token that cannot be a token is answered
 * WITHOUT ASKING THE DATABASE AT ALL. An admin client that explodes on contact
 * is the assertion.
 */

/** An admin client that fails the test if anything reaches it. */
function forbiddenAdmin(): { admin: SupabaseClient; touched: () => number } {
  let touches = 0
  const admin = {
    from() {
      touches += 1
      throw new Error('the database was consulted about a token that cannot be a token')
    },
  } as unknown as SupabaseClient
  return { admin, touched: () => touches }
}

/** An admin client that records the read and answers "no such row". */
function emptyAdmin(): { admin: SupabaseClient; tables: string[] } {
  const tables: string[] = []
  const admin = {
    from(table: string) {
      tables.push(table)
      const self: Record<string, unknown> = {}
      const chain = () => self
      self.select = chain
      self.eq = chain
      self.maybeSingle = () => Promise.resolve({ data: null, error: null })
      return self
    },
  } as unknown as SupabaseClient
  return { admin, tables }
}

const WELL_FORMED = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'

describe('the unsubscribe token shape', () => {
  test('a_minted_token_is_a_token', () => {
    expect(isUnsubscribeToken(WELL_FORMED)).toBe(true)
    expect(isUnsubscribeToken(WELL_FORMED.toUpperCase())).toBe(true)
  })

  test('the_value_that_took_the_push_gate_down_is_not_a_token', () => {
    expect(isUnsubscribeToken('zzzzzzzzzzzz')).toBe(false)
  })

  test('near_misses_are_not_tokens', () => {
    for (const value of [
      '',
      ' ',
      WELL_FORMED.slice(0, -1), // one character short
      `${WELL_FORMED}0`, // one character long
      WELL_FORMED.replace('-', ''), // a hyphen gone, which is how a mail client mangles one
      `  ${WELL_FORMED}  `, // whitespace a copy and paste carries in
      '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5g', // g is not hex
      'null',
      'undefined',
    ]) {
      expect(isUnsubscribeToken(value), `${JSON.stringify(value)} was accepted`).toBe(false)
    }
  })

  test('a_value_that_is_not_a_string_is_not_a_token', () => {
    expect(isUnsubscribeToken(null)).toBe(false)
    expect(isUnsubscribeToken(undefined)).toBe(false)
  })

  test('the_shape_is_not_sticky_across_calls', () => {
    /*
     * A `g` flag on a shared RegExp carries `lastIndex` between calls, so the
     * same token alternates true and false. The shape is exported, so this is
     * cheap insurance on a value a person's statutory remedy depends on.
     */
    expect(UNSUBSCRIBE_TOKEN_SHAPE.global).toBe(false)
    expect(isUnsubscribeToken(WELL_FORMED)).toBe(true)
    expect(isUnsubscribeToken(WELL_FORMED)).toBe(true)
    expect(isUnsubscribeToken(WELL_FORMED)).toBe(true)
  })
})

describe('a token that cannot be a token never reaches the database', () => {
  test('findSubjectByToken_answers_without_a_read', async () => {
    const { admin, touched } = forbiddenAdmin()
    await expect(findSubjectByToken(admin, 'zzzzzzzzzzzz')).resolves.toBeNull()
    expect(touched()).toBe(0)
  })

  test('findDigestUnsubscribeTarget_answers_without_a_read', async () => {
    const { admin, touched } = forbiddenAdmin()
    await expect(findDigestUnsubscribeTarget(admin, 'zzzzzzzzzzzz')).resolves.toBeNull()
    expect(touched()).toBe(0)
  })

  test('withdrawDigestByAnyToken_answers_without_a_read', async () => {
    const { admin, touched } = forbiddenAdmin()
    await expect(
      withdrawDigestByAnyToken(admin, 'zzzzzzzzzzzz', new Date().toISOString()),
    ).resolves.toBeNull()
    expect(touched()).toBe(0)
  })

  test('withdrawOrganiserConsentByToken_answers_without_a_read', async () => {
    const { admin, touched } = forbiddenAdmin()
    await expect(
      withdrawOrganiserConsentByToken(admin, 'zzzzzzzzzzzz', new Date().toISOString()),
    ).resolves.toBeNull()
    expect(touched()).toBe(0)
  })

  test('a_well_formed_token_DOES_reach_the_database', async () => {
    /*
     * The control. Without it every test above would still pass if the shape
     * test rejected everything, which would break the links that work.
     */
    const { admin, tables } = emptyAdmin()
    await expect(findSubjectByToken(admin, WELL_FORMED)).resolves.toBeNull()
    expect(tables).toEqual(['marketing_consents', 'city_waitlist_signups'])
  })
})

describe('the consent module keeps one shape test, not five', () => {
  test('no_consent_module_spells_the_uuid_shape_inline_again', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const inline = /\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}/
    for (const file of ['ledger.ts', 'record.ts', 'resolver.ts', 'wording.ts']) {
      const path = join(process.cwd(), 'src', 'lib', 'consent', file)
      let src: string
      try {
        src = readFileSync(path, 'utf8')
      } catch {
        continue
      }
      expect(inline.test(src), `${file} spells the token shape inline again`).toBe(false)
    }
  })
})

/**
 * The route-level behaviour (a mangled link renders "This link is not valid"
 * at 200 rather than a 500) is proven by driving both URLs at 390, 768 and
 * 1440 in scripts/verify/unsubscribe-mangled-link-drive.mjs, and by the route
 * sweep in the push gate, which is the check that found this in the first
 * place. A unit test cannot render a server component against a real database.
 */