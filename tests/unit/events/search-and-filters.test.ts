import { describe, it, expect } from 'vitest'
import {
  tokenise,
  sanitiseToken,
  buildTokenOrGroup,
  buildSearchOrGroups,
} from '@/lib/events/search-query'
import { parseEventsSearchParams, hasActiveFilters } from '@/lib/events/search-params'
import { resolveSearchTab, resolveCommunityQuery } from '@/lib/events/search-tab'
import { EVENT_TYPE_FILTER, buildEventTypeTagOr, isKnownEventType } from '@/lib/events/event-type-filter'
import { CITY_EVENT_TYPES } from '@/lib/cities/data'

/**
 * Each block below names the observed defect it locks shut. Every one of these
 * assertions fails against the code as it was before this sweep: search was
 * `ilike('title', '%q%')` and parseEventsSearchParams had no city, date,
 * suburb, event_type, venue or tab key at all.
 */

describe('search tokenisation', () => {
  it('splits a multi-word query so the words need not be adjacent in a title', () => {
    // The defect: "jazz soul" was one substring, so it only matched a title
    // literally containing "jazz soul".
    expect(tokenise('jazz soul')).toEqual(['jazz', 'soul'])
    expect(tokenise('  live   music   melbourne ')).toEqual(['live', 'music', 'melbourne'])
  })

  it('drops characters that would change the shape of a PostgREST filter', () => {
    // A raw comma or parenthesis inside or=(...) is a syntax break, not a
    // search term, and is the obvious injection surface here.
    expect(sanitiseToken('rock,pop')).toBe('rock pop')
    expect(sanitiseToken('a.b(c)')).toBe('a b c')
    expect(sanitiseToken('50%')).toBe('50')
    expect(sanitiseToken('"quoted"')).toBe('quoted')
    expect(sanitiseToken("o'brien")).toBe('o brien')
  })

  it('never emits a filter fragment containing a raw comma from user input', () => {
    for (const group of buildSearchOrGroups('rock,pop (live)')) {
      const values = group.split(',').map((p) => p.split('.').slice(2).join('.'))
      for (const v of values) expect(v).not.toMatch(/[(),]/)
    }
  })

  it('caps token count so a pasted paragraph cannot become 200 OR groups', () => {
    const many = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ')
    expect(tokenise(many).length).toBeLessThanOrEqual(6)
  })

  it('keeps something to search on when every word is very short', () => {
    expect(tokenise('a of').length).toBe(1)
  })

  it('returns nothing for a query that is only punctuation', () => {
    expect(tokenise('...')).toEqual([])
    expect(buildSearchOrGroups('...')).toEqual([])
  })
})

describe('search field coverage', () => {
  it('matches a city, a venue and a description, not only the title', () => {
    // The measured defect: "Melbourne" found 10 events when 29 were in
    // Melbourne; "Geelong" found 4 of 27.
    const group = buildTokenOrGroup('melbourne')
    expect(group).toContain('title.ilike.*melbourne*')
    expect(group).toContain('venue_city.ilike.*melbourne*')
    expect(group).toContain('venue_name.ilike.*melbourne*')
    expect(group).toContain('summary.ilike.*melbourne*')
    expect(group).toContain('description.ilike.*melbourne*')
  })

  it('matches a tag, so a community or genre word finds tagged events', () => {
    expect(buildTokenOrGroup('afrobeats')).toContain('tags.cs.["afrobeats"]')
  })

  it('matches an organiser by id when that organiser name was resolved', () => {
    // The measured defect: "Harbourline Live" found 0 events when that
    // organiser had 16.
    const group = buildTokenOrGroup('harbourline', ['org-1', 'org-2'])
    expect(group).toContain('organisation_id.in.(org-1,org-2)')
  })

  it('omits the organiser clause entirely when no organiser matched', () => {
    expect(buildTokenOrGroup('melbourne')).not.toContain('organisation_id')
  })

  it('produces one AND-ed group per token so extra words narrow the search', () => {
    const groups = buildSearchOrGroups('jazz soul')
    expect(groups).toHaveLength(2)
    expect(groups[0]).toContain('*jazz*')
    expect(groups[1]).toContain('*soul*')
  })
})

