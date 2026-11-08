import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * FOLLOW THE HOST (car 57; Lawal, 7 November 2026, 06:57: every event shows Follow the host). A night EventLinqs lists names
 * its venue as its host and hides the organiser card (the listings organisation must never show, shown-organiser.ts), so
 * before this car a listed night, most of the guide, had nothing to follow. Source assertions, as the organiser card's own
 * test does (organiser-card-links-to-the-organiser.test.ts); the driven proof is the walk on www at 390 and 1440.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')
const PAGE = read('src/app/events/[slug]/page.tsx')
const ACTIONS = read('src/app/actions/follow.ts')
const BUTTON = read('src/components/features/follow/follow-button.tsx')
const MIGRATION = read('supabase/migrations/20261108110001_follows_take_a_venue.sql')

describe('the host card on a listed night', () => {
  test('it stands exactly where the organiser card is hidden, and only with a venue to name', () => {
    expect(PAGE).toContain('shownOrganiser(event, event.organisation).slug === null && event.venue_id && event.venue_name && (')
    expect(PAGE).toContain('<SectionHeader eyebrow="Hosted by"')
  })
  test("it links the venue's own page by the route's own handle, and Follow is a sibling, never inside the link", () => {
    const card = PAGE.indexOf('data-host-card="venue"')
    const link = PAGE.indexOf('href={`/venues/${venueSlugify(event.venue_name)}`}', card)
    const close = PAGE.indexOf('</Link>', link)
    const follow = PAGE.indexOf('<FollowButton type="venue" id={event.venue_id}', card)
    expect(card).toBeGreaterThan(-1)
    expect(link).toBeGreaterThan(card)
    expect(follow).toBeGreaterThan(close)
  })
})

describe('a venue can be followed', () => {
  test('the action writes follows with followable_type venue, on a uuid only', () => {
    expect(ACTIONS).toMatch(/export async function toggleFollowVenue\(venueId: string\)/)
    expect(ACTIONS).toContain("return toggleFollow('venue', parsed.data)")
    expect(ACTIONS).toContain("const idSchema = input.type === 'artist' || input.type === 'venue' ? UuidSchema : SlugSchema")
  })
  test('the button takes a venue and toggles it', () => {
    expect(BUTTON).toContain("type FollowType = 'organiser' | 'artist' | 'subgenre' | 'venue'")
    expect(BUTTON).toContain("if (type === 'venue') return toggleFollowVenue(id)")
  })
  test('the database takes it: the migration widens the one rule, nothing else', () => {
    expect(MIGRATION).toContain("check (followable_type in ('artist', 'subgenre', 'venue'))")
    expect(MIGRATION).not.toMatch(/drop table|delete from|truncate/i)
  })
})
