import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EventGallery } from '@/components/features/events/event-gallery'

/*
 * THE EVENT PAGE'S GALLERY PRINTS AN ORGANISER'S CREDIT UNDER THEIR PHOTOGRAPH (window 6's gap 3 of 30 October 2026):
 * 'Photo: <credit>' under an image that carries one (set on the server only where its rights are on record), nothing
 * under one that does not.
 */
describe('the event gallery and its credits', () => {
  it('prints the credit under the credited image only', () => {
    render(
      <EventGallery
        eventTitle="African Music and Cultural Festival 2026"
        images={[
          { url: 'https://x/amcf-1.jpg', alt: 'Dancers at Fed Square', credit: 'AMCF, past festival' },
          { url: 'https://x/other.jpg', alt: 'The stage' },
        ]}
      />,
    )
    expect(screen.getAllByText('Photo: AMCF, past festival')).toHaveLength(1)
    expect(screen.queryByText(/Photo: .*other/)).toBeNull()
  })

  it('prints no credit line when no image carries one', () => {
    const { container } = render(<EventGallery eventTitle="A night" images={[{ url: 'https://x/a.jpg', alt: '' }]} />)
    expect(container.textContent).not.toMatch(/Photo:/)
  })
})