describe('URL filters that appear in real hrefs', () => {
  it('parses city, which the city landing emits on three links', () => {
    // Observed on the deployed preview: /events?city=sydney rendered 44 cards,
    // identical to unfiltered /events.
    expect(parseEventsSearchParams({ city: 'sydney' }).filters.city).toBe('sydney')
  })

  it('reads date as the alias for preset that the city rails emit', () => {
    expect(parseEventsSearchParams({ date: 'weekend' }).filters.preset).toBe('weekend')
    expect(parseEventsSearchParams({ date: '7d' }).filters.preset).toBe('7d')
    // The date chips emit `week`, which is not a preset value and would
    // otherwise be silently dropped.
    expect(parseEventsSearchParams({ date: 'week' }).filters.preset).toBe('7d')
  })

  it('lets an explicit preset win over date', () => {
    expect(parseEventsSearchParams({ preset: 'today', date: 'weekend' }).filters.preset).toBe('today')
  })

  it('ignores a date value that is not a real window', () => {
    expect(parseEventsSearchParams({ date: 'someday' }).filters.preset).toBeUndefined()
  })

  it('parses suburb, and lets it win over the city it travels with', () => {
    const f = parseEventsSearchParams({ city: 'sydney', suburb: 'newtown' }).filters
    expect(f.city).toBe('newtown')
  })

  it('parses venue and event_type', () => {
    const f = parseEventsSearchParams({ venue: 'the-espy', event_type: 'concert' }).filters
    expect(f.venue).toBe('the-espy')
    expect(f.event_type).toBe('concert')
  })

  it('parses tab, and rejects a tab that is not one of the four', () => {
    expect(parseEventsSearchParams({ tab: 'cities' }).filters.tab).toBe('cities')
    expect(parseEventsSearchParams({ tab: 'nonsense' }).filters.tab).toBeUndefined()
  })

  it('counts city, venue and event_type as active filters', () => {
    // Otherwise the Recommended rail keeps rendering over a narrowed view.
    expect(hasActiveFilters({ city: 'sydney' })).toBe(true)
    expect(hasActiveFilters({ venue: 'the-espy' })).toBe(true)
    expect(hasActiveFilters({ event_type: 'concert' })).toBe(true)
    expect(hasActiveFilters({})).toBe(false)
  })
})

describe('header search tabs', () => {
  it('scopes the Cities tab to a place instead of a title substring', () => {
    const r = resolveSearchTab('cities', 'Melbourne')
    expect(r.overrides.city).toBe('Melbourne')
    expect(r.keepFreeText).toBe(false)
  })

  it('scopes the Communities tab to a real community', () => {
    expect(resolveSearchTab('communities', 'African').overrides.community).toBe('african')
    expect(resolveSearchTab('communities', 'greek').overrides.community).toBe('greek')
  })

  it('falls back to a normal search when no community matches, never an empty page', () => {
    const r = resolveSearchTab('communities', 'zzzz nothing')
    expect(r.overrides.community).toBeUndefined()
    expect(r.keepFreeText).toBe(true)
  })

  it('restricts the Organisers tab to organiser names only', () => {
    expect(resolveSearchTab('organisers', 'harbourline').organisersOnly).toBe(true)
  })

  it('leaves the Events tab and an absent tab untouched', () => {
    expect(resolveSearchTab('events', 'anything').keepFreeText).toBe(true)
    expect(resolveSearchTab(undefined, 'anything').overrides).toEqual({})
  })

  it('does nothing at all when there is no query to scope', () => {
    expect(resolveSearchTab('cities', '   ').overrides).toEqual({})
  })

  it('resolves a community by slug, by display name, and loosely', () => {
    expect(resolveCommunityQuery('african')).toBe('african')
    expect(resolveCommunityQuery('Greek')).toBe('greek')
    expect(resolveCommunityQuery('nothing here')).toBeNull()
  })
})

describe('city event types resolve onto data that exists', () => {
  it('covers every one of the eight types the city rail renders', () => {
    // The rail links to /events?city=X&event_type=Y for all eight. A type with
    // no mapping is a link that cannot filter.
    for (const t of CITY_EVENT_TYPES) {
      expect(isKnownEventType(t.slug), `no mapping for ${t.slug}`).toBe(true)
    }
  })

  it('gives every type at least one way to match', () => {
    for (const [slug, def] of Object.entries(EVENT_TYPE_FILTER)) {
      expect(def.categories.length + def.tags.length, `${slug} matches nothing`).toBeGreaterThan(0)
    }
  })

  it('matches comedy by tag, because event_categories has no comedy row', () => {
    expect(EVENT_TYPE_FILTER.comedy.categories).toEqual([])
    expect(buildEventTypeTagOr('comedy')).toBe('tags.cs.["comedy"]')
  })

  it('returns null rather than an empty filter for an unknown type', () => {
    expect(buildEventTypeTagOr('not-a-type')).toBeNull()
    expect(isKnownEventType('not-a-type')).toBe(false)
  })
})
