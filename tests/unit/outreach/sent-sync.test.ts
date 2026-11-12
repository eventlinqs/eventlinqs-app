import { beforeEach, describe, expect, it } from 'vitest'
import { forgetGraphToken, graphReadSentItems, type GraphConfig } from '@/lib/outreach/graph'
import { planSentSync, subjectKey, type SentMail } from '@/lib/outreach/sent-sync-math'

/*
 * LAWAL'S SENT ITEMS, RECORDED BY THEMSELVES (Release 2, item 5): a message he sent to a contact with a draft held under
 * the same subject marks that draft sent; one he wrote himself is recorded as sent; mail to anyone who is no contact is
 * none of the CRM's business; nothing is recorded twice.
 */
const mail = (id: string, to: string[], subject: string, text = 'Hi team,\nwords'): SentMail => ({ internetMessageId: id, subject, toAddresses: to, sentAt: '2026-11-13T00:00:00Z', text })

describe('what he sent, matched', () => {
  const contacts = [{ id: 'c1', address: 'bookings@venue.example.com.au' }, { id: 'c2', address: 'jo@promoter.example.com.au' }]
  const held = [{ touchId: 't1', contactId: 'c1', subject: 'Trivia Tuesdays, could I ask your advice?' }]

  it('a held draft under the same subject is the message sent; another to a contact is his own; others are not ours', () => {
    const plan = planSentSync(
      [
        mail('<a@x>', ['Bookings@Venue.example.com.au'], 'Trivia Tuesdays, could I ask your advice?'),
        mail('<b@x>', ['jo@promoter.example.com.au'], 'Catching up'),
        mail('<c@x>', ['friend@gmail.com'], 'Dinner'),
      ],
      contacts,
      held,
      new Set(),
    )
    expect(plan.actions.map((a) => [a.kind, a.contactId, a.kind === 'mark' ? a.touchId : null])).toEqual([
      ['mark', 'c1', 't1'],
      ['record', 'c2', null],
    ])
    expect(plan.notContacts).toBe(1)
  })
  it('a message already recorded, or with no message id, is never recorded again', () => {
    const plan = planSentSync([mail('<a@x>', ['bookings@venue.example.com.au'], 'x'), mail('', ['bookings@venue.example.com.au'], 'x')], contacts, held, new Set(['<a@x>']))
    expect(plan.actions).toEqual([])
    expect(plan.alreadyRecorded).toBe(2)
  })
  it('a draft is used once, and a reply prefix or case does not stop the match', () => {
    expect(subjectKey('RE: Fwd:  Trivia Tuesdays, could I ask your advice? ')).toBe(subjectKey('trivia tuesdays, could I ask your advice?'))
    const plan = planSentSync(
      [mail('<a@x>', ['bookings@venue.example.com.au'], 'Re: Trivia Tuesdays, could I ask your advice?'), mail('<b@x>', ['bookings@venue.example.com.au'], 'Trivia Tuesdays, could I ask your advice?')],
      contacts,
      held,
      new Set(),
    )
    expect(plan.actions.map((a) => a.kind)).toEqual(['mark', 'record'])
  })
})

describe('the Sent Items reader', () => {
  beforeEach(() => forgetGraphToken())
  const cfg: GraphConfig = { tenantId: 't', clientId: 'c', clientSecret: 's', mailbox: 'lawal@eventlinqs.com' }
  it('reads the sentitems folder of the one mailbox, To and Cc in lower case, text bodies', async () => {
    const asked: string[] = []
    const fetchImpl = async (url: string, init?: RequestInit) => {
      if (url.includes('/token')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3599 }))
      asked.push(`${url} ${(init?.headers as Record<string, string>)?.prefer ?? ''}`)
      return new Response(
        JSON.stringify({
          value: [
            {
              id: 'g1',
              internetMessageId: '<m1@x>',
              subject: 'Hello',
              sentDateTime: '2026-11-13T01:00:00Z',
              toRecipients: [{ emailAddress: { address: 'Jo@Promoter.example.com.au' } }],
              ccRecipients: [{ emailAddress: { address: 'jo@promoter.example.com.au' } }, { emailAddress: { address: 'Sam@Venue.example.com.au' } }],
              body: { content: 'Hi Jo,' },
            },
          ],
        }),
      )
    }
    const out = await graphReadSentItems(cfg, '2026-11-11T00:00:00Z', fetchImpl)
    expect(asked[0]).toContain('/users/lawal%40eventlinqs.com/mailFolders/sentitems/messages?')
    expect(asked[0]).toContain('sentDateTime+ge+2026-11-11T00%3A00%3A00Z')
    expect(asked[0]).toContain('outlook.body-content-type="text"')
    expect(out).toEqual([{ graphId: 'g1', internetMessageId: '<m1@x>', subject: 'Hello', toAddresses: ['jo@promoter.example.com.au', 'sam@venue.example.com.au'], sentAt: '2026-11-13T01:00:00Z', text: 'Hi Jo,' }])
  })
})
