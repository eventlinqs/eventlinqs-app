/*
 * THE INVITES PAGE PROMISES NOTHING AN INVITE DOES NOT EARN (LAW 24 retired, Lawal 15 November 2026, 00:19; the PM's
 * 03:25: the referral items belong to the retired referral months and the fee car decides their words). Looked at on the
 * fee car's first screens at 390: a new organiser saw "Referrals counted ... A referral counts when their first paid
 * ticket sells", a count that earns them nothing now, and the city picker opened on Sydney. Only an organisation that
 * holds a window, while a referral still extends it (until 15 December 2026), sees "Referrals counted"; everyone else
 * sees who joined; the picker opens on Melbourne (the growth plan's version 6).
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/app/(dashboard)/dashboard/invites/actions', () => ({ generateMyFoundingInvite: vi.fn() }))

const { InvitesClient } = await import('@/app/(dashboard)/dashboard/invites/invites-client')

const CITIES = [
  { slug: 'sydney', name: 'Sydney', state: 'NSW' },
  { slug: 'melbourne', name: 'Melbourne', state: 'VIC' },
  { slug: 'geelong', name: 'Geelong', state: 'VIC' },
]
const base = {
  initialInvites: [],
  allowance: 5,
  acceptedCount: 2,
  referralsConfirmed: 1,
  referralsPending: 1,
  feeRule: 'Every organiser pays the platform fee on each paid ticket from their first sale. Free events stay free.',
  keptWindowWords: 'Your organisation registered before 15 November 2026, so it keeps the fee-free window it was given.',
  cities: CITIES,
}

describe('the invites page for an organiser who joined after the change', () => {
  it('counts who joined, never a referral that earns nothing, and says the fee from the first sale', () => {
    render(<InvitesClient {...base} feeFreeUntil={null} waiverActive={false} referralsEarnTime={false} />)
    expect(screen.getByText('Organisers joined')).toBeInTheDocument()
    expect(screen.queryByText('Referrals counted')).toBeNull()
    expect(screen.queryByText(/A referral counts when/)).toBeNull()
    expect(screen.getByText('From your first sale')).toBeInTheDocument()
  })
  it('opens the city picker on Melbourne', () => {
    render(<InvitesClient {...base} feeFreeUntil={null} waiverActive={false} referralsEarnTime={false} />)
    expect((screen.getByLabelText('City for this invite link') as HTMLSelectElement).value).toBe('melbourne')
  })
})

describe('the invites page for an organisation that keeps its window', () => {
  it('still counts referrals while one extends the window (until 15 December 2026)', () => {
    render(<InvitesClient {...base} feeFreeUntil="2027-02-27T00:00:00Z" waiverActive referralsEarnTime />)
    expect(screen.getByText('Referrals counted')).toBeInTheDocument()
    expect(screen.queryByText('Organisers joined')).toBeNull()
  })
  it('counts who joined once a referral no longer extends it', () => {
    render(<InvitesClient {...base} feeFreeUntil="2027-02-27T00:00:00Z" waiverActive referralsEarnTime={false} />)
    expect(screen.getByText('Organisers joined')).toBeInTheDocument()
  })
})
