import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { PUBLIC_POST_URL, readBackPendingPosts } from '@/lib/social/store'

/*
 * THE PUBLISHED REFERENCE, AS THE DATABASE READS IT (the PM's 18:40 of 18 November 2026, item 1 (a)). The rule is the one
 * in supabase/migrations/20261118190001_social_blotato_reference.sql, proved on production's own rows in a block that
 * rolled itself back (C:\dev\EVIDENCE\EL-18NOV\outside-ids\migration-dry-run.sh, 18:47:45: the reference became the URL;
 * every other change of a published row, a URL back to a reference and any change of a held row refused; both checks
 * read back as written; all 15 rows valid). Here the code is held to that same rule: what the publisher writes, and what
 * the read back accepts as a post's URL, are exactly what the check lets in.
 */
const migration = readFileSync(join(process.cwd(), 'supabase', 'migrations', '20261118190001_social_blotato_reference.sql'), 'utf8')
const published = migration.slice(migration.indexOf('add constraint social_piece_schedules_published_ref_check'), migration.indexOf('do $migrate$'))
const sqlPatterns = [...published.matchAll(/~\*? '([^']+)'/g)].map((m) => m[1])

describe("the database's published reference rule", () => {
  it('takes a public post URL or a pending Blotato reference, and nothing else', () => {
    expect(sqlPatterns).toHaveLength(2)
    const [url, blotato] = sqlPatterns
    const urlRule = new RegExp(url.replace('[^[:space:]]', '\\S'), 'i')
    const blotatoRule = new RegExp(blotato)
    for (const ok of ['https://www.instagram.com/p/Df31qktlp6p/', 'https://www.instagram.com/stories/eventlinqs/4032969085579012587', 'https://facebook.com/1115963901604820_122160200637350955']) {
      expect(urlRule.test(ok), ok).toBe(true)
      expect(PUBLIC_POST_URL.test(ok), ok).toBe(true)
    }
    for (const no of ['http://www.instagram.com/p/x/', 'https://example.com/p/x', 'https://www.instagram.com/p/a b/']) {
      expect(urlRule.test(no), no).toBe(false)
      expect(PUBLIC_POST_URL.test(no), no).toBe(false)
    }
    expect(blotatoRule.test('blotato:abc_DEF-12')).toBe(true)
    expect(blotatoRule.test('blotato:a b')).toBe(false)
    expect(blotatoRule.test('blotato:')).toBe(false)
  })

  it('the publisher writes its submission in the shape the submission check takes', () => {
    const store = readFileSync(join(process.cwd(), 'src', 'lib', 'social', 'store.ts'), 'utf8')
    expect(store).toContain('update({ submission_ref: `blotato:${submission}` })')
    expect(migration).toContain("submission_ref ~ '^blotato:[A-Za-z0-9_-]{1,200}$'")
  })
})

describe('every post Blotato accepted is read back to its public URL', () => {
  function db(rows: { id: string; published_ref: string }[]) {
    const updates: { change: Record<string, unknown>; where: [string, unknown][] }[] = []
    const chain = (result: unknown, where: [string, unknown][], change?: Record<string, unknown>): unknown => {
      const link: object = new Proxy({}, {
        get(_t, key) {
          if (key === 'then') return (ok: (v: unknown) => unknown) => Promise.resolve(change ? (updates.push({ change, where }), { error: null }) : result).then(ok)
          if (key === 'eq') return (k: string, v: unknown) => chain(result, [...where, [k, v]], change)
          return () => link
        },
      })
      return link
    }
    return {
      updates,
      from: () => ({
        select: () => chain({ data: rows, error: null }, []),
        update: (change: Record<string, unknown>) => chain(null, [], change),
      }),
    }
  }

  it('writes the URL Blotato gives in the reference\'s place, and leaves a post still publishing as it is', async () => {
    const d = db([{ id: 'r1', published_ref: 'blotato:sub-1' }, { id: 'r2', published_ref: 'blotato:sub-2' }])
    const read = vi.fn(async (s: string) => (s === 'sub-1' ? { status: 'published', publicUrl: 'https://www.instagram.com/p/AbC123/' } : { status: 'in-progress', publicUrl: null }))
    const out = await readBackPendingPosts(d as never, read)
    expect(read.mock.calls.map((c) => c[0])).toEqual(['sub-1', 'sub-2'])
    expect(out.filled).toEqual(['blotato:sub-1 is https://www.instagram.com/p/AbC123/'])
    expect(out.pending).toEqual(['blotato:sub-2: in-progress'])
    expect(d.updates).toEqual([{ change: { published_ref: 'https://www.instagram.com/p/AbC123/' }, where: [['id', 'r1'], ['published_ref', 'blotato:sub-1']] }])
  })

  it('never writes an address that is not a public post URL, and a failed read only waits', async () => {
    const d = db([{ id: 'r1', published_ref: 'blotato:sub-1' }, { id: 'r2', published_ref: 'blotato:sub-2' }])
    const read = vi.fn(async (s: string) => {
      if (s === 'sub-2') throw new Error('Blotato refused GET /posts/sub-2: HTTP 500')
      return { status: 'published', publicUrl: 'https://example.com/not-a-post' }
    })
    const out = await readBackPendingPosts(d as never, read)
    expect(out.filled).toEqual([])
    expect(out.pending).toEqual(['blotato:sub-1: published', 'blotato:sub-2: Blotato refused GET /posts/sub-2: HTTP 500'])
    expect(d.updates).toEqual([])
  })

  it('with no Blotato key there is nothing to read', async () => {
    expect(await readBackPendingPosts(db([]) as never, null)).toEqual({ read: 0, filled: [], pending: [] })
  })
})
