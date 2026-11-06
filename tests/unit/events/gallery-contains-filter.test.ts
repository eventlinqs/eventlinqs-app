import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { galleryHolding } from '@/lib/media/gallery-filter'

/*
 * THE SWEEP'S 'IS THIS PHOTO STILL SHOWN ELSEWHERE?' READ (src/lib/upload.ts sweepEventStorage). events.gallery_urls is
 * jsonb (supabase/migrations/20260101000001_baseline_schema.sql). postgrest-js writes an ARRAY handed to contains() as a
 * Postgres array literal (node_modules/@supabase/postgrest-js/dist/index.cjs, contains), so the read was sent as
 * 'cs.{[object Object]}' and TEST answered 'invalid input syntax for type json' (6 November 2026, the LAW 19
 * demonstration's retire). A failed read keeps the object, so every sweep kept every object. Built here through the real
 * installed client, so a mock cannot agree with the fault again.
 */
const url = 'https://test.supabase.co/storage/v1/object/public/event-images/u1/night1/gallery-1.avif'
const filterOf = (q: unknown) => (q as { url: URL }).url.searchParams.get('gallery_urls')
const db = createClient('https://test.supabase.co', 'anon-key-for-a-query-that-is-never-sent', { auth: { persistSession: false } })

describe('the gallery containment filter on a jsonb column', () => {
  it('an array handed to contains() is not JSON (the fault, as the installed client writes it)', () => {
    const value = filterOf(db.from('events').select('id').contains('gallery_urls', [{ url }]))
    expect(value).toBe('cs.{[object Object]}')
  })

  it('galleryHolding is sent as JSON naming the URL', () => {
    const value = filterOf(db.from('events').select('id').contains('gallery_urls', galleryHolding(url)))
    expect(value?.startsWith('cs.')).toBe(true)
    expect(JSON.parse(value!.slice(3))).toEqual([{ url }])
  })
})
