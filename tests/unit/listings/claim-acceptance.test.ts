// The claim as acceptance (the engine plan of 28 October 2026, part D, window 2; the project manager's claim page
// words): the claim carries the organiser's yes, and once claimed, the organiser adds, replaces and withdraws their
// own images and keeps their regular nights listing. Pinned over fake reads and writes: the yes is only ever the
// constant's words, never the form's; it needs authority; it is kept on the claim before the code is tried; a claim
// without the tick still claims and carries no yes; and every media action takes the database's refusal in its own
// words and never leaves a stored file without its row.

import { describe, expect, test } from 'vitest'
import { PERMISSION_WORDS } from '@/lib/listings/submission'
import { claimAuthorityWords, claimYes, type ClaimYes } from '@/lib/listings/claim-acceptance'
import { checkClaim, hashClaimCode, startClaim, type ClaimDeps } from '@/lib/listings/claim'
import {
  addOrganiserMedia,
  keepOrganiserSeries,
  replaceOrganiserMedia,
  withdrawOrganiserMedia,
  withdrawOrganiserYes,
  type MediaDeps,
} from '@/lib/listings/organiser-media'

const AT = new Date('2026-10-28T09:00:00Z')
const VENUE = { kind: 'venue', venueId: 'v1' } as const

describe('the yes a claim carries (the claim page words, ticks 1 and 2)', () => {
  test('is none when the box is not ticked: the claim still goes ahead, with no permission', () => {
    expect(claimYes({ ticked: false, authority: false }, AT)).toEqual({ state: 'none' })
  })

  test('needs the claimant to say they can give it', () => {
    expect(claimYes({ ticked: true, authority: false }, AT)).toEqual({
      state: 'refused',
      reason: 'Confirm you can give this permission, or untick it and claim the listing without it.',
    })
  })

  test('is the constant line, now and for future events, so their next night needs no re-ask', () => {
    expect(claimYes({ ticked: true, authority: true }, AT)).toEqual({ state: 'given', words: PERMISSION_WORDS, scope: 'current_and_future', at: AT })
    expect(PERMISSION_WORDS).toBe("Yes, you're welcome to use our event promotional material for EventLinqs listings and social posts, now and for future events.")
  })

  test("tick 2 is the claim page's words for a venue, and the same sentence for one event", () => {
    expect(claimAuthorityWords('venue')).toBe('I run this venue or act for it, and I can give this permission.')
    expect(claimAuthorityWords('event')).toBe('I run this event or act for it, and I can give this permission.')
    for (const w of [PERMISSION_WORDS, claimAuthorityWords('venue'), claimAuthorityWords('event')]) expect(w).not.toMatch(/[–—!]/)
  })
})

function claimFake() {
  const sent: string[] = []
  const order: string[] = []
  const kept: (ClaimYes | null)[] = []
  let claimId = ''
  const d: ClaimDeps = {
    hostOf: async () => ({ name: "Beav's Bar", publishedEmail: 'hello@beavsbar.com.au', websiteUrl: null }),
    insertClaim: async (row) => {
      claimId = row.id
    },
    send: async (_to, email) => {
      sent.push(email.text)
    },
    organisationOf: async () => 'org-1',
    makeOrganisation: async () => 'org-new',
    keepYes: async (_id, yes) => {
      order.push('keepYes')
      kept.push(yes)
    },
    check: async (id, hash) => {
      order.push('check')
      return hash === hashClaimCode(id, /code is (\d{6})/.exec(sent[0])?.[1] ?? '') ? 'verified' : 'wrong'
    },
    claimOf: async (id) => (id === claimId ? { userId: 'u1', target: VENUE } : null),
  }
  return { d, sent, order, kept }
}

describe('a claim that carries a yes', () => {
  test('keeps the yes on the claim before the code is tried, so the database writes it with the move and only then', async () => {
    const { d, sent, order, kept } = claimFake()
    const started = await startClaim({ target: VENUE, userId: 'u1', name: 'Sam', role: 'Manager', namedEmail: null, at: AT }, d)
    if (started.state !== 'sent') throw new Error('not sent')
    const yes = { words: PERMISSION_WORDS, scope: 'current_and_future', at: AT } as const
    const code = /code is (\d{6})/.exec(sent[0])?.[1] ?? ''
    expect(await checkClaim({ claimId: started.claimId, code, userId: 'u1', at: AT, yes }, d)).toBe('verified')
    expect(order).toEqual(['keepYes', 'check'])
    expect(kept).toEqual([yes])
  })

  test('an untick clears it, and the claim still verifies', async () => {
    const { d, sent, kept } = claimFake()
    const started = await startClaim({ target: VENUE, userId: 'u1', name: 'Sam', role: 'Manager', namedEmail: null, at: AT }, d)
    if (started.state !== 'sent') throw new Error('not sent')
    const code = /code is (\d{6})/.exec(sent[0])?.[1] ?? ''
    expect(await checkClaim({ claimId: started.claimId, code, userId: 'u1', at: AT, yes: null }, d)).toBe('verified')
    expect(kept).toEqual([null])
  })

  test('nothing is kept for someone who did not start the claim, or for a code that is not six digits', async () => {
    const { d, order } = claimFake()
    const started = await startClaim({ target: VENUE, userId: 'u1', name: 'Sam', role: 'Manager', namedEmail: null, at: AT }, d)
    if (started.state !== 'sent') throw new Error('not sent')
    expect(await checkClaim({ claimId: started.claimId, code: '123456', userId: 'u2', at: AT, yes: null }, d)).toBe('not_yours')
    expect(await checkClaim({ claimId: started.claimId, code: 'abc', userId: 'u1', at: AT, yes: null }, d)).toBe('wrong')
    expect(order).toEqual([])
  })
})

