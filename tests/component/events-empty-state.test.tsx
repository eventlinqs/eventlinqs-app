import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EventsEmptyState } from '@/components/features/events/m5-events-empty-state'

/**
 * THE BROWSE PAGE'S EMPTY STATE SAYS WHICH EMPTINESS IT IS (close-out C17.6,
 * 7 September 2026).
 *
 * Driven on production with no upcoming events, /events said "No events match
 * these filters" and offered "Clear filters" when no filter was set: the wrong
 * words and the wrong next action for a platform that is simply waiting for its
 * first listing. Three states, three sets of words, each with a real next step.
 */
describe('EventsEmptyState', () => {
  it('with no query and no filters, invites the first listing and points at the cities', () => {
    render(<EventsEmptyState />)
    expect(screen.getByRole('heading', { name: 'No events listed yet' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Put on an event' })).toHaveAttribute('href', '/organisers')
    expect(screen.getByRole('link', { name: 'Explore by city' })).toHaveAttribute('href', '/cities')
    expect(screen.queryByText('No events match these filters')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Clear filters' })).toBeNull()
  })

  it('with filters set, says so and offers to clear them', () => {
    render(<EventsEmptyState filtered />)
    expect(screen.getByRole('heading', { name: 'No events match these filters' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute('href', '/events')
  })

  it('with a search query, names the query', () => {
    render(<EventsEmptyState query="owambe" filtered />)
    expect(screen.getByRole('heading', { name: 'No results for "owambe"' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Clear filters' })).toBeInTheDocument()
  })
})
