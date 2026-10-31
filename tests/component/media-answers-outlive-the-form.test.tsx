/**
 * ONE DEFECT IS A CLASS (Lawal, 31 October 2026, 11:13): the venue calendar's lost answer, on every form of the media
 * page. A success refreshes /dashboard/organisation/media, and the refreshed page stops drawing the form pressed: a
 * withdrawn venue photograph leaves the list with its forms, a yes given empties 'Give your permission', a withdrawn
 * image loses its forms. Each case renders the page part as the page does, answers the action, renders it again as the
 * refreshed page draws it, and reads the status line a visitor gets. The claim card refreshes nothing, so a form there
 * stands alone and still shows its own answer.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { Fragment, type ReactNode } from 'react'
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react'

const calls = vi.hoisted(() => ({
  withdrawVenuePhotoAction: vi.fn(),
  addVenuePhotoAction: vi.fn(),
  replaceVenuePhotoAction: vi.fn(),
  challengeVenuePhotoAction: vi.fn(),
  addMedia: vi.fn(),
  replaceMedia: vi.fn(),
  withdrawMedia: vi.fn(),
  withdrawYes: vi.fn(),
  giveYes: vi.fn(),
  keepSeries: vi.fn(),
}))
vi.mock('@/app/actions/venue-media', () => ({
  withdrawVenuePhotoAction: (...a: unknown[]) => calls.withdrawVenuePhotoAction(...a),
  addVenuePhotoAction: (...a: unknown[]) => calls.addVenuePhotoAction(...a),
  replaceVenuePhotoAction: (...a: unknown[]) => calls.replaceVenuePhotoAction(...a),
  challengeVenuePhotoAction: (...a: unknown[]) => calls.challengeVenuePhotoAction(...a),
}))
vi.mock('@/app/actions/organiser-media', () => ({
  addMedia: (...a: unknown[]) => calls.addMedia(...a),
  replaceMedia: (...a: unknown[]) => calls.replaceMedia(...a),
  withdrawMedia: (...a: unknown[]) => calls.withdrawMedia(...a),
  withdrawYes: (...a: unknown[]) => calls.withdrawYes(...a),
  giveYes: (...a: unknown[]) => calls.giveYes(...a),
  keepSeries: (...a: unknown[]) => calls.keepSeries(...a),
}))

import * as venue from '@/components/listings/venue-media-forms'
import * as organiser from '@/components/listings/organiser-media-forms'

// Each family's answer holder when the module has one; without it the forms stand alone as they did.
type Wrap = (p: { children: ReactNode; line?: boolean }) => ReactNode
const VenuePart = ((venue as Record<string, unknown>).VenuePhotoAnswers ?? Fragment) as Wrap
const OrganiserPart = ((organiser as Record<string, unknown>).OrganiserMediaAnswers ?? Fragment) as Wrap
const OrganiserLine = ((organiser as Record<string, unknown>).OrganiserMediaAnswerLine ?? (() => null)) as (p: { kinds: string[] }) => ReactNode

const IMAGE = '33333333-3333-4333-8333-333333333333'
const CLAIM = '44444444-4444-4444-8444-444444444444'

afterEach(() => {
  cleanup()
  for (const f of Object.values(calls)) f.mockReset()
})

function statusWords(): string {
  return screen
    .getAllByRole('status')
    .map((s) => s.textContent ?? '')
    .join(' ')
}

describe('the media page answers outlive the forms they came from', () => {
  it('a venue photograph withdrawn: after the refresh drops it from the list, the withdrawn answer is shown', async () => {
    calls.withdrawVenuePhotoAction.mockResolvedValue({ state: 'done', id: IMAGE })
    const { rerender } = render(
      <VenuePart>
        <ul>
          <li>
            <venue.WithdrawVenuePhotoForm imageId={IMAGE} />
          </li>
        </ul>
      </VenuePart>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
    await waitFor(() => expect(calls.withdrawVenuePhotoAction).toHaveBeenCalledTimes(1))
    rerender(
      <VenuePart>
        <ul />
      </VenuePart>,
    )
    await waitFor(() => expect(statusWords()).toContain('Withdrawn. It no longer shows anywhere on EventLinqs.'))
  })

  it('the last yes given: after the refresh empties Give your permission, the thank you shows under Your permission', async () => {
    calls.giveYes.mockResolvedValue({ state: 'done', id: CLAIM })
    const page = (unanswered: boolean) => (
      <OrganiserPart line={false}>
        <section>
          <h2>Your permission</h2>
          <OrganiserLine kinds={['giveYes', 'withdrawYes']} />
        </section>
        {unanswered ? (
          <section>
            <organiser.GiveYesForm claimId={CLAIM} kind="venue" />
          </section>
        ) : null}
      </OrganiserPart>
    )
    const { rerender } = render(page(true))
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box)
    fireEvent.click(screen.getByRole('button', { name: 'Give permission' }))
    await waitFor(() => expect(calls.giveYes).toHaveBeenCalledTimes(1))
    rerender(page(false))
    await waitFor(() => expect(statusWords()).toContain('Thank you. Your permission is on record'))
  })

  it('an image withdrawn: after the refresh takes its forms away, the withdrawn answer is shown', async () => {
    calls.withdrawMedia.mockResolvedValue({ state: 'done', id: IMAGE })
    const page = (current: boolean) => (
      <OrganiserPart line={false}>
        <section>
          <h2>Your images</h2>
          <OrganiserLine kinds={['replace', 'withdraw']} />
          {current ? <organiser.WithdrawMediaForm assetId={IMAGE} /> : <p>Withdrawn</p>}
        </section>
      </OrganiserPart>
    )
    const { rerender } = render(page(true))
    fireEvent.change(screen.getByLabelText(/Why are you withdrawing it/i), { target: { value: 'wrong night' } })
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw this image' }))
    await waitFor(() => expect(calls.withdrawMedia).toHaveBeenCalledTimes(1))
    rerender(page(false))
    const { IMAGE_WITHDRAWN_WORDS } = await import('@/lib/listings/media-words')
    await waitFor(() => expect(statusWords()).toContain(IMAGE_WITHDRAWN_WORDS))
  })

  it('on the claim card, which refreshes nothing, a form with no holder shows its own answer', async () => {
    calls.giveYes.mockResolvedValue({ state: 'done', id: CLAIM })
    render(<organiser.GiveYesForm claimId={CLAIM} kind="event" />)
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box)
    fireEvent.click(screen.getByRole('button', { name: 'Give permission' }))
    await waitFor(() => expect(statusWords()).toContain('Thank you. Your permission is on record'))
  })

  it('a refusal shows beside the one form refused, not beside every form of its kind', async () => {
    calls.withdrawVenuePhotoAction.mockResolvedValue({ state: 'refused', reason: 'Sign in to change your venue photographs.' })
    const OTHER = '55555555-5555-4555-8555-555555555555'
    render(
      <VenuePart>
        <div data-testid="first">
          <venue.WithdrawVenuePhotoForm imageId={IMAGE} />
        </div>
        <div data-testid="second">
          <venue.WithdrawVenuePhotoForm imageId={OTHER} />
        </div>
      </VenuePart>,
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'Withdraw' })[0])
    await waitFor(() => expect(screen.getByTestId('first').textContent).toContain('Sign in to change your venue photographs.'))
    expect(screen.getByTestId('second').textContent).not.toContain('Sign in')
  })
})