type Call = { name: string; args: Record<string, unknown> }

function mediaFake(answer: (call: Call) => { data: unknown; error: { code: string; message: string } | null }) {
  const calls: Call[] = []
  const stored: string[] = []
  const removed: string[] = []
  const d: MediaDeps = {
    process: async (bytes) => {
      if (bytes.byteLength === 3) throw new Error('not an image')
      return { buffer: Buffer.from('webp'), extension: 'webp', contentType: 'image/webp' }
    },
    store: async (path) => {
      stored.push(path)
      return `https://test.supabase.co/storage/v1/object/public/organiser-media/${path}`
    },
    remove: async (paths) => {
      removed.push(...paths)
    },
    rpc: async (name, args) => {
      const call = { name, args }
      calls.push(call)
      return answer(call)
    },
  }
  return { d, calls, stored, removed }
}

const PHOTO = new File([new Uint8Array(2048)], 'night.jpg', { type: 'image/jpeg' })

describe('the organiser adds an image', () => {
  test('re-encoded, stored, then registered by the database as theirs, pending a person\'s approval', async () => {
    const { d, calls, stored } = mediaFake(() => ({ data: 'asset-1', error: null }))
    const done = await addOrganiserMedia({ userId: 'u1', eventId: 'e1', file: PHOTO, kind: 'photo', attribution: 'Photo: AMCF', restrictions: null }, d)
    expect(done).toEqual({ state: 'done', id: 'asset-1' })
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatch(/^e1\/[0-9a-f-]{36}\.webp$/)
    expect(calls).toEqual([
      {
        name: 'organiser_media_add',
        args: {
          p_user: 'u1',
          p_event: 'e1',
          p_asset_url: `https://test.supabase.co/storage/v1/object/public/organiser-media/${stored[0]}`,
          p_original_name: 'night.jpg',
          p_kind: 'photo',
          p_attribution: 'Photo: AMCF',
          p_restrictions: null,
        },
      },
    ])
  })

  test('refused by the database (no yes, not their night) takes its words, and the stored file is removed', async () => {
    const { d, stored, removed } = mediaFake(() => ({ data: null, error: { code: '23514', message: 'refused: you do not run this night.' } }))
    const done = await addOrganiserMedia({ userId: 'u2', eventId: 'e1', file: PHOTO, kind: 'photo', attribution: null, restrictions: null }, d)
    expect(done).toEqual({ state: 'refused', reason: 'You do not run this night.' })
    expect(removed).toEqual(stored)
  })

  test('is refused before anything is stored when there is no file, it is too large, or it is not an image', async () => {
    const { d, stored, calls } = mediaFake(() => ({ data: 'x', error: null }))
    const empty = new File([], '', { type: 'application/octet-stream' })
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' })
    const junk = new File([new Uint8Array(3)], 'x.jpg', { type: 'image/jpeg' })
    expect(await addOrganiserMedia({ userId: 'u1', eventId: 'e1', file: empty, kind: 'photo', attribution: null, restrictions: null }, d)).toEqual({ state: 'refused', reason: 'Choose a photo or artwork to add.' })
    expect(await addOrganiserMedia({ userId: 'u1', eventId: 'e1', file: big, kind: 'photo', attribution: null, restrictions: null }, d)).toEqual({ state: 'refused', reason: 'The image must be under 10MB.' })
    expect(await addOrganiserMedia({ userId: 'u1', eventId: 'e1', file: junk, kind: 'photo', attribution: null, restrictions: null }, d)).toEqual({ state: 'refused', reason: 'That image could not be read. Try a JPEG or PNG.' })
    expect(stored).toEqual([])
    expect(calls).toEqual([])
  })

  test('a database fault that is not a refusal is thrown, never shown as a refusal', async () => {
    const { d, removed, stored } = mediaFake(() => ({ data: null, error: { code: '08006', message: 'connection lost' } }))
    await expect(addOrganiserMedia({ userId: 'u1', eventId: 'e1', file: PHOTO, kind: 'photo', attribution: null, restrictions: null }, d)).rejects.toThrow(/connection lost/)
    expect(removed).toEqual(stored)
  })
})

