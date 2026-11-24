import { describe, expect, it, vi } from 'vitest'
import { NIGHT, NOW, OTHER, SENDER, media, png, reply, world } from '../../helpers/emailed-media-harness'

/*
 * AN EMAILED YES IS A YES (the master directive's A3 (2); the PM's 13:55 of 23 November 2026: "an organiser who writes
 * yes in the thread (as GroovyTown did) is recorded as the grant from their own words, with their attachments
 * ingested"). GroovyTown wrote: "you're welcome to use our event promotional material for EventLinqs listings and social
 * posts, now and for future events". The inbox run read that as no class it knew ('unclear'), so the yes was never kept.
 *
 * The yes is recorded through the inbox run's own 'permission' class and the database's one way of logging a yes
 * (social_log_organiser_yes), never a new permission rule: their words verbatim, channel email, dated when it came, and
 * night by night (the photo page's own rule: a host keyed future yes would grant every other organiser's nights at a
 * hired venue). The organiser and nights below are made up.
 */

vi.mock('@/lib/outreach/their-nights', () => ({ readTheirNights: vi.fn(async () => [NIGHT, OTHER]) }))
const { classifyInbound, handleInbox } = await import('@/lib/outreach/replies')

const GROOVY = "Hi Lawal,\n\nYou're welcome to use our event promotional material for EventLinqs listings and social posts, now and for future events.\n\nCheers,\nSam"
const run = (w: ReturnType<typeof world>, text: string, over: Parameters<typeof reply>[0] = {}, files?: () => Promise<{ name: string; contentType: string; bytes: ArrayBuffer }[]>) =>
  handleInbox(w.db, [reply({ text, hasAttachments: Boolean(files), ...over })], {
    mailbox: 'lawal@eventlinqs.com',
    origin: 'https://www.eventlinqs.com.au',
    actingUser: 'user-lawal',
    now: NOW,
    ...(files ? { intake: { files, media: media([]) } } : {}),
  } as never)

describe('THEIR YES, IN THEIR WORDS', () => {
  it("GroovyTown's words are the 'permission' class (read as 'unclear' before), with a typed or a curly apostrophe", () => {
    for (const text of [GROOVY, GROOVY.replace("You're", 'You’re'), 'You are most welcome to use the flyer.']) {
      const kind = classifyInbound({ subject: 'Re: The Poster Night', fromAddress: SENDER, text, headers: {}, hasAttachments: false })
      expect(kind, text).toMatchObject({ kind: 'reply', outcome: 'permission' })
    }
  })

  it('their words naming their future events: the yes is logged for each of their nights ahead, night by night, verbatim, by email, dated when it came', async () => {
    const w = world()
    const report = await run(w, GROOVY)
    expect(w.yeses).toHaveLength(2)
    for (const [i, night] of [NIGHT, OTHER].entries()) {
      expect(w.yeses[i]).toEqual({
        p_host: 'The Hall',
        p_granted_at: '2026-11-09T02:15:00Z',
        p_wording: GROOVY.trim(),
        p_scope: 'this_event',
        p_channel: 'email',
        p_event: night.eventId,
        p_logged_by: 'user-lawal',
        p_evidence_file: `email <reply-1@theatre.example> from ${SENDER}`,
      })
    }
    expect(report.replies[0]).toMatchObject({ outcome: 'permission' })
    expect(report.replies[0].action).toMatch(/their yes is recorded from their own words for The Poster Night, The Second Night/)
  })

  it('a yes that names no future events is logged for the night the thread is about, and only that night', async () => {
    const w = world()
    await run(w, 'Hi Lawal,\n\nYes, you can use the poster for this one.\n\nSam')
    expect(w.yeses.map((y) => y.p_event)).toEqual([NIGHT.eventId])
  })

  it('a yes whose thread names no night of theirs, and no future events, is not guessed: it waits for Lawal, said so', async () => {
    const w = world()
    const report = await run(w, 'Hi,\n\nFeel free to use our photos.\n\nSam', { inReplyTo: null })
    expect(w.yeses).toHaveLength(0)
    expect(report.replies[0].action).toMatch(/their yes is not recorded: .*no night of theirs on EventLinqs is named by the thread/)
  })

  it("a yes from a contact of the platform's own listings organisation is never logged: it is no host (the guard growth-reads-skip-the-platform)", async () => {
    const w = world()
    w.tables.organisations = [{ id: 'org-platform', slug: 'eventlinqs-listings' }]
    w.tables.organisers[0].organisation_id = 'org-platform'
    const report = await run(w, GROOVY)
    expect(w.yeses).toHaveLength(0)
    expect(report.replies[0].action).toMatch(/their yes is not recorded: the sender is a contact of the platform's own listings organisation, which is no host/)
  })

  it('words of ours quoted in their reply are never their yes', async () => {
    const w = world()
    await run(w, 'Thanks, we will think about it.\n\nOn Mon, 9 Nov 2026, Lawal wrote:\n> If you say yes, you can use our page to sell tickets. You are welcome to use it.')
    expect(w.yeses).toHaveLength(0)
  })

  it('WITH THEIR ATTACHMENTS INGESTED: the yes comes first, so the poster sent with it is registered under it, organiser authorised', async () => {
    const w = world({ grantFor: [] })
    const bytes = await png(1122, 1402)
    await run(w, GROOVY, {}, async () => [{ name: 'The Poster Night_poster.png', contentType: 'image/png', bytes }])
    expect(w.yeses).toHaveLength(2)
    expect(w.tables.social_assets).toHaveLength(1)
    expect(w.tables.social_assets[0]).toMatchObject({ event_id: NIGHT.eventId, asset_state: 'organiser_authorised', asset_type: 'artwork' })
  }, 30000)
})
