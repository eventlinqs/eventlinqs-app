import { describe, expect, it } from 'vitest'
import { readBlotatoTargets } from '@/lib/social/blotato-targets'

/*
 * WHERE THE WEEK POSTS, READ ON PRODUCTION (the PM's 20:50 of 17 November 2026, item 3, route (b): "an admin read on
 * production after the redeploy shows the Blotato accounts and the Facebook Pages ... Tell the PM the Page's name before
 * Approve week"). /admin/social reads Blotato with the key this runtime holds and names the Facebook Page and the
 * Instagram account the publisher would post to, by the publisher's own rule (exactly one Page), never the key.
 */
type Call = { url: string; key: string | null }

function fakeBlotato(routes: Record<string, { status?: number; body: unknown }>) {
  const calls: Call[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const headers = (init?.headers ?? {}) as Record<string, string>
    calls.push({ url, key: headers['blotato-api-key'] ?? null })
    const path = url.replace('https://backend.blotato.com/v2', '')
    const r = routes[path]
    if (!r) return new Response(JSON.stringify({ message: 'not found' }), { status: 404 })
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 })
  }) as typeof fetch
  return { calls, fetchImpl }
}

const KEY = 'k'.repeat(48)

describe('where the week posts (readBlotatoTargets)', () => {
  it('no key in this runtime: says so and calls nothing', async () => {
    const { calls, fetchImpl } = fakeBlotato({})
    expect(await readBlotatoTargets({}, fetchImpl)).toEqual({ state: 'no-key' })
    expect(calls).toEqual([])
  })

  it("names the one Facebook Page and the Instagram account, with every plain field but the credentials", async () => {
    const { calls, fetchImpl } = fakeBlotato({
      '/users/me/accounts': {
        body: {
          items: [
            { id: 'fb1', platform: 'facebook', fullname: 'Lawal Adams', accessToken: 'never-shown' },
            { id: 'ig1', platform: 'instagram', username: 'eventlinqs' },
          ],
        },
      },
      '/users/me/accounts/fb1/subaccounts': { body: { items: [{ id: '1234', name: 'EventLinqs' }] } },
    })
    const out = await readBlotatoTargets({ BLOTATO_API_KEY: ` ${KEY} ` }, fetchImpl)
    expect(out).toMatchObject({
      state: 'read',
      postsTo: { facebook: 'EventLinqs (Page 1234)', instagram: 'eventlinqs' },
      refusal: null,
    })
    if (out.state !== 'read') throw new Error('not read')
    expect(out.accounts.map((a) => a.platform)).toEqual(['facebook', 'instagram'])
    expect(JSON.stringify(out)).not.toContain('never-shown')
    expect(JSON.stringify(out)).not.toContain(KEY)
    expect(calls.every((c) => c.key === KEY)).toBe(true)
  })

  it("two Pages, or none: the publisher's own refusal, said before Approve week", async () => {
    const { fetchImpl } = fakeBlotato({
      '/users/me/accounts': { body: { items: [{ id: 'fb1', platform: 'facebook', fullname: 'Lawal Adams' }] } },
      '/users/me/accounts/fb1/subaccounts': { body: { items: [{ id: '1', name: 'EventLinqs' }, { id: '2', name: 'Lawal Adams Music' }] } },
    })
    const out = await readBlotatoTargets({ BLOTATO_API_KEY: KEY }, fetchImpl)
    expect(out).toMatchObject({ state: 'read', postsTo: { facebook: null, instagram: null } })
    if (out.state !== 'read') throw new Error('not read')
    expect(out.facebookPages?.map((p) => p.label)).toEqual(['EventLinqs', 'Lawal Adams Music'])
    expect(out.refusal).toBe("Blotato's Facebook account has 2 Pages; exactly one, the EventLinqs Page, is expected. No Instagram account is connected.")
  })

  it("Blotato refuses the key: its own words, never a guess", async () => {
    const { fetchImpl } = fakeBlotato({ '/users/me/accounts': { status: 401, body: { message: 'Invalid API key' } } })
    expect(await readBlotatoTargets({ BLOTATO_API_KEY: KEY }, fetchImpl)).toEqual({ state: 'failed', words: 'Blotato answered 401 to /users/me/accounts: Invalid API key' })
  })
})