describe('the organiser replaces and withdraws', () => {
  test('a replacement is a new stored image the database links to the one it replaces', async () => {
    const { d, calls, stored } = mediaFake(() => ({ data: { id: 'asset-2', old_path: 'e1/old.webp' }, error: null }))
    expect(await replaceOrganiserMedia({ userId: 'u1', assetId: 'asset-1', file: PHOTO }, d)).toEqual({ state: 'done', id: 'asset-2' })
    expect(calls[0]).toEqual({
      name: 'organiser_media_replace',
      args: { p_user: 'u1', p_asset: 'asset-1', p_asset_url: `https://test.supabase.co/storage/v1/object/public/organiser-media/${stored[0]}`, p_original_name: 'night.jpg' },
    })
  })

  test('withdrawing one image marks it in the database first, then removes its file', async () => {
    const order: string[] = []
    const { d } = mediaFake(() => {
      order.push('rpc')
      return { data: ['e1/a.webp'], error: null }
    })
    const remove = d.remove
    d.remove = async (paths) => {
      order.push('remove')
      await remove(paths)
    }
    expect(await withdrawOrganiserMedia({ userId: 'u1', assetId: 'asset-1', reason: 'We would rather use a newer photo' }, d)).toEqual({ state: 'done', id: 'asset-1' })
    expect(order).toEqual(['rpc', 'remove'])
  })

  test('withdrawing the yes withdraws every image under it and removes each file', async () => {
    const { d, calls, removed } = mediaFake(() => ({ data: ['e1/a.webp', 'e2/b.webp'], error: null }))
    expect(await withdrawOrganiserYes({ userId: 'u1', permissionId: 'p1', reason: 'No longer' }, d)).toEqual({ state: 'done', id: 'p1' })
    expect(calls[0]).toEqual({ name: 'organiser_permission_withdraw', args: { p_user: 'u1', p_permission: 'p1', p_reason: 'No longer' } })
    expect(removed).toEqual(['e1/a.webp', 'e2/b.webp'])
  })

  test('a withdrawal needs a reason of a few words, and is refused in the database\'s words for someone else\'s image', async () => {
    const { d, calls } = mediaFake(() => ({ data: null, error: { code: '23514', message: 'refused: that image is not yours.' } }))
    expect(await withdrawOrganiserMedia({ userId: 'u1', assetId: 'asset-1', reason: ' ' }, d)).toEqual({ state: 'refused', reason: 'Say in a few words why, so we can tell the team.' })
    expect(calls).toEqual([])
    expect(await withdrawOrganiserMedia({ userId: 'u9', assetId: 'asset-1', reason: 'Not ours any more' }, d)).toEqual({ state: 'refused', reason: 'That image is not yours.' })
  })
})

describe('the regular nights', () => {
  test("kept or paused by the database's function, its refusal in its own words", async () => {
    const { d, calls } = mediaFake(() => ({ data: 'paused', error: null }))
    expect(await keepOrganiserSeries({ userId: 'u1', seriesId: 's1', keep: false }, d)).toEqual({ state: 'done', id: 's1' })
    expect(calls[0]).toEqual({ name: 'organiser_series_keep', args: { p_user: 'u1', p_series: 's1', p_keep: false } })
    const no = mediaFake(() => ({ data: null, error: { code: '23514', message: 'refused: those nights are not yours.' } }))
    expect(await keepOrganiserSeries({ userId: 'u9', seriesId: 's1', keep: true }, no.d)).toEqual({ state: 'refused', reason: 'Those nights are not yours.' })
  })
})

describe('the address the code goes to, as the claim page shows it', () => {
  test('is masked to its first letter and its domain, and absent for anything that is not an address', async () => {
    const { maskAddress } = await import('@/lib/listings/claim')
    expect(maskAddress(' Hello@BeavsBar.com.au ')).toBe('h***@beavsbar.com.au')
    expect(maskAddress(null)).toBeNull()
    expect(maskAddress('not an address')).toBeNull()
  })
})

describe('the yes given again from the organiser’s page', () => {
  test('needs both ticks, then sends the constant words with their claim to the database, its refusal in its own words', async () => {
    const { giveOrganiserYes } = await import('@/lib/listings/organiser-media')
    const { d, calls } = mediaFake(() => ({ data: 'yes-2', error: null }))
    expect(await giveOrganiserYes({ userId: 'u1', claimId: 'c1', ticked: false, authority: true }, d)).toEqual({ state: 'refused', reason: 'Tick the permission to give it.' })
    expect(await giveOrganiserYes({ userId: 'u1', claimId: 'c1', ticked: true, authority: false }, d)).toEqual({
      state: 'refused',
      reason: 'Confirm you can give this permission, or untick it and claim the listing without it.',
    })
    expect(calls).toEqual([])
    expect(await giveOrganiserYes({ userId: 'u1', claimId: 'c1', ticked: true, authority: true }, d)).toEqual({ state: 'done', id: 'yes-2' })
    expect(calls).toEqual([{ name: 'organiser_permission_give', args: { p_user: 'u1', p_claim: 'c1', p_words: PERMISSION_WORDS } }])
    const no = mediaFake(() => ({ data: null, error: { code: '23514', message: 'refused: your permission is already on record.' } }))
    expect(await giveOrganiserYes({ userId: 'u1', claimId: 'c1', ticked: true, authority: true }, no.d)).toEqual({ state: 'refused', reason: 'Your permission is already on record.' })
  })
})
