import { describe, it, expect } from 'vitest'
import { parseEventsSearchParams, hasActiveFilters } from '@/lib/events/search-params'
import {
  DATE_TO_PRESET,
  EVENT_TYPE_MAP,
  buildEventTypeTagOrFilter,
  resolveCityName,
  resolveMoment,
  resolveSuburb,
  venueSearchTerm,
} from '@/lib/events/url-filters'
import { CITY_EVENT_TYPES, getAllCities, getAllSuburbs } from '@/lib/cities/data'

/**
 * THE DEFECT CLASS THESE TESTS EXIST FOR.
 *
 * Twelve query parameters appeared in real hrefs a user could click and none
 * was parsed. Nothing 404d, nothing errored, every page rendered perfectly:
 * the filter was dropped and the whole national catalogue was served as though
 * it were the answer. A user cannot tell that apart from a correct answer,
 * which is why it survived every gate the platform has.
 *
 * So the assertions below are deliberately about the PARAMETER, not about the
 * component that emits it: each one names a real link and asserts the filter
 * it carries actually arrives.
 */
describe('URL filters that appear in real hrefs', () => {
  describe('city, emitted by every city and community-by-city View all', () => {
    it('parses the city slug', () => {
      expect(parseEventsSearchParams({ city: 'melbourne' }).filters.city).toBe('melbourne')
    })

    it('resolves a multi-word slug to the display name venue_city actually holds', () => {
      // The regression: ilike('venue_city', '%gold-coast%') matches nothing,
      // because the column holds "Gold Coast". Single-word cities survived the
      // mismatch by accident, which is why it was never noticed.
      expect(resolveCityName('gold-coast')).toBe('Gold Coast')
      expect(resolveCityName('sunshine-coast')).toBe('Sunshine Coast')
      expect(resolveCityName('melbourne')).toBe('Melbourne')
    })

    it('resolves every city the platform lists, not just the ones with one word', () => {
      for (const city of getAllCities()) {
        expect(resolveCityName(city.slug)).toBe(city.name)
      }
    })

    it('passes a hand-typed display name through unchanged', () => {
      expect(resolveCityName('Geelong')).toBe('Geelong')
    })
  })

  describe('date, emitted by the homepage rail, header overlay and city landings', () => {
    it.each([
      ['weekend', 'weekend'],
      ['today', 'today'],
      ['7d', '7d'],
      ['month', 'month'],
    ])('maps date=%s to preset %s', (date, preset) => {
      expect(parseEventsSearchParams({ date }).filters.preset).toBe(preset)
    })

    it('maps the homepage This Week rail (date=week) onto the seven-day window', () => {
      expect(parseEventsSearchParams({ date: 'week' }).filters.preset).toBe('7d')
    })

    it('lets an explicit preset win over the alias so nothing already working changes', () => {
      expect(parseEventsSearchParams({ preset: 'today', date: 'weekend' }).filters.preset).toBe('today')
    })

    it('drops an unknown date rather than inventing a window', () => {
      expect(parseEventsSearchParams({ date: 'someday' }).filters.preset).toBeUndefined()
    })

    it('maps every value in the alias table to a preset the fetcher accepts', () => {
      for (const [date, preset] of Object.entries(DATE_TO_PRESET)) {
        expect(parseEventsSearchParams({ date }).filters.preset).toBe(preset)
      }
    })
  })

  describe('the two other spellings of free events', () => {
    it('parses free=1 from the header-search Free events shortcut', () => {
      expect(parseEventsSearchParams({ free: '1' }).filters.preset).toBe('free')
    })

    it('parses price=free from the category highlight slides', () => {
      expect(parseEventsSearchParams({ price: 'free' }).filters.preset).toBe('free')
    })
  })

  describe('sort, where an emitted value was not one the parser accepted', () => {
    it('maps sort=trending onto popularity instead of dropping it', () => {
      // Emitted by the "Trending now" slide. It was silently discarded, so the
      // link was indistinguishable from an unsorted browse.
      expect(parseEventsSearchParams({ sort: 'trending' }).filters.sort).toBe('popularity')
    })

    it('leaves the four real sorts alone', () => {
      for (const sort of ['relevance', 'date_asc', 'price_asc', 'popularity']) {
        expect(parseEventsSearchParams({ sort }).filters.sort).toBe(sort)
      }
    })
  })

  describe('event_type, the eight city format tiles', () => {
    it('has a mapping for every tile the city page renders', () => {
      // A tile with no mapping links to a permanently empty result: a dead-end
      // tile, which Law 5 treats as the same defect as a 404.
      for (const type of CITY_EVENT_TYPES) {
        expect(EVENT_TYPE_MAP[type.slug], `no mapping for tile ${type.slug}`).toBeDefined()
      }
    })

    it('resolves each type to at least one tag and builds a tag filter', () => {
      for (const type of CITY_EVENT_TYPES) {
        expect(EVENT_TYPE_MAP[type.slug].tags.length).toBeGreaterThan(0)
        expect(buildEventTypeTagOrFilter(type.slug)).toContain('tags.cs.')
      }
    })

    it('parses a known type and drops an unknown one', () => {
      expect(parseEventsSearchParams({ event_type: 'comedy' }).filters.event_type).toBe('comedy')
      // Dropped, not passed through: an unmapped value would narrow to nothing
      // and read as "this city has no such events" rather than "not a type".
      expect(parseEventsSearchParams({ event_type: 'juggling' }).filters.event_type).toBeUndefined()
    })
  })

  describe('suburb, emitted by the suburb landing Open in browse view', () => {
    it('resolves the city-facing half of the slug that the link actually carries', () => {
      // The page emits `?city=melbourne&suburb=inner-melbourne`; the stored
      // slug is `melbourne-inner-melbourne`.
      const resolved = resolveSuburb('melbourne', 'inner-melbourne')
      expect(resolved?.slug).toBe('melbourne-inner-melbourne')
      expect(resolved?.name).toBe('Inner Melbourne')
      expect(typeof resolved?.latitude).toBe('number')
      expect(typeof resolved?.longitude).toBe('number')
    })

    it('resolves every suburb page the platform ships', () => {
      for (const suburb of getAllSuburbs()) {
        const cityFacing = suburb.slug.slice(suburb.citySlug.length + 1)
        expect(resolveSuburb(suburb.citySlug, cityFacing)?.slug, suburb.slug).toBe(suburb.slug)
      }
    })

    it('returns null for an unknown suburb rather than guessing one', () => {
      expect(resolveSuburb('melbourne', 'not-a-suburb')).toBeNull()
    })
  })

  describe('venue, which arrives in two different shapes from two surfaces', () => {
    it('turns the profile page handle back into a name match', () => {
      expect(venueSearchTerm('the-forum-melbourne')).toBe('the forum melbourne')
    })

    it('leaves the homepage rail name alone', () => {
      expect(venueSearchTerm('Sidney Myer Music Bowl')).toBe('Sidney Myer Music Bowl')
    })

    it('parses either shape', () => {
      expect(parseEventsSearchParams({ venue: 'factory-theatre' }).filters.venue).toBe('factory-theatre')
      expect(parseEventsSearchParams({ venue: 'Factory Theatre' }).filters.venue).toBe('Factory Theatre')
    })
  })

  describe('organiser and faith', () => {
    it('parses the organisation slug from the organiser profile View all', () => {
      expect(parseEventsSearchParams({ organiser: 'owambe-sydney' }).filters.organiser).toBe('owambe-sydney')
    })

    it('parses a known faith and drops an unknown one', () => {
      expect(parseEventsSearchParams({ faith: 'christian' }).filters.faith).toBe('christian')
      expect(parseEventsSearchParams({ faith: 'pastafarian' }).filters.faith).toBeUndefined()
    })
  })

  describe('moment, emitted by the homepage community-moments bento', () => {
    it('resolves a moment to its heritage and its window', () => {
      const moment = resolveMoment('naidoc-week-2026')
      expect(moment?.community).toBe('aboriginal-torres-strait-islander')
      expect(moment?.from.startsWith('2026-07-05')).toBe(true)
      // The window is inclusive of its final day.
      expect(moment?.to.startsWith('2026-07-12')).toBe(true)
    })

    it('applies both halves through the parser', () => {
      const { filters } = parseEventsSearchParams({ moment: 'naidoc-week-2026' })
      expect(filters.community).toBe('aboriginal-torres-strait-islander')
      expect(filters.from).toBeDefined()
      expect(filters.to).toBeDefined()
    })

    it('lets an explicit community win over the one the moment implies', () => {
      const { filters } = parseEventsSearchParams({ moment: 'naidoc-week-2026', community: 'african' })
      expect(filters.community).toBe('african')
    })

    it('drops an unknown moment', () => {
      expect(parseEventsSearchParams({ moment: 'not-a-moment' }).filters.moment).toBeUndefined()
    })
  })

  describe('tab and focus, which are scope and UI rather than filters', () => {
    it('parses the three header-search tabs that route to /events', () => {
      for (const tab of ['communities', 'cities', 'organisers']) {
        expect(parseEventsSearchParams({ tab }).tab).toBe(tab)
      }
    })

    it('falls back to the events scope for an unknown tab', () => {
      expect(parseEventsSearchParams({ tab: 'nonsense' }).tab).toBe('events')
      expect(parseEventsSearchParams({}).tab).toBe('events')
    })

    it('parses focus=1 from the mobile Search nav item', () => {
      expect(parseEventsSearchParams({ focus: '1' }).focusSearch).toBe(true)
      expect(parseEventsSearchParams({}).focusSearch).toBe(false)
    })
  })

  describe('hasActiveFilters, the predicate that chooses the cached path', () => {
    // This is the trap that would have made the whole fix invisible: a filter
    // missing from this predicate is treated as the unfiltered default case,
    // which routes to the CACHED fetch and serves a snapshot taken with no
    // filters at all. The filter parses correctly and is then thrown away.
    it.each([
      ['city', { city: 'melbourne' }],
      ['suburb', { suburb: 'inner-melbourne' }],
      ['event_type', { event_type: 'comedy' }],
      ['venue', { venue: 'factory-theatre' }],
      ['organiser', { organiser: 'owambe-sydney' }],
      ['faith', { faith: 'christian' }],
      ['moment', { moment: 'naidoc-week-2026' }],
      ['date', { date: 'weekend' }],
      ['free', { free: '1' }],
      ['price', { price: 'free' }],
    ])('treats %s as an active filter', (_name, raw) => {
      expect(hasActiveFilters(parseEventsSearchParams(raw).filters)).toBe(true)
    })

    it('still treats a bare browse as unfiltered', () => {
      expect(hasActiveFilters(parseEventsSearchParams({}).filters)).toBe(false)
      // A scope tab and a focus hint narrow nothing, so they must not knock the
      // bare browse off the cached path.
      expect(hasActiveFilters(parseEventsSearchParams({ tab: 'cities', focus: '1' }).filters)).toBe(false)
    })
  })
})
