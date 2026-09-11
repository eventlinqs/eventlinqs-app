/**
 * WHAT CHANGED ABOUT A SLOT'S PRICED BUCKETS, as ledger rows. Close-out D1.
 *
 * Pure, and deliberately so. Every fact this file needs is in its two arguments,
 * which means the whole rule can be driven by a test rather than by a database,
 * and the same rule can be pointed at a gym's rate card tomorrow without a line
 * changing. It speaks the general vocabulary only; the mapping into it lives in
 * `adapter.ts`.
 *
 * WHY THE KEY IS THE BUCKET'S OWN `updatedAt`. A price can move up and back down
 * in a day, so a key made only of the bucket and the new price would collide
 * with the earlier move and the second change would silently not be recorded.
 * A timestamp the DATABASE set, rather than one this process invented, also
 * means two racing saves that produced one write share one key.
 */
import type { Entry, InventoryAction } from './types'

/** One priced bucket within a slot, as much of it as a diff needs. */
export type PricedBucket = {
  ref: string
  name: string
  priceCents: number
  capacity: number
  /** Set by the database, not by this process. See the header. */
  updatedAt: string
}

export type BucketChange = Pick<
  Entry,
  'kind' | 'occurrenceKey' | 'inventoryClass' | 'inventoryClassRef' | 'oldPriceCents' | 'newPriceCents' | 'inventoryAction' | 'quantity'
>

/**
 * The rows that describe the move from `before` to `after`.
 *
 * Four things can happen to a bucket and each is its own row, because collapsing
 * them would lose the answer to a question an organiser genuinely asks: a bucket
 * that appeared, one that went, one whose price moved, and one whose capacity
 * moved. A bucket that did not change at all produces nothing, so a save that
 * touched only the description writes no inventory history.
 */
export function diffBuckets(before: PricedBucket[], after: PricedBucket[]): BucketChange[] {
  const beforeByRef = new Map(before.map(b => [b.ref, b]))
  const afterByRef = new Map(after.map(b => [b.ref, b]))
  const changes: BucketChange[] = []

  for (const bucket of after) {
    const was = beforeByRef.get(bucket.ref)

    if (!was) {
      changes.push({
        kind: 'inventory',
        occurrenceKey: `${bucket.ref}:open:${bucket.updatedAt}`,
        inventoryClass: bucket.name,
        inventoryClassRef: bucket.ref,
        inventoryAction: 'open' as InventoryAction,
        quantity: bucket.capacity,
      })
      continue
    }

    if (was.priceCents !== bucket.priceCents) {
      changes.push({
        kind: 'price_change',
        occurrenceKey: `${bucket.ref}:${bucket.updatedAt}`,
        inventoryClass: bucket.name,
        inventoryClassRef: bucket.ref,
        oldPriceCents: was.priceCents,
        newPriceCents: bucket.priceCents,
      })
    }

    if (was.capacity !== bucket.capacity) {
      changes.push({
        kind: 'inventory',
        occurrenceKey: `${bucket.ref}:capacity:${bucket.updatedAt}`,
        inventoryClass: bucket.name,
        inventoryClassRef: bucket.ref,
        inventoryAction: 'capacity_change' as InventoryAction,
        quantity: bucket.capacity,
      })
    }
  }

  for (const bucket of before) {
    if (afterByRef.has(bucket.ref)) continue
    changes.push({
      kind: 'inventory',
      // A bucket that has gone has no new timestamp of its own, so the key
      // carries the last one it had. Removing the same bucket twice is not a
      // thing that can happen, and a re-run of the same save is not a second
      // removal.
      occurrenceKey: `${bucket.ref}:close:${bucket.updatedAt}`,
      inventoryClass: bucket.name,
      inventoryClassRef: bucket.ref,
      inventoryAction: 'close' as InventoryAction,
      quantity: bucket.capacity,
    })
  }

  return changes
}
