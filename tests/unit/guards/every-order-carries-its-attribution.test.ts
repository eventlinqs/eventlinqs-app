import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { orderInsertCount, captureCallCount } from '../../../scripts/guards/lib/order-insert-sites.mjs'
import { resolutionGraceMs, BACKSTOP_SOURCE } from '../../../scripts/guards/lib/attribution-grace.mjs'

/**
 * THE GUARD THAT SAYS EVERY ORDER CARRIES ITS ATTRIBUTION RECORD, DRIVEN OVER
 * TEXT WRITTEN TO FOOL IT.
 *
 * The guard itself is drilled red three ways against the real tree in
 * scripts/verify/guard-failure-drills.mjs. What a drill cannot easily do is
 * prove the counting is not merely GENEROUS: a guard that counted every
 * `from('orders')` as an insert would also pass on a correct tree, and it would
 * pass for the wrong reason, which is the failure mode that survives longest
 * because it looks identical to working.
 *
 * So both directions are here. Every FALSE POSITIVE below is a real shape from
 * src/app/actions/checkout.ts, which selects, inserts and deletes from `orders`
 * inside one function.
 */

describe('counting the places an order is created', () => {
  it('counts a plain insert', () => {
    expect(orderInsertCount(`await adminClient.from('orders').insert({ id })`)).toBe(1)
  })

  it('counts an insert that is chained across lines, which is how every call site is written', () => {
    const source = `
  const { error: orderError } = await adminClient
    .from('orders')
    .insert({
      id: order_id,
    })
`
    expect(orderInsertCount(source)).toBe(1)
  })

  it('counts both inserts in a file that creates orders on two paths', () => {
    const source = `
  await adminClient.from('orders').insert({ id: a })
  await adminClient
    .from('orders')
    .insert({ id: b })
`
    expect(orderInsertCount(source)).toBe(2)
  })

  it('does NOT count the uniqueness SELECT that sits directly above every insert', () => {
    const source = `
  const { data: existingOrder } = await supabase
    .from('orders')
    .select('id')
    .eq('order_number', order_number)
    .maybeSingle()
`
    expect(orderInsertCount(source)).toBe(0)
  })

  it('does NOT count the rollback DELETE that sits below every insert', () => {
    expect(orderInsertCount(`await adminClient.from('orders').delete().eq('id', order_id)`)).toBe(0)
  })

  it('does NOT count an insert into a different table whose name merely contains orders', () => {
    const source = `
  await adminClient.from('order_items').insert({ id })
  await adminClient.from('refund_orders').insert({ id })
`
    expect(orderInsertCount(source)).toBe(0)
  })

  it('counts a double-quoted table name, because the codebase is not required to be uniform', () => {
    expect(orderInsertCount(`await c.from("orders").insert({})`)).toBe(1)
  })

  it('finds nothing in a file that never touches orders', () => {
    expect(orderInsertCount(`export function nothing() { return 1 }`)).toBe(0)
  })
})

describe('counting the calls to the write-time capture', () => {
  const NAME = 'recordClickSignalForOrder'

  it('counts a call', () => {
    expect(captureCallCount(`  await ${NAME}(order_id)`, NAME)).toBe(1)
  })

  it('does NOT count the import line, so importing without calling is still caught', () => {
    const source = `import { ${NAME} } from '@/lib/attribution/checkout-signal'\n`
    expect(captureCallCount(source, NAME)).toBe(0)
  })

  it('counts one call in a file that imports it and calls it once', () => {
    const source = `
import { ${NAME} } from '@/lib/attribution/checkout-signal'
export async function go() {
  await ${NAME}(order_id)
}
`
    expect(captureCallCount(source, NAME)).toBe(1)
  })

  it('counts both calls in a file that creates orders on two paths', () => {
    const source = `
  await ${NAME}(a)
  await ${NAME}(b)
`
    expect(captureCallCount(source, NAME)).toBe(2)
  })

  it('does not count a DIFFERENT function whose name merely contains this one', () => {
    // Prefixed: there is no word boundary between `x` and `record`, so the name
    // is not matched. Suffixed: the name matches but the parenthesis does not
    // follow it. Both are different functions and neither captures anything.
    expect(captureCallCount(`await xrecordClickSignalForOrder(a)`, NAME)).toBe(0)
    expect(captureCallCount(`await ${NAME}Twice(a)`, NAME)).toBe(0)
  })
})

describe('the real tree satisfies the clause the guard enforces', () => {
  const ORDER_FILES = [
    'src/app/actions/checkout.ts',
    'src/app/actions/register-free.ts',
    'src/app/actions/squad-checkout.ts',
  ]

  it('every file that inserts an order calls the capture at least as many times', () => {
    for (const rel of ORDER_FILES) {
      const source = readFileSync(join(process.cwd(), rel), 'utf8')
      const inserts = orderInsertCount(source)
      expect(inserts, `${rel} should still insert orders`).toBeGreaterThan(0)
      expect(captureCallCount(source, 'recordClickSignalForOrder'), rel).toBeGreaterThanOrEqual(inserts)
    }
  })

  it('checkout.ts is the two-path case, and carries two of each', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/actions/checkout.ts'), 'utf8')
    expect(orderInsertCount(source)).toBe(2)
    expect(captureCallCount(source, 'recordClickSignalForOrder')).toBe(2)
  })
})

describe('the resolution grace is read from the product, never carried by the guard', () => {
  it('reads the literal the backstop declares', () => {
    expect(resolutionGraceMs()).toBe(5 * 60 * 1000)
  })

  it('names the file it reads, so a failure points at the thing to fix', () => {
    expect(BACKSTOP_SOURCE.replace(/\\/g, '/')).toBe('src/lib/attribution/backstop.ts')
  })

  it('the guard that fails builds reads it rather than declaring its own', () => {
    const guard = readFileSync(
      join(process.cwd(), 'scripts/guards/attribution-one-record-per-order-never-billable-when-reversed.mjs'),
      'utf8',
    )
    expect(guard).toContain('resolutionGraceMs()')
    // A second declaration would drift from the healer, and the failure that
    // produces is a build going red on an order the healer was leaving alone.
    expect(guard).not.toMatch(/const RESOLUTION_GRACE_MS\s*=\s*[0-9]/)
  })
})
