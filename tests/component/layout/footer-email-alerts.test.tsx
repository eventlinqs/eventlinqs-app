import { describe, expect, it } from 'vitest'
import { DISCOVER } from '@/components/layout/site-footer'

/*
 * The footer links the email alerts sign up too (the CONTROLLER's 22:06 of 4 November 2026): the one real sign up,
 * /waitlist, with its versioned consent, Resend confirmation and one click unsubscribe.
 */
describe('the footer links the email alerts sign up', () => {
  it("'Email alerts' goes to /waitlist", () => {
    expect(DISCOVER).toContainEqual({ label: 'Email alerts', href: '/waitlist' })
  })
})
