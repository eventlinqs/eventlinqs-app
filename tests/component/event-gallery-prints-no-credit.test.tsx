import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { EventGallery } from '@/components/features/events/event-gallery'

/*
 * THE EVENT PAGE'S GALLERY PRINTS NO PHOTO CREDIT (law 17 (d) as narrowed by Lawal, 19 November 2026, 11:36: "Don't make
 * my site unprofessional ... I don't go to any of these ticketing platforms or see any photo credit ... You don't put no
 * photo credit"). An organiser's photograph given with permission is shown with no credit line, under the image or in
 * the lightbox; its permission stays recorded in the register, never printed. Found on production by WINDOW 5C's sweep
 * (21 November 2026, 390): the event page printed 'Photo: EventLinqs Test Organiser (acceptance tests)'.
 */
describe('the event gallery prints no photo credit', () => {
  const images = [
    { url: 'https://x/amcf-1.jpg', alt: 'Dancers at Fed Square', credit: 'AMCF, past festival' },
    { url: 'https://x/other.jpg', alt: 'The stage' },
  ]

  it('prints no credit line under an image that carries a recorded credit, only that an archival one is from a past one', () => {
    const { container } = render(<EventGallery eventTitle="African Music and Cultural Festival 2026" images={images} />)
    expect(container.textContent).not.toMatch(/Photos?:/)
    expect(container.textContent).not.toContain('AMCF, past festival')
    // The project manager's ruling of 29 October 2026: an archival photograph says it is from a past festival, no name.
    expect(screen.getAllByText('From a past festival')).toHaveLength(1)
  })

  it('prints nothing under an image whose recorded credit is only a name', () => {
    const { container } = render(
      <EventGallery eventTitle="A night" images={[{ url: 'https://x/a.jpg', alt: '', credit: 'EventLinqs Test Organiser (acceptance tests)' }]} />,
    )
    expect(container.textContent).not.toContain('EventLinqs Test Organiser')
    expect(container.querySelectorAll('li p')).toHaveLength(0)
  })

  it('prints no credit line in the lightbox either', () => {
    render(<EventGallery eventTitle="African Music and Cultural Festival 2026" images={images} />)
    fireEvent.click(screen.getAllByRole('button')[0])
    expect(document.body.textContent).toContain('Dancers at Fed Square')
    expect(document.body.textContent).not.toMatch(/Photos?:/)
    expect(document.body.textContent).not.toContain('AMCF, past festival')
  })
})
