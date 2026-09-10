/**
 * WHAT CHANGED ABOUT A SLOT'S PRICED BUCKETS. Close-out D1.
 *
 * Pure, so the whole rule is drivable without a database, and the same rule
 * will be pointed at a gym's rate card tomorrow. What is asserted here is the
 * occurrence KEY as much as the row, because the key is what makes a re-run
 * free and what stops a price that moved up and back down in one day from
 * silently recording only once.
 */
import { expect, test } from 'vitest'
import { diffBuckets, type PricedBucket } from '@/lib/ledger/inventory-diff'

const bucket = (over: Partial<PricedBucket> = {}): PricedBucket => ({
  ref: 'bucket-a',
  name: 'Early bird',
  priceCents: 4500,
  capacity: 100,
  updatedAt: '2026-06-01T00:00:00.000Z',
  ...over,
})

test('a bucket that did not change produces nothing', () => {
  expect(diffBuckets([bucket()], [bucket()])).toEqual([])
})

test('a bucket that appeared opens, carrying the capacity it opened with', () => {
  expect(diffBuckets([], [bucket()])).toEqual([
    {
      kind: 'inventory',
      occurrenceKey: 'bucket-a:open:2026-06-01T00:00:00.000Z',
      inventoryClass: 'Early bird',
      inventoryClassRef: 'bucket-a',
      inventoryAction: 'open',
      quantity: 100,
    },
  ])
})

test('a bucket that went closes, keyed on the last timestamp it ever had', () => {
  expect(diffBuckets([bucket()], [])).toEqual([
    {
      kind: 'inventory',
      occurrenceKey: 'bucket-a:close:2026-06-01T00:00:00.000Z',
      inventoryClass: 'Early bird',
      inventoryClassRef: 'bucket-a',
      inventoryAction: 'close',
      quantity: 100,
    },
  ])
})

test('a price that moved is its own row, with what it was and what it became', () => {
  const changes = diffBuckets([bucket()], [bucket({ priceCents: 5500, updatedAt: '2026-06-20T00:00:00.000Z' })])
  expect(changes).toEqual([
    {
      kind: 'price_change',
      occurrenceKey: 'bucket-a:2026-06-20T00:00:00.000Z',
      inventoryClass: 'Early bird',
      inventoryClassRef: 'bucket-a',
      oldPriceCents: 4500,
      newPriceCents: 5500,
    },
  ])
})

test('a capacity that moved is its own row, because it answers a different question from a price', () => {
  const changes = diffBuckets([bucket()], [bucket({ capacity: 150, updatedAt: '2026-06-20T00:00:00.000Z' })])
  expect(changes).toEqual([
    {
      kind: 'inventory',
      occurrenceKey: 'bucket-a:capacity:2026-06-20T00:00:00.000Z',
      inventoryClass: 'Early bird',
      inventoryClassRef: 'bucket-a',
      inventoryAction: 'capacity_change',
      quantity: 150,
    },
  ])
})

test('a price and a capacity moving on the same save are two rows with two different keys', () => {
  const changes = diffBuckets(
    [bucket()],
    [bucket({ priceCents: 5500, capacity: 150, updatedAt: '2026-06-20T00:00:00.000Z' })],
  )
  expect(changes.map(c => c.kind)).toEqual(['price_change', 'inventory'])
  expect(new Set(changes.map(c => c.occurrenceKey)).size).toBe(2)
})

test('renaming a bucket alone is not an inventory move, because nothing about the inventory moved', () => {
  expect(diffBuckets([bucket()], [bucket({ name: 'Earlybird', updatedAt: '2026-06-20T00:00:00.000Z' })])).toEqual([])
})

test('a price that moved up and back down on two different saves is TWO rows, not one', () => {
  const up = diffBuckets([bucket()], [bucket({ priceCents: 5500, updatedAt: '2026-06-20T09:00:00.000Z' })])
  const down = diffBuckets(
    [bucket({ priceCents: 5500, updatedAt: '2026-06-20T09:00:00.000Z' })],
    [bucket({ priceCents: 4500, updatedAt: '2026-06-20T17:00:00.000Z' })],
  )
  expect(up[0].occurrenceKey).not.toBe(down[0].occurrenceKey)
  expect(down[0]).toMatchObject({ oldPriceCents: 5500, newPriceCents: 4500 })
})

test('several buckets at once are each judged on their own', () => {
  const changes = diffBuckets(
    [bucket({ ref: 'a', name: 'A' }), bucket({ ref: 'b', name: 'B' })],
    [
      bucket({ ref: 'a', name: 'A', priceCents: 9900, updatedAt: '2026-06-20T00:00:00.000Z' }),
      bucket({ ref: 'c', name: 'C', updatedAt: '2026-06-20T00:00:00.000Z' }),
    ],
  )
  expect(changes.map(c => `${c.kind}:${c.inventoryClass}`)).toEqual([
    'price_change:A',
    'inventory:C',
    'inventory:B',
  ])
})
