/**
 * WHAT AN ORGANISER'S PAGE PROMISES A FOLLOWER, ONE SOURCE (the CONTROLLER's 08:50 (3), from the 5 November audit:
 * broadcast_digest and broadcast_follow both OFF in production, C:\dev\EVIDENCE\AUDIT-5NOV\flags.txt). The page promised
 * 'Get notified the moment new events go live. One email per release.' and carried a weekly email form, while nothing
 * sends either; the form also posted the organiser's name as a city, which the subscribe route refuses, so it failed
 * every time. With the broadcasts off the page says what runs today; with both on it keeps the email promise the follow
 * alerts then keep. Pure: the page passes whether both flags are on.
 */
export interface OrganiserUpdateWords {
  /** The upcoming section's empty state, under 'No upcoming events from <name> just yet.' */
  emptySubhead: string
  /** The empty state's first button, to the Stay connected panel. */
  emptyAction: string
  /** The empty state's trust line. */
  pillars: string[]
  /** The Stay connected panel's line. */
  panelLine: string
  /** The bio section when the organiser has written none. */
  bioLine: string
  /** Whether the panel carries an email form. Never on an organiser's page: no digest is an organiser's. */
  capture: false
}

export function organiserUpdateWords(name: string, broadcastsOn: boolean): OrganiserUpdateWords {
  if (broadcastsOn) {
    return {
      emptySubhead: 'Get notified when new events drop.',
      emptyAction: 'Get updates',
      pillars: ['No spam, just events', 'Unsubscribe anytime', 'Free to follow'],
      panelLine: 'Get notified the moment new events go live. One email per release. Unsubscribe anytime.',
      bioLine: `${name} hasn’t added a bio yet. Follow them to get notified when new events go live.`,
      capture: false,
    }
  }
  return {
    emptySubhead: `New events from ${name} appear here, in the city guide and on every page they belong to.`,
    emptyAction: 'Stay connected',
    pillars: ['Free to follow', 'Listed in the city guide'],
    panelLine: `New events from ${name} appear on this page, in the city guide and on every page they belong to.`,
    bioLine: `${name} hasn’t added a bio yet. Their new events appear on this page and in the city guide.`,
    capture: false,
  }
}
