import type { Guide } from '../types'

/**
 * Verified against the running app 2026-07-26:
 * - src/components/features/events/event-form.tsx STEPS (7 steps, in order).
 * - Route /dashboard/events/create.
 * - Organisation required first: /dashboard/organisation/create.
 */
export const creatingYourFirstEvent: Guide = {
  slug: 'creating-your-first-event',
  title: 'Creating your first event',
  summary:
    'The seven steps from an empty dashboard to an event page that is ready to publish, and what to get right at each one.',
  category: 'set-up',
  minutes: 7,
  updated: '2026-07-26',
  keywords: [
    'create event',
    'new event',
    'first event',
    'event form',
    'publish',
    'draft',
    'ticket types',
    'organisation',
    'getting started',
  ],
  hero: {
    src: '/guides/creating-your-first-event-1.png',
    alt: 'The event creation form on step one, Basic Details, with the seven-step indicator across the top.',
    caption: 'Step one of seven. The indicator across the top is always visible, so you can see how much is left.',
    viewport: 1440,
  },
  related: ['building-a-seating-chart', 'publishing-and-sharing-your-promo-kit', 'getting-paid-and-payout-timing'],
  blocks: [
    {
      kind: 'para',
      text: 'Everything you sell lives under an organisation. If you have not made one yet, the dashboard sends you to create it first: a name, a contact email, and you are through in about a minute. The organisation is what buyers see as the host, and it is what your payouts are paid to, so use the name you want on the ticket.',
    },
    {
      kind: 'para',
      text: 'From the dashboard, go to My Events and choose Create Event. The form runs in seven steps and saves as a draft the whole way, so you can stop after step three, go and find a better photo, and come back to it.',
    },
    { kind: 'heading', text: 'The seven steps' },
    {
      kind: 'steps',
      items: [
        {
          title: 'Basic Details',
          text: 'Title, category and description. Write the title the way someone would search for it: what it is, and where or who. A title that reads well in a share preview is doing two jobs at once. The category decides which browse and discovery surfaces your event appears on, so pick the closest real fit rather than the most flattering one.',
        },
        {
          title: 'Date and Time',
          text: 'Start and end. The end time matters more than most organisers expect: it drives when doors close on the scanner, when your reach reporting settles, and when the clock starts on your payout. Set it to when the event actually finishes, not when the venue closes.',
        },
        {
          title: 'Location',
          text: 'Search for the venue and let the map pin it. A pinned venue gets a working map on the event page and correct city and suburb placement in discovery. If you are using reserved seating, the venue you pick here is the one whose seating charts you can apply later, so choose it before you draw a room.',
        },
        {
          title: 'Event Media',
          text: 'The first image in the list is your cover. It carries the event card, the top of the event page, and the link preview when anyone shares it. Upload it early: the image appears the moment it finishes uploading, so you can see the crop before you commit. Landscape works best, and faces or the crowd read better at card size than a wide empty stage.',
        },
        {
          title: 'Tickets',
          text: 'Each ticket type gets a name, a price, a quantity and an optional sale window. Name them the way you want them read on the door list, because the name you type here is the name the seating chart matches against later. Free events stay free: there are no fees of any kind on a zero-priced ticket.',
        },
        {
          title: 'Settings',
          text: 'Your refund policy, whether fees are absorbed or passed on, capacity rules and the extras. The refund policy is shown to buyers before they pay and you are bound by what you set, so write the one you will actually honour.',
        },
        {
          title: 'Review and Publish',
          text: 'The last step lists anything still missing and lets you publish. Until you publish, the event is a private draft and no link to it works.',
        },
      ],
    },
    {
      kind: 'shot',
      shot: {
        src: '/guides/creating-your-first-event-2.png',
        alt: 'The Tickets step of the event form showing a ticket type with name, price and quantity fields.',
        caption: 'The Tickets step. The name you type here is the name a seating chart matches against, so keep it exact.',
        viewport: 1440,
      },
    },
    { kind: 'heading', text: 'What to fix before you publish' },
    {
      kind: 'list',
      items: [
        'A cover image that still reads at card size. Open your own event page and look at it small.',
        'A description that opens with what the night feels like, then covers who it is for, what happens and what is included.',
        'An end time that matches reality, because your payout clock and your door scanner both use it.',
        'Ticket names you are happy to see on a door list and on a seat.',
        'A refund policy you will honour, because the buyer sees it before they pay.',
      ],
    },
    {
      kind: 'pitfall',
      title: 'The two things that stop a publish',
      text: 'First, every event needs a real cover photo. Free or paid, no cover means no publish, because an event with a blank card does badly for everyone. Second, a paid event needs a connected payout account that has cleared the Stripe identity check and is not restricted, because there has to be somewhere for the money to land. Free events publish without one. If the publish button will not release a paid event, open Payouts from the dashboard and finish the identity check. Between them these two account for almost every first event that stalls at the last step.',
    },
    {
      kind: 'note',
      title: 'You can keep editing after you publish',
      text: 'Publishing is not a one-way door. You can edit copy, swap images, add ticket types and adjust settings on a live event. What you cannot do is quietly move a seat that someone has already bought, and that is deliberate.',
    },
    {
      kind: 'para',
      text: 'Once the event is live, the dashboard switches the Launch Kit on for it: your share links, a printable poster, the link preview card and your reach reporting, all built from the event you just made. That is the next thing worth ten minutes.',
    },
  ],
}
