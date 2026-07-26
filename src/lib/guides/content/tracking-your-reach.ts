import type { Guide } from '../types'

/**
 * Verified against the running app 2026-07-26:
 * - Route /dashboard/events/[id]/reach, fed by fetchReachSummary
 *   (src/lib/broadcast/reach.ts): per channel views, clicks, conversions,
 *   tickets, plus totals.
 * - Views are deduped per visitor per day; conversions attribute on a
 *   last-touch share cookie; tickets counts tickets on those orders.
 */
export const trackingYourReach: Guide = {
  slug: 'tracking-your-reach',
  title: 'Tracking your reach',
  summary:
    'Views, clicks, conversions and tickets, broken down by the channel that produced them, and how to read them without fooling yourself.',
  category: 'promote',
  minutes: 6,
  updated: '2026-07-26',
  keywords: [
    'reach',
    'analytics',
    'attribution',
    'channels',
    'views',
    'clicks',
    'conversions',
    'tickets sold',
    'tracking',
    'reporting',
  ],
  hero: {
    src: '/guides/tracking-your-reach-1.png',
    alt: 'The Reach page for an event, showing totals and a per-channel breakdown of views, clicks, conversions and tickets.',
    caption: 'Reach, per channel. The totals are the headline; the breakdown is where the decisions are.',
    viewport: 1440,
  },
  related: ['publishing-and-sharing-your-promo-kit', 'creating-your-first-event', 'getting-paid-and-payout-timing'],
  blocks: [
    {
      kind: 'para',
      text: 'Open the event from your dashboard and choose Reach. Every tracked link you shared from the Launch Kit reports here, grouped by the channel it belongs to.',
    },
    { kind: 'heading', text: 'The four numbers' },
    {
      kind: 'steps',
      items: [
        {
          title: 'Views',
          text: 'Someone arrived at your event page through that link. Views are deduplicated per visitor per day, so one person refreshing eleven times is one view, not eleven. That makes the number smaller and worth more.',
        },
        {
          title: 'Clicks',
          text: 'Someone moved from your page toward buying. This is the gap that tells you whether the page is doing its job. Plenty of views with almost no clicks is a page problem, not a promotion problem.',
        },
        {
          title: 'Conversions',
          text: 'An order that completed, attributed to the last tracked link the buyer touched before they bought. Last touch is the honest simple model: it credits the channel that closed, not the one that started.',
        },
        {
          title: 'Tickets',
          text: 'How many tickets those orders carried. One conversion can be six tickets. When you are deciding where to put effort, tickets is usually the number that matters and conversions is the one that flatters.',
        },
      ],
    },
    {
      kind: 'note',
      title: 'Why last touch, and what it costs you',
      text: 'A buyer often sees an event three times before they buy: a story, a friend forwarding it, then a search. Last touch gives all the credit to the third one. It is simple and it never double-counts, but it does undervalue the channels that plant the idea. Read your top channel as the closer, not as the only cause.',
    },
    { kind: 'heading', text: 'How to actually read it' },
    {
      kind: 'list',
      items: [
        'Compare rates, not totals. A channel with 40 views and 8 tickets is beating one with 900 views and 9 tickets, and it is where your next hour should go.',
        'Watch the view-to-click step. If it is weak everywhere, the problem is the event page, most often the cover image or an unclear price.',
        'Watch the click-to-conversion step. If it is weak everywhere, the problem is at the point of buying: price, availability, or a ticket type that is confusing.',
        'Give it more than a day. A single evening of numbers is noise, and acting on noise is how promotion budgets get wasted.',
        'Look at it again a week after the event. The pattern you find there is the plan for the next one.',
      ],
    },
    {
      kind: 'shot',
      shot: {
        src: '/guides/tracking-your-reach-2.png',
        alt: 'The per-channel table on the Reach page with a row for each channel that produced traffic.',
        caption: 'A row per channel that actually produced something. Empty channels stay quiet rather than padding the table.',
        viewport: 1440,
      },
    },
    {
      kind: 'pitfall',
      title: 'Zeros usually mean untracked, not unpopular',
      text: 'If a channel you definitely promoted on shows nothing at all, the most likely explanation is that the link you used was not the tracked one. Copying the address bar, forwarding a screenshot, or someone else resharing your event from their own search all produce real visits with no channel attached. Before you conclude a channel does not work for you, check that what you posted came from the share row in the Launch Kit.',
    },
    {
      kind: 'note',
      title: 'What reach does not claim to be',
      text: 'This is attribution for links you shared, not a full analytics suite, and it does not follow anyone around the internet. Someone who hears about your event and searches for it directly will show up in your sales without a channel. That is a real sale and it counts in your revenue; it just has nobody to credit.',
    },
  ],
}
