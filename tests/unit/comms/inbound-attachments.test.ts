import { describe, expect, it } from 'vitest'
import { graphIdOf, graphPhotosOf, isShownPhoto } from '@/lib/comms/inbound-attachments'
import { forgetGraphToken, type GraphConfig } from '@/lib/outreach/graph'

/*
 * AN ORGANISER'S ATTACHED PHOTOGRAPHS IN THE CRM (law 30, section 4 A): only a photograph is shown, never an inline
 * signature logo or a document, and the message is found by its own internet message id. Graph is faked.
 */
const cfg: GraphConfig = { tenantId: 't', clientId: 'c', clientSecret: 's', mailbox: 'hello@eventlinqs.com' }

function fakeGraph(answers: Record<string, unknown>) {
  const asked: string[] = []
  const fetchImpl = async (url: string) => {
    asked.push(url)
    if (url.includes('/oauth2/')) return new Response(JSON.stringify({ access_token: 'x', expires_in: 3600 }), { status: 200 })
    const key = Object.keys(answers).find((k) => url.includes(k))
    return new Response(JSON.stringify(key ? answers[key] : {}), { status: key ? 200 : 404 })
  }
  return { asked, fetchImpl }
}

describe('only a photograph is shown', () => {
  it('a JPEG or PNG attached, never an inline logo, a PDF, an empty file or one over 25 MB', () => {
    expect(isShownPhoto({ contentType: 'image/jpeg', isInline: false, size: 279751 })).toBe(true)
    expect(isShownPhoto({ contentType: 'image/png', isInline: true, size: 4000 })).toBe(false)
    expect(isShownPhoto({ contentType: 'application/pdf', isInline: false, size: 4000 })).toBe(false)
    expect(isShownPhoto({ contentType: 'image/jpeg', isInline: false, size: 0 })).toBe(false)
    expect(isShownPhoto({ contentType: 'image/jpeg', isInline: false, size: 26 * 1024 * 1024 })).toBe(false)
  })
})

describe('read from the mailbox', () => {
  it("finds Aria's message by its internet message id and lists her three photographs, not the logo", async () => {
    forgetGraphToken()
    const { asked, fetchImpl } = fakeGraph({
      "internetMessageId+eq+%27%3CFBC81572": { value: [{ id: 'g1' }] },
      '/messages/g1/attachments': {
        value: [
          { id: 'a1', name: 'IMG_6081.jpg', contentType: 'image/jpeg', size: 279751, isInline: false },
          { id: 'a2', name: 'IMG_6082.jpg', contentType: 'image/jpeg', size: 301847, isInline: false },
          { id: 'a3', name: 'IMG_6085.jpg', contentType: 'image/jpeg', size: 365770, isInline: false },
          { id: 'a4', name: 'logo.png', contentType: 'image/png', size: 3000, isInline: true },
        ],
      },
    })
    const id = await graphIdOf(cfg, '<FBC81572-85C3-2743-8772-5ECF2A240627@hxcore.ol>', fetchImpl)
    expect(id).toBe('g1')
    const photos = await graphPhotosOf(cfg, 'g1', fetchImpl)
    expect(photos.map((p) => p.name)).toEqual(['IMG_6081.jpg', 'IMG_6082.jpg', 'IMG_6085.jpg'])
    expect(asked.some((u) => u.includes('/users/hello%40eventlinqs.com/messages?'))).toBe(true)
  })
  it('refuses an id that could break out of the filter', async () => {
    const { asked, fetchImpl } = fakeGraph({})
    expect(await graphIdOf(cfg, "<x'or 1 eq 1>", fetchImpl)).toBeNull()
    expect(asked).toEqual([])
  })
})
