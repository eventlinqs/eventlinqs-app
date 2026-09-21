import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveDiscountCents } from '@/lib/payments/discount-math'
import { withBuildRetry } from '@/lib/supabase/build-retry'
import type { DiscountCode } from '@/types/database'

/**
 * WHETHER A BUYER MAY HAVE A DISCOUNT CODE, AND WHAT IT IS WORTH.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A MODULE RATHER THAN A BLOCK INSIDE THE SERVER ACTION.
 *
 * The decision reads the database twice, and both reads are the kind that
 * cannot be driven from a browser: the caller is a server action, so nothing
 * outside the server process can make one of those reads fail on cue. A defect
 * that only appears when a read fails is therefore a defect nobody can
 * photograph while it lives inside `'use server'`.
 *
 * With the client passed in, `scripts/verify/a-blinked-cap-is-not-a-granted-discount-drive.mjs`
 * calls this against the real TEST project with `globalThis.fetch` wrapped, so
 * every branch below is driven rather than argued.
 *
 * ---------------------------------------------------------------------------
 * THE CLIENT IS THE SERVICE ROLE, AND THAT IS THE WHOLE FEATURE, NOT A SHORTCUT.
 *
 * Until 21 September 2026 this ran on the SESSION client, and every discount
 * code on the platform was dead. Asked of the live TEST database rather than
 * read off the source:
 *
 *     select policyname, cmd from pg_policies
 *      where schemaname='public' and tablename='discount_codes'
 *
 *       Org members can manage discount codes    ALL
 *       Service role manages discount codes      ALL
 *
 *   and `discount_code_usages` carries exactly one, `Service role manages
 *   discount usages`. Neither table admits a BUYER, which is correct: a code is
 *   a secret, and a SELECT policy wide enough for a buyer to check theirs is
 *   wide enough for anybody to list every code on an event, including the comp
 *   and press codes an organiser never meant to publish.
 *
 *   So under the session client the lookup matched zero rows, `.maybeSingle()`
 *   answered `{ data: null, error: null }`, and the branch below said "Invalid
 *   discount code" to a buyer holding a live code. DRIVEN, on the real checkout
 *   screen, signed in as a real buyer, at 390, 768 and 1440, against two codes
 *   this drive had just written: both were called invalid
 *   (C:/dev/EVIDENCE/LB-CODEBLINK/rls-red-report.json). The per-user cap
 *   underneath it counted zero for the same reason, so it had never refused
 *   anybody either.
 *
 *   THE ANSWER IS NOT A WIDER POLICY. It is that this read belongs to the
 *   server and never to the buyer. Nothing here hands the row out: the result
 *   is `{ valid, discount_cents, discount_code_id }`. A buyer can test the one
 *   code they typed against the one event they are buying, which is exactly the
 *   capability the feature is, and can enumerate nothing, because the lookup is
 *   an equality match on the code itself.
 *
 * ---------------------------------------------------------------------------
 * AND THE USER ID IS RESOLVED FROM THE SESSION, NEVER ACCEPTED FROM A CALLER.
 *
 * The moment the cap read became real it also became worth cheating. The buyer
 * facing caller is a client component, so a `user_id` argument that travels
 * from the browser is a number the browser chooses: send null, or send a
 * stranger's id, and the per-user cap counts nothing. `max_uses_per_user` is
 * held NOWHERE ELSE (`claim_discount_use` takes a row lock on `max_uses` and is
 * not even passed a user), so that is the whole cap gone.
 *
 * The server action therefore resolves the signed-in user itself and passes it
 * here. This module documents `user_id` as TRUSTED: whoever calls it is
 * promising the value came from a session rather than from a request body.
 *
 * ---------------------------------------------------------------------------
 * A READ THAT FAILED IS NEVER A VERDICT ABOUT THE CODE OR ABOUT THE BUYER.
 *
 * Both reads below were written so that a dropped socket answered a question
 * nobody had asked, and the two answers pointed in opposite directions. Driven
 * against the real TEST project on 21 September 2026 and recorded in
 * C:/dev/EVIDENCE/LB-CODEBLINK/red-report.json:
 *
 *   THE PER-USER CAP FAILED OPEN.
 *
 *       const { count } = await supabase.from('discount_code_usages')...
 *       if ((count ?? 0) >= dc.max_uses_per_user) return refused
 *
 *   supabase-js resolves a PostgREST failure as `{ data: null, error, count:
 *   null }`. A dropped socket landed `count = null`, `?? 0` made it zero, and
 *   zero is under every cap an organiser can set, so the buyer was handed a
 *   discount they had already spent. The red reading is literal:
 *   `valid=true discount=1000c` for a buyer whose one permitted use was
 *   already in `discount_code_usages`.
 *
 *   AND max_uses_per_user IS HELD NOWHERE ELSE. The `max_uses` test above it is
 *   genuinely advisory, because `claim_discount_use` (migration
 *   20260829000003) re-tests that cap under a row lock. That function does not
 *   read max_uses_per_user and is not even passed a user id, so this clause is
 *   not a copy of a binding rule. It IS the rule. On the configuration the
 *   create form defaults to, `max_uses_per_user = 1` with `max_uses` left null,
 *   a blink is an uncapped code and there is nothing underneath to catch it.
 *
 *   THE CODE LOOKUP FAILED CLOSED, AND SAID SOMETHING FALSE.
 *
 *       if (error || !dc) return { error: 'Invalid discount code' }
 *
 *   `.maybeSingle()` answers `{ data: null, error: null }` for a code that does
 *   not exist, so the two cases were always distinguishable and were being
 *   collapsed anyway. A buyer holding a code off an organiser's flyer was told
 *   the code was invalid, which is a statement about the organiser rather than
 *   about the network.
 *
 * WHAT REPLACED BOTH. Each read retries a transient fault through
 * `withBuildRetry`, which already recognises `fetch failed`, `ECONNRESET`,
 * `ETIMEDOUT`, pool exhaustion and statement timeouts, and only then decides.
 * A read that still failed returns `DISCOUNT_UNCHECKABLE`, which grants
 * nothing and accuses nobody. The empty-but-successful answer keeps its old
 * words, because a buyer with a typo must still be told the code is wrong
 * rather than invited to keep trying.
 */

