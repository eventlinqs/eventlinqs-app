/**
 * D3 (3), the venue's own calendar: the answer to giving or stopping it is shown and announced.
 *
 * On success the action refreshes the media page, which then lists the live calendar in place of the give form (and
 * drops a stopped calendar with its stop form). An answer held inside the form unmounts with it, so the 'Thank you'
 * and 'Stopped' lines never showed and a screen reader heard nothing (WCAG 2.2, 4.1.3 Status Messages). This test
 * renders the section as the page does, answers the action, then renders it again as the refreshed page draws it,
 * and reads the status line a visitor gets.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { Fragment, type ReactNode } from 'react'
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react'

const give = vi.fn()
const stop = vi.fn()
vi.mock('@/app/actions/venue-calendar', () => ({
  giveVenueCalendarAction: (...a: unknown[]) => give(...a),
  stopVenueCalendarAction: (...a: unknown[]) => stop(...a),
}))

import * as forms from '@/components/listings/venue-calendar-forms'

// The section's answer holder, when the module has one; without it the forms stand alone as they did.
const Section = ((forms as Record<string, unknown>).VenueCalendarAnswers ?? Fragment) as (p: { children: ReactNode }) => ReactNode

const venues = [{ id: '11111111-1111-4111-8111-111111111111', name: 'The Bended Elbow' }]
const categories = [{ id: '22222222-2222-4222-8222-222222222222', name: 'Live music' }]

/** Every status line in the page: the section's own, and each form's line beside it. */
function statusWords(): string {
  return screen
    .getAllByRole('status')
    .map((s) => s.textContent ?? '')
    .join(' ')
}

afterEach(() => {
  cleanup()
  give.mockReset()
  stop.mockReset()
})

describe('the venue calendar answer outlives the form it came from', () => {
  it('gives: after the refresh lists the calendar, the thank you is still shown in a status line', async () => {
    give.mockResolvedValue({ state: 'done', id: 'src-1' })
    const { rerender } = render(
      <Section>
        <forms.GiveVenueCalendarForm venues={venues} categories={categories} />
      </Section>,
    )
    fireEvent.change(screen.getByLabelText(/iCal address/i), { target: { value: 'https://example.com/cal.ics' } })
    fireEvent.change(screen.getByLabelText(/kind of nights/i), { target: { value: categories[0].id } })
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box)
    fireEvent.click(screen.getByRole('button', { name: 'Give us your calendar' }))
    await waitFor(() => expect(give).toHaveBeenCalledTimes(1))

    // The refreshed page: the calendar is listed with its stop form; the give form is gone.
    rerender(
      <Section>
        <ul>
          <li>
            Read every day since 2026-10-31 <forms.StopVenueCalendarForm sourceId="src-1" />
          </li>
        </ul>
      </Section>,
    )
    await waitFor(() => expect(statusWords()).toMatch(/Thank you\. We read your calendar every day/))
  })

  it('stops: after the refresh drops the calendar, the stopped answer is still shown in a status line', async () => {
    stop.mockResolvedValue({ state: 'done', id: 'src-1' })
    const { rerender } = render(
      <Section>
        <forms.StopVenueCalendarForm sourceId="src-1" />
      </Section>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Stop reading this calendar' }))
    await waitFor(() => expect(stop).toHaveBeenCalledTimes(1))

    rerender(
      <Section>
        <forms.GiveVenueCalendarForm venues={venues} categories={categories} />
      </Section>,
    )
    await waitFor(() => expect(statusWords()).toMatch(/Stopped\. We no longer read this calendar/))
  })

  it('a refusal stays beside its own form, in its own words', async () => {
    give.mockResolvedValue({ state: 'refused', reason: 'Sign in to give us your calendar.' })
    render(
      <Section>
        <forms.GiveVenueCalendarForm venues={venues} categories={categories} />
      </Section>,
    )
    fireEvent.change(screen.getByLabelText(/iCal address/i), { target: { value: 'https://example.com/cal.ics' } })
    fireEvent.change(screen.getByLabelText(/kind of nights/i), { target: { value: categories[0].id } })
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box)
    fireEvent.click(screen.getByRole('button', { name: 'Give us your calendar' }))
    const form = screen.getByRole('button', { name: /Give us your calendar|Saving/ }).closest('form') as HTMLFormElement
    await waitFor(() => expect(form.textContent).toContain('Sign in to give us your calendar.'))
  })
})
