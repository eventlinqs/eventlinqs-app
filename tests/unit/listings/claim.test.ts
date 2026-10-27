// Claim this venue, claim this event (src/lib/listings/claim.ts; the locked foundation's item 7; WI2-PLAN.md section 9,
// Part 3b). Pinned over fake reads and writes: where the code goes and where it never goes, the email's few words, a
// manual claim where the venue publishes no address, only a hash kept, and an organisation made for the claimant only
// once their code is known to be right.

import { describe, expect, test } from 'vitest'
import { addressFor, checkClaim, claimEmail, hashClaimCode, organisationSlug, startClaim, type ClaimDeps } from '@/lib/listings/claim'

const AT = new Date('2026-10-27T08:00:00Z')
const BEAVS = { name: "Beav's Bar", publishedEmail: 'hello@beavsbar.com.au', websiteUrl: 'https://www.beavsbar.com.au' }

describe('where the claim code goes', () => {
  test('to the venue\'s published address first', () => {
    expect(addressFor(BEAVS, 'someone@beavsbar.com.au')).toEqual({ method: 'published_email', email: 'hello@beavsbar.com.au' })
  })
  test('else to an address the claimant names at the venue website\'s own domain, www. aside', () => {
    const host = { ...BEAVS, publishedEmail: null }
    expect(addressFor(host, 'Sam@BeavsBar.com.au')).toEqual({ method: 'domain_email', email: 'sam@beavsbar.com.au' })
    expect(addressFor(host, 'sam@gmail.com')).toEqual({ method: 'manual' })
    expect(addressFor(host, 'sam@beavsbar.com.au.evil.example')).toEqual({ method: 'manual' })
  })
  test('nowhere where the venue publishes no address and no https site: a manual claim', () => {
    expect(addressFor({ name: 'X', publishedEmail: null, websiteUrl: null }, 'a@b.com')).toEqual({ method: 'manual' })
    expect(addressFor({ name: 'X', publishedEmail: 'not an address', websiteUrl: 'http://x.example' }, 'a@x.example')).toEqual({ method: 'manual' })
  })
})

describe('the code email', () => {
  test('says who asked, the code and its 15 minutes, and to ignore it if it was not them; nothing else', () => {
    const e = claimEmail({ hostName: "Beav's Bar", claimantName: 'Sam <b>', claimantRole: 'Manager', code: '042917' })
    expect(e.subject).toBe("Your EventLinqs code for Beav's Bar")
    expect(e.text).toContain('Sam <b> (Manager) asked to manage')
    expect(e.text).toContain('Their code is 042917. It works for 15 minutes.')
    expect(e.text).toContain('If this was not you, or you do not know them, ignore this email and nothing changes.')
    expect(e.html).toContain('Sam &lt;b&gt;')
    expect(`${e.text} ${e.html}`).not.toMatch(/https?:\/\/|free|offer|tickets|sign up|join/i)
  })
})

function fake(over: Partial<ClaimDeps> = {}) {
  const kept: Parameters<ClaimDeps['insertClaim']>[0][] = []
  const sent: { to: string; text: string }[] = []
  const made: string[] = []
  const tries: (string | null)[] = []
  let rightHash = ''
  const d: ClaimDeps = {
    hostOf: async () => BEAVS,
    insertClaim: async (row) => {
      kept.push(row)
    },
    send: async (to, email) => {
      sent.push({ to, text: email.text })
      rightHash = hashClaimCode(kept[kept.length - 1].id, /code is (\d{6})/.exec(email.text)?.[1] ?? '')
    },
    organisationOf: async () => null,
    makeOrganisation: async (userId) => {
      made.push(userId)
      return 'org-new'
    },
    check: async (_id, hash, org) => {
      tries.push(org)
      if (hash !== rightHash) return 'wrong'
      return org ? 'verified' : 'needs_organisation'
    },
    claimOf: async (id) => (kept.find((k) => k.id === id) ? { userId: kept.find((k) => k.id === id)!.userId, target: kept[0].target } : null),
    ...over,
  }
  return { d, kept, sent, made, tries }
}

