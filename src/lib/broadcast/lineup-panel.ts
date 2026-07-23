import { createAdminClient } from '@/lib/supabase/admin'
import { fetchEventLineup, fetchEventArtistAttribution } from '@/lib/broadcast/artists'
import { buildShortUrl, getOrCreateShareLink } from '@/lib/broadcast/share-links'

/**
 * Lineup loop panel data.
 *
 * One assembler shared by the Launch Kit and the event dashboard so both
 * surfaces show the organiser the SAME thing: every tagged act with the
 * tracked share link that is ready to send, the claim link that hands the act
 * their own profile, and the sales that link actually drove. Mirrors the
 * minting the lineup page already does (channel 'other', artist-scoped, minted
 * once and reused) so a performer never ends up with two different links.
 */

export interface LineupAct {
  artistId: string
  artistSlug: string
  artistName: string
  status: 'confirmed' | 'invited'
  /** True once the performer has claimed their profile (owns the artist row). */
  claimed: boolean
  /** The act's own tracked share link. Null only while an invite is unclaimed. */
  shareUrl: string | null
  /** The link the organiser sends so the act can claim their profile. */
  claimUrl: string | null
  clicks: number
  orders: number
  tickets: number
}

export interface LineupPanelData {
  acts: LineupAct[]
  totals: { clicks: number; orders: number; tickets: number }
}

export async function getLineupPanelData(
  eventId: string,
  origin: string,
  ownerUserId: string,
): Promise<LineupPanelData> {
  const admin = createAdminClient()
  const lineup = await fetchEventLineup(admin, eventId)
  const attribution = await fetchEventArtistAttribution(admin, eventId)
  const byArtist = new Map(attribution.map((a) => [a.artistId, a]))

  const acts: LineupAct[] = []
  for (const row of lineup) {
    let shareUrl: string | null = null
    if (row.status === 'confirmed') {
      const link = await getOrCreateShareLink({
        eventId,
        channel: 'other',
        artistId: row.artist.id,
        createdBy: ownerUserId,
      })
      shareUrl = link ? buildShortUrl(origin, link.code) : null
    }
    const stats = byArtist.get(row.artist.id)
    acts.push({
      artistId: row.artist.id,
      artistSlug: row.artist.slug,
      artistName: row.artist.name,
      status: row.status,
      claimed: Boolean(row.artist.owner_user_id),
      shareUrl,
      claimUrl: row.inviteToken ? `${origin}/artists/claim/${row.inviteToken}` : null,
      clicks: stats?.clicks ?? 0,
      orders: stats?.conversions ?? 0,
      tickets: stats?.tickets ?? 0,
    })
  }

  return {
    acts,
    totals: {
      clicks: acts.reduce((n, a) => n + a.clicks, 0),
      orders: acts.reduce((n, a) => n + a.orders, 0),
      tickets: acts.reduce((n, a) => n + a.tickets, 0),
    },
  }
}