/**
 * The one sentence for a read that could not be made. It says what happened,
 * asks for the one thing that helps, and makes no claim about the code or the
 * person. It is deliberately NOT 'Invalid discount code' and deliberately not
 * silence.
 */
export const DISCOUNT_UNCHECKABLE = 'We could not check that code just now. Please try again.'

export interface ValidateDiscountResult {
  valid: boolean
  discount_cents: number
  discount_code_id?: string
  error?: string
}

export interface ValidateDiscountInput {
  code: string
  event_id: string
  /**
   * TRUSTED. The signed-in buyer, resolved by the caller from the SESSION, or
   * null for a guest. Never a value that arrived from a browser: it decides the
   * per-user cap, and that cap is held nowhere else.
   */
  user_id: string | null
  order_subtotal_cents: number
  tier_ids: string[]
}

export async function validateDiscountCodeWith(
  /**
   * A client that can SEE `discount_codes` and `discount_code_usages`. Both are
   * service-role-only by policy, so in the product this is the admin client and
   * in a drive it is a service-role client. A session client reads zero rows
   * from both and turns every live code into "Invalid discount code".
   */
  supabase: SupabaseClient,
  { code, event_id, user_id, order_subtotal_cents, tier_ids }: ValidateDiscountInput,
): Promise<ValidateDiscountResult> {
  const { data: dc, error } = await withBuildRetry(
    () =>
      supabase
        .from('discount_codes')
        .select('*')
        .eq('code', code.toUpperCase().trim())
        .eq('event_id', event_id)
        .maybeSingle() as unknown as PromiseLike<{ data: DiscountCode | null; error: unknown }>,
    { label: 'discount-code-lookup' },
  )

  if (error) {
    console.error('[discount-validation] could not read the code, so no verdict is given about it:', error)
    return { valid: false, discount_cents: 0, error: DISCOUNT_UNCHECKABLE }
  }
  if (!dc) return { valid: false, discount_cents: 0, error: 'Invalid discount code' }

  if (!dc.is_active) return { valid: false, discount_cents: 0, error: 'This code is no longer active' }

  const now = new Date().toISOString()
  if (dc.valid_from && dc.valid_from > now) return { valid: false, discount_cents: 0, error: 'This code is not yet active' }
  if (dc.valid_until && dc.valid_until < now) return { valid: false, discount_cents: 0, error: 'This code has expired' }

  /*
   * THE CAP COUNTS HELD USES AS WELL AS CONFIRMED ONES.
   *
   * This used to read `dc.current_uses >= dc.max_uses`, and current_uses only
   * moves after an order is CONFIRMED. So two buyers arriving at the same time
   * both read 0, both passed this test, and both were granted the discount;
   * only one of them ever advanced the counter. The counter was bounded and the
   * money was not. Measured on 29 August 2026: on a code capped at 1, the second
   * buyer still paid the discounted price and the organiser still lost the
   * difference.
   *
   * reserved_uses is the hold, taken by claim_discount_use under a row lock at
   * the moment the code is applied to a reservation (migration 20260829000003),
   * and released when that reservation lapses. Reading it here is what makes the
   * second buyer see the code as exhausted while the first is still paying.
   *
   * This read is still only advisory: it is what the BUYER is told. The binding
   * decision is the claim itself, because only the claim holds a lock. A check
   * without a claim is exactly what this defect was.
   */
  const heldAndUsed = (dc.current_uses ?? 0) + (dc.reserved_uses ?? 0)
  if (dc.max_uses !== null && heldAndUsed >= dc.max_uses) {
    return { valid: false, discount_cents: 0, error: 'This code has reached its usage limit' }
  }

  if (user_id && dc.max_uses_per_user > 0) {
    const spend = (await withBuildRetry(
      () =>
        supabase
          .from('discount_code_usages')
          .select('*', { count: 'exact', head: true })
          .eq('discount_code_id', dc.id)
          .eq('user_id', user_id) as unknown as PromiseLike<{ data: null; error: unknown }>,
      { label: 'discount-per-user-cap' },
    )) as { error: unknown; count?: number | null }

    /*
     * FAIL CLOSED, AND IT IS THE ONLY SAFE DIRECTION HERE. Granting a discount
     * is giving away the organiser's money, and this clause is the only thing
     * holding their per-person limit. A read that could not be made is not
     * evidence that the buyer has spent nothing.
     */
    if (spend.error) {
      console.error('[discount-validation] could not count this buyer past uses, so the cap is not granted away:', spend.error)
      return { valid: false, discount_cents: 0, error: DISCOUNT_UNCHECKABLE }
    }

    if ((spend.count ?? 0) >= dc.max_uses_per_user) {
      return { valid: false, discount_cents: 0, error: "You've already used this code" }
    }
  }

  if (dc.min_order_amount_cents !== null && order_subtotal_cents < dc.min_order_amount_cents) {
    const minFormatted = (dc.min_order_amount_cents / 100).toFixed(2)
    return { valid: false, discount_cents: 0, error: `Minimum order of $${minFormatted} required for this code` }
  }

  if (dc.applicable_tier_ids !== null && dc.applicable_tier_ids.length > 0) {
    const hasMatchingTier = tier_ids.some((id: string) => dc.applicable_tier_ids!.includes(id))
    if (!hasMatchingTier) {
      return { valid: false, discount_cents: 0, error: "This code doesn't apply to your selected tickets" }
    }
  }

  /*
   * THE AMOUNT, through the one pure function that owns this arithmetic.
   *
   * This read `dc.discount_value`, a column migration 20260520000001 (P1-4)
   * DROPPED and split in two. The field was simply `undefined`, so a percentage
   * code computed NaN and a fixed code returned undefined, and BOTH were handed
   * back as `valid: true`. The math now lives in src/lib/payments/discount-math.ts
   * where it is tested against every shape the table allows.
   */
  const amount = resolveDiscountCents(dc, order_subtotal_cents)
  if (!amount.ok) return { valid: false, discount_cents: 0, error: amount.reason }

  return { valid: true, discount_cents: amount.discount_cents, discount_code_id: dc.id }
}
