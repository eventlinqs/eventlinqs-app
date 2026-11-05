/**
 * WHAT EVENTLINQS PROMISES AN ORGANISER ABOUT REACH, ONE SOURCE (the CONTROLLER's 02:20 of 6 November 2026; car 45 item 3
 * carried to every surface). With broadcast_digest and broadcast_follow off in production, nothing sends a push alert or a
 * follower notification, and a discovery feed is not what puts an event in front of people; the city guide and every page
 * an event belongs to are. So each line is chosen by the two flags: off, it says what runs today; on, the promise the
 * broadcasts then keep, word for word as it was. Pure: the page passes whether both flags are on.
 * tests/unit/growth/no-alert-promise-while-off.test.ts refuses such a promise anywhere else in the customer facing code.
 */
export interface ReachWords {
  /** /organisers hero, under the headline. */
  heroLine: string
  /** /organisers 'Built-in discovery' band. */
  bandBody: string
  bandPoints: string[]
  /** The last sentence of the /organisers answer to 'Nobody knows you yet. Why would I list here?' */
  objectionTail: string
  /** A venue page with no upcoming events. */
  venueEmpty: (venueName: string) => string
  venuePillars: string[]
}

export function reachWords(broadcastsOn: boolean): ReachWords {
  if (broadcastsOn) {
    return {
      heroLine:
        'Then the tools that fill it: tracked share links, a discovery feed and push alerts to a local audience already looking, measured in tickets sold rather than views, and your attendee list stays yours.',
      bandBody:
        'Every event you list goes into the discovery feed and out through push alerts to attendees who chose to hear about events like yours. Buyers see who else is going, and everyone who follows you gets your next event the moment it goes live.',
      bandPoints: [
        'A personalised discovery feed puts your event in front of the right people',
        'Push alerts land on lock screens, not in spam folders',
        'Who’s-going proof turns interest into tickets',
        'Followers get every event you publish, automatically',
      ],
      objectionTail:
        'What you get on top is the discovery feed and the push alerts, which put your event in front of people who are already looking for something to go to that weekend.',
      venueEmpty: () => 'Get notified when new events are listed.',
      venuePillars: ['New listings weekly', 'Free to follow', 'Unsubscribe anytime'],
    }
  }
  return {
    heroLine:
      'Then the tools that fill it: tracked share links, a place in your city’s guide and on every page your event belongs to, measured in tickets sold rather than views, and your attendee list stays yours.',
    bandBody:
      'Every event you list goes into its city’s guide, by day and by category, and onto every page it belongs to: its suburb, its category, its venue and your own organiser page. Buyers see who else is going.',
    bandPoints: [
      'Listed in its city’s guide, by day and by category',
      'On every page it belongs to, from its suburb to its venue',
      'Who’s-going proof turns interest into tickets',
      'Your organiser page shows every event you publish',
    ],
    objectionTail:
      'What you get on top is a place in your city’s guide and on every page your event belongs to, in front of people who are already looking for something to go to that weekend.',
    venueEmpty: (venueName: string) => `New events at ${venueName} appear here and in the city guide.`,
    venuePillars: ['Free to follow', 'Listed in the city guide'],
  }
}