describe('a claim', () => {
  test('sends the code to the venue\'s address and keeps only its hash, for 15 minutes', async () => {
    const { d, kept, sent } = fake()
    const started = await startClaim({ target: { kind: 'venue', venueId: 'v1' }, userId: 'u1', name: 'Sam', role: 'Manager', namedEmail: null, at: AT }, d)
    expect(started).toMatchObject({ state: 'sent', to: 'hello@beavsbar.com.au', method: 'published_email' })
    expect(sent.map((s) => s.to)).toEqual(['hello@beavsbar.com.au'])
    const code = /code is (\d{6})/.exec(sent[0].text)?.[1] ?? ''
    expect(kept[0].codeHash).toBe(hashClaimCode(kept[0].id, code))
    expect(JSON.stringify(kept[0])).not.toContain(code)
    expect(kept[0].expiresAt?.toISOString()).toBe('2026-10-27T08:15:00.000Z')
  })

  test('files a manual claim, sending nothing, where the venue gives no address the code may go to', async () => {
    const { d, kept, sent } = fake({ hostOf: async () => ({ name: 'X', publishedEmail: null, websiteUrl: null }) })
    expect(await startClaim({ target: { kind: 'event', eventId: 'e1' }, userId: 'u1', name: 'Sam', role: 'Owner', namedEmail: 'sam@gmail.com', at: AT }, d)).toMatchObject({ state: 'manual' })
    expect(sent).toEqual([])
    expect(kept[0]).toMatchObject({ codeHash: null, expiresAt: null, address: { method: 'manual' } })
  })

  test('is refused without a name or a role, or for a listing that cannot be claimed', async () => {
    const { d } = fake()
    expect(await startClaim({ target: { kind: 'venue', venueId: 'v1' }, userId: 'u1', name: ' ', role: 'Owner', namedEmail: null, at: AT }, d)).toEqual({ state: 'refused', reason: 'Add your name.' })
    expect(await startClaim({ target: { kind: 'venue', venueId: 'v1' }, userId: 'u1', name: 'Sam', role: '', namedEmail: null, at: AT }, d)).toEqual({ state: 'refused', reason: 'Add your role at the venue.' })
    const gone = fake({ hostOf: async () => null })
    expect(await startClaim({ target: { kind: 'venue', venueId: 'v1' }, userId: 'u1', name: 'Sam', role: 'Owner', namedEmail: null, at: AT }, gone.d)).toEqual({ state: 'refused', reason: 'This listing cannot be claimed.' })
  })

  test('makes the claimant an organisation only once the code is right, and moves the listing to it', async () => {
    const { d, sent, made, tries } = fake()
    const started = await startClaim({ target: { kind: 'venue', venueId: 'v1' }, userId: 'u1', name: 'Sam', role: 'Manager', namedEmail: null, at: AT }, d)
    if (started.state !== 'sent') throw new Error('not sent')
    expect(await checkClaim({ claimId: started.claimId, code: '000000' === /code is (\d{6})/.exec(sent[0].text)?.[1] ? '000001' : '000000', userId: 'u1', at: AT }, d)).toBe('wrong')
    expect(made).toEqual([])
    const code = /code is (\d{6})/.exec(sent[0].text)?.[1] ?? ''
    expect(await checkClaim({ claimId: started.claimId, code, userId: 'u1', at: AT }, d)).toBe('verified')
    expect(made).toEqual(['u1'])
    expect(tries).toEqual([null, null, 'org-new'])
  })

  test('is tried only by the person who started it, and only with six digits', async () => {
    const { d, sent, tries } = fake()
    const started = await startClaim({ target: { kind: 'venue', venueId: 'v1' }, userId: 'u1', name: 'Sam', role: 'Manager', namedEmail: null, at: AT }, d)
    if (started.state !== 'sent') throw new Error('not sent')
    const code = /code is (\d{6})/.exec(sent[0].text)?.[1] ?? ''
    expect(await checkClaim({ claimId: started.claimId, code, userId: 'someone-else', at: AT }, d)).toBe('not_yours')
    expect(await checkClaim({ claimId: started.claimId, code: 'abc', userId: 'u1', at: AT }, d)).toBe('wrong')
    expect(tries).toEqual([])
  })
})

describe('the organisation made for a claimant', () => {
  test('carries a slug the organisation form itself would accept', () => {
    for (const name of ["Beav's Bar", 'The Barwon Club & Hotel', '!!', 'Café Ünïcode Night']) {
      expect(organisationSlug(name, 4821)).toMatch(/^[a-z0-9-]{2,60}$/)
    }
    expect(organisationSlug("Beav's Bar", 4821)).toBe('beav-s-bar-4821')
  })
})
