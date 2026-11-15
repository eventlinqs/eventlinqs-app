import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

/*
 * /admin/automation, LAWAL'S HOME SCREEN (his 13:41 and 13:55 of 15 November 2026): the three numbers on top; "Needs
 * you today", empty when the machine is healthy; one card per task with its switch. A read that fails is named on its
 * card and in the list, never shown as a zero.
 */
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`redirect ${to}`) } }))
vi.mock('next/link', () => ({ default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a> }))
vi.mock('@/lib/admin/auth', () => ({ requireAdminSession: async () => ({ userId: 'u1', email: 'a@b.c', admin: { role: 'founder' } }) }))
vi.mock('@/lib/admin/rbac', () => ({ can: () => true }))
vi.mock('@/lib/admin/audit', () => ({ recordAuditEvent: async () => ({ ok: true }) }))
vi.mock('@/app/admin/(authed)/automation/actions', () => ({ setSenderModeAction: vi.fn(), setSocialAutoPublishAction: vi.fn() }))

type Card = import('@/lib/admin/automation').AutomationCard
let cards: Card[] = []
let numbers: unknown = { organisersSelling: 0, paidTicketsThisMonth: 0, paidTicketsLastMonth: 0, growthPercent: null }
vi.mock('@/lib/admin/automation', () => ({ readAutomation: async () => ({ numbers, cards }) }))

import AdminAutomationPage from '@/app/admin/(authed)/automation/page'

const base: Card = {
  key: 'social',
  title: 'Social posts',
  does: 'Posts each approved piece.',
  schedules: [{ where: 'vercel', path: '/api/cron/social-publish', cron: '40 * * * *', next: '2026-11-15T03:40:00.000Z' }],
  lastRun: null,
  queue: [{ label: 'Pieces planned this week', value: 70 }],
  results: [{ label: 'Posted this week', value: 0 }],
  switch: { kind: 'flag', flag: 'social_auto_publish', on: false },
  waitsFor: null,
  state: 'off',
  link: null,
  readFailed: null,
}

beforeEach(() => {
  cards = []
  numbers = { organisersSelling: 0, paidTicketsThisMonth: 0, paidTicketsLastMonth: 0, growthPercent: null }
})

describe('/admin/automation', () => {
  it('shows the three numbers with their targets, and no percentage without a base', async () => {
    render(await AdminAutomationPage({ searchParams: Promise.resolve({}) }))
    const top = document.querySelector('[data-section="three-numbers"]')
    expect(top?.textContent).toContain('Organisers selling this month')
    expect(top?.textContent).toContain('Target 30 by 15 February 2027')
    expect(top?.textContent).toContain('No base yet')
  })

  it('"Needs you today" is empty when nothing waits', async () => {
    cards = [{ ...base, state: 'runs', switch: { kind: 'flag', flag: 'social_auto_publish', on: true } }]
    render(await AdminAutomationPage({ searchParams: Promise.resolve({}) }))
    // Redesigned on Lawal's 20:52 (5d1984e4e): an 'All clear' chip beside the words, as the page now reads.
    expect(screen.getByText('All clear')).toBeTruthy()
    expect(screen.getByText(/Every task ran by itself\./)).toBeTruthy()
  })

  it('lists what waits, and a read that failed by its own words', async () => {
    cards = [
      { ...base, waitsFor: '70 piece(s) wait for approval', state: 'waits' },
      { ...base, key: 'claims', title: 'Claims', readFailed: 'listing_claims: permission denied', state: 'waits' },
    ]
    render(await AdminAutomationPage({ searchParams: Promise.resolve({}) }))
    const needs = document.querySelector('[data-section="needs-you"]')
    expect(needs?.querySelector('[data-needs="social"]')?.textContent).toContain('70 piece(s) wait for approval')
    expect(needs?.querySelector('[data-needs="claims"]')?.textContent).toContain('listing_claims: permission denied')
    expect(document.querySelector('[data-card="claims"]')?.textContent).toContain('Its figures could not be read')
  })

  it("each card carries its switch: the social publisher's and the sender's", async () => {
    cards = [
      base,
      { ...base, key: 'first-letters', title: 'First letters', switch: { kind: 'sender', mode: 'hold', dnsOk: true, dnsCheckedAt: '2026-11-14T21:30:04Z', setByAPerson: false }, state: 'off' },
    ]
    render(await AdminAutomationPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByRole('button', { name: 'Switch publishing on' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send by itself' })).toBeTruthy()
    expect(document.querySelector('[data-card="first-letters"]')?.textContent).toContain('The sender is on hold')
  })
})
