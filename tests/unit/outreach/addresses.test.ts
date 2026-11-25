import { describe, expect, it } from 'vitest'
import { ADDRESS_OF_CATEGORY, HELLO_MAILBOX, LAWAL_MAILBOX, mailboxFor, OUR_MAILBOXES } from '@/lib/outreach/addresses'
import { COMMS_CATEGORIES } from '@/lib/comms/categories'
import { transportForMode } from '@/lib/outreach/sender'
import { forgetGraphToken, type GraphConfig } from '@/lib/outreach/graph'

/*
 * LAW 33 (a), EACH MESSAGE TYPE TO ITS ADDRESS (Lawal's 13:47 of 19 November 2026): acquisition and partnerships from
 * lawal@, permissions, listing confirmations, notifications, support and routine replies from hello@, a reply from the
 * address they wrote to; a type with no address is refused, never sent from a guess. Graph is faked.
 */
describe('the one table', () => {
  it('every communication category has its address', () => {
    expect(Object.keys(ADDRESS_OF_CATEGORY).sort()).toEqual(Object.keys(COMMS_CATEGORIES).sort())
  })
  it('acquisition and partnerships from lawal@, the rest from hello@', () => {
    expect(mailboxFor({ category: 'ACQ', purpose: 'cadence' })).toEqual({ mailbox: LAWAL_MAILBOX })
    expect(mailboxFor({ category: 'RET', purpose: 'relationship' })).toEqual({ mailbox: LAWAL_MAILBOX })
    for (const c of ['PERM', 'LIST', 'TKT', 'SOC', 'SYS']) expect(mailboxFor({ category: c, purpose: 'cadence' })).toEqual({ mailbox: HELLO_MAILBOX })
  })
  // ONE CHANNEL PER CONVERSATION (Lawal, 25 November 2026, 14:41 and 14:43): not a reply alone, every message to someone
  // already in conversation with us goes from that conversation's mailbox (./conversation.test.ts).
  it('a reply, and every message after it, goes from the conversation they are in', () => {
    expect(mailboxFor({ category: 'ACQ', purpose: 'reply', conversation: 'Hello@EventLinqs.com' })).toEqual({ mailbox: HELLO_MAILBOX })
    expect(mailboxFor({ category: 'PERM', purpose: 'reply', conversation: LAWAL_MAILBOX })).toEqual({ mailbox: LAWAL_MAILBOX })
    expect(mailboxFor({ category: 'PERM', purpose: 'cadence', conversation: LAWAL_MAILBOX })).toEqual({ mailbox: LAWAL_MAILBOX })
  })
  it('a type with no address is refused, never guessed', () => {
    const a = mailboxFor({ category: null, purpose: 'cadence' })
    expect('refused' in a && a.refused).toMatch(/no address is set for the message type 'none'/)
    expect('refused' in mailboxFor({ category: 'NEWS', purpose: 'cadence' })).toBe(true)
  })
  it('both mailboxes are read', () => {
    expect([...OUR_MAILBOXES].sort()).toEqual([HELLO_MAILBOX, LAWAL_MAILBOX].sort())
  })
})

describe('the sender sends as the message type says', () => {
  it('Graph is asked to send from lawal@ for acquisition, from hello@ otherwise, with the one app', async () => {
    forgetGraphToken()
    const cfg: GraphConfig = { tenantId: 't', clientId: 'c', clientSecret: 's', mailbox: HELLO_MAILBOX }
    const asked: string[] = []
    const fetchImpl = async (url: string) => {
      if (url.includes('/oauth2/')) return new Response(JSON.stringify({ access_token: 'x', expires_in: 3600 }), { status: 200 })
      asked.push(url)
      return new Response(null, { status: 202 })
    }
    const transport = transportForMode('live', 'eventlinqs.com', cfg, fetchImpl)
    await transport!.send({ to: 'jo@venue.example.com.au', base64Mime: 'eA==', messageId: '<a@eventlinqs.com>', from: LAWAL_MAILBOX })
    await transport!.send({ to: 'jo@venue.example.com.au', base64Mime: 'eA==', messageId: '<b@eventlinqs.com>', from: HELLO_MAILBOX })
    expect(asked[0]).toContain('/users/lawal%40eventlinqs.com/sendMail')
    expect(asked[1]).toContain('/users/hello%40eventlinqs.com/sendMail')
  })
})
