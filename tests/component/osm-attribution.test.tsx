import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import { OsmAttribution } from '@/components/features/events/osm-attribution'

/**
 * OPENSTREETMAP'S CREDIT (WI2 Part 3, first slice): the city guide's hosts were
 * placed by Nominatim on 27 October 2026, so every map that places a venue by
 * its stored coordinates carries the credit and the licence, linked.
 */
describe('OsmAttribution', () => {
  it('credits OpenStreetMap contributors, links the copyright page and names the licence', () => {
    render(<OsmAttribution />)
    const link = screen.getByRole('link', { name: 'OpenStreetMap contributors' })
    expect(link).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright')
    expect(link).toHaveAttribute('rel', 'noreferrer noopener')
    expect(screen.getByText(/Open Database License/)).toBeInTheDocument()
  })

  it.each([
    'src/components/features/city/city-map.tsx',
    'src/components/features/events/m5-events-map.tsx',
    'src/components/features/events/venue-map.tsx',
  ])('%s renders the credit beside its map', (file) => {
    expect(readFileSync(file, 'utf8')).toMatch(/<OsmAttribution\b/)
  })
})
