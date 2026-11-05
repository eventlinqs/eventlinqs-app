import { describe, expect, it } from 'vitest'
import { organiserUpdateWords } from '@/lib/organisers/update-words'

/*
 * THE CONTROLLER'S 08:50 (3), FROM THE 5 NOVEMBER AUDIT (C:\dev\EVIDENCE\AUDIT-5NOV\flags.txt: broadcast_digest FALSE,
 * broadcast_follow FALSE): an organiser's page promised 'Get notified the moment new events go live. One email per
 * release.' and 'Subscribe to event updates below to get notified', and carried a weekly email form, while nothing sends
 * either. With the two broadcasts off, the page says what runs today: a follower finds new events on the organiser's
 * page, in the city guide and on every page they belong to.
 */
const OFF = organiserUpdateWords('AMCF', false)
const ON = organiserUpdateWords('AMCF', true)
const everything = (w: ReturnType<typeof organiserUpdateWords>) => [w.emptySubhead, w.panelLine, w.bioLine, w.emptyAction, ...w.pillars].join(' | ')

describe('the organiser page promises only what runs (organiserUpdateWords)', () => {
  it('with the broadcasts off, promises no notification, no email and no unsubscribing', () => {
    expect(everything(OFF)).not.toMatch(/notif|email|inbox|weekly|unsubscribe|subscribe|push|alert/i)
    expect(OFF.panelLine).toBe('New events from AMCF appear on this page, in the city guide and on every page they belong to.')
    expect(OFF.emptySubhead).toBe('New events from AMCF appear here, in the city guide and on every page they belong to.')
    expect(OFF.bioLine).toBe('AMCF hasn’t added a bio yet. Their new events appear on this page and in the city guide.')
    expect(OFF.capture).toBe(false)
  })

  it('with the broadcasts on, keeps the email promise the follow alerts then keep', () => {
    expect(ON.panelLine).toBe('Get notified the moment new events go live. One email per release. Unsubscribe anytime.')
    expect(ON.capture).toBe(false)
  })
})
