import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readEngagement } from '@/lib/social/blotato-engagement'

/*
 * WHAT PEOPLE SAID BACK, READ ONLY (the PM's 12:28 of 18 November 2026). Blotato's comments and messages, read with GET
 * only: our own comments and our own outgoing messages are left out, older messages are left out, every page of a
 * cursor is followed, a refusal is named, and nothing in the module can post.
 */
type Call = { url: string; method: string }
const fake = (answers: Record<string, unknown[]>) => {
  const calls: Call[] = []
  const fetcher = async (url: string, init?: RequestInit) => {
    calls.push({ url, method: String(init?.method ?? 'GET') })
    const key = Object.keys(answers).find((k) => url.includes(k))
    const queue = key ? answers[key] : []
    const next = queue.shift()
    if (next === undefined) return new Response(JSON.stringify({ items: [] }), { status: 200 })
    if (typeof next === 'number') return new Response('no', { status: next })
    return new Response(JSON.stringify(next), { status: 200 })
  }
  return { fetcher, calls }
}

describe('reading comments and messages from Blotato', () => {
  it('keeps what other people said since the moment, newest first, and follows the cursor', async () => {
    const { fetcher, calls } = fake({
      '/comments': [
        { items: [{ platform: 'instagram', text: 'See you there', createdAt: '2026-11-18T05:10:00Z', author: { username: 'amy' }, isAuthor: false, platformPostId: 'p1' }], cursor: 'c2' },
        { items: [{ platform: 'instagram', text: 'our own reply', createdAt: '2026-11-18T05:11:00Z', author: { username: 'eventlinqs' }, isAuthor: true }] },
      ],
      '/messages': [
        { items: [
          { platform: 'facebook', text: 'Is it free?', createdAt: '2026-11-18T05:12:00Z', direction: 'incoming', senderId: 's1' },
          { platform: 'facebook', text: 'Yes', createdAt: '2026-11-18T05:13:00Z', direction: 'outgoing', senderId: 'us' },
          { platform: 'instagram', text: 'old', createdAt: '2026-11-17T01:00:00Z', direction: 'incoming', senderId: 's2' },
        ] },
      ],
    })
    const r = await readEngagement('key', new Date('2026-11-18T05:00:00Z'), fetcher)
    expect(r.unread).toEqual([])
    expect(r.items.map((i) => [i.kind, i.text, i.who])).toEqual([['message', 'Is it free?', 's1'], ['comment', 'See you there', 'amy']])
    expect(calls.filter((c) => c.url.includes('/comments')).map((c) => c.url.includes('cursor=c2'))).toEqual([false, true])
    expect(calls.every((c) => c.method === 'GET')).toBe(true)
  })

  it('names a refused read and still reads the other', async () => {
    const { fetcher } = fake({ '/comments': [403], '/messages': [{ items: [] }] })
    const r = await readEngagement('key', new Date('2026-11-18T05:00:00Z'), fetcher)
    expect(r.unread).toEqual(['comments: Blotato answered 403 to GET /comments'])
  })

  it('can never post: the module calls GET only', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'lib', 'social', 'blotato-engagement.ts'), 'utf8')
    expect(src).not.toMatch(/method:\s*'(POST|PUT|PATCH|DELETE)'/)
  })
})
