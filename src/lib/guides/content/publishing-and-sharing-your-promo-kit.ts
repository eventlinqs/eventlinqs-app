import type { Guide } from '../types'

/**
 * Verified against the running app 2026-07-26:
 * - Route /dashboard/events/[id]/launch-kit, sections: Send it everywhere,
 *   Your A4 QR poster, Your invitation card, Your seat map live and selling,
 *   Watch it travel.
 * - Tracked links per channel (src/lib/broadcast/share-codes.ts SHARE_CHANNELS).
 * - The kit unlocks on publish; before publish the screen explains what lands.
 */
export const publishingAndSharingYourPromoKit: Guide = {
  slug: 'publishing-and-sharing-your-promo-kit',
  title: 'Publishing and sharing your promo kit',
  summary:
    'The moment you publish, your event gets a kit: tracked share links for every channel, a printable QR poster and an invitation card that unfurls wherever you paste the link.',
  category: 'promote',
  minutes: 6,
  updated: '2026-07-26',
  keywords: [
    'launch kit',
    'promo kit',
    'share',
    'share links',
    'tracked links',
    'poster',
    'QR poster',
    'invitation card',
    'link preview',
    'publish',
    'promote',
  ],
  hero: {
    src: '/guides/publishing-and-sharing-your-promo-kit-1.png',
    alt: 'The Launch Kit screen for a live event, showing the share row, the A4 QR poster and the invitation card.',
    caption: 'The Launch Kit, unlocked the moment the event goes live. Everything on this screen is built from your event.',
    viewport: 1440,
  },
  related: ['tracking-your-reach', 'creating-your-first-event', 'running-the-door-with-the-qr-scanner'],
  blocks: [
    {
      kind: 'para',
      text: 'Publishing does two things. It puts your event page live at a clean, shareable address, and it switches on the Launch Kit for that event. The kit is not a marketing brochure about the platform. It is your event, cut into the shapes you actually need to promote it.',
    },
    {
      kind: 'para',
      text: 'Find it from the dashboard: open the event, then Launch Kit. Before you publish, the same screen tells you what will land there, so you know what is coming.',
    },
    { kind: 'heading', text: 'What is in the kit' },
    {
      kind: 'steps',
      items: [
        {
          title: 'Send it everywhere',
          text: 'A row of share buttons, one per channel. Each button carries its own tracked link, so a click from a story and a click from a group chat are counted separately. Channels covered include Instagram, Facebook, LinkedIn, X, WhatsApp, Messenger, email, SMS, a copy link, the native device share sheet and a QR link.',
        },
        {
          title: 'Your A4 QR poster',
          text: 'A print-ready poster with your cover image, the event details and a QR code straight to the ticket page. Print it for the venue window, the noticeboard, the counter at the cafe down the road. Scans through the poster QR are attributed like any other channel, so you can finally tell whether posters work for your crowd.',
        },
        {
          title: 'Your invitation card',
          text: 'The preview that appears when your link is pasted anywhere: the cover photo, the title, the date and the venue, composed as a designed card rather than a bare URL. You do not build it. It is generated from the event, which is why the cover image you chose at step four matters so much.',
        },
        {
          title: 'Your seat map, live and selling',
          text: 'For reserved seating events, the kit shows the live room with what is selling and what is left, so you can see the shape of demand without leaving the screen.',
        },
        {
          title: 'Watch it travel',
          text: 'Your reach summary, in the kit, next to the buttons that generated it. Full detail is on the Reach page, which has its own guide.',
        },
      ],
    },
    {
      kind: 'shot',
      shot: {
        src: '/guides/publishing-and-sharing-your-promo-kit-2.png',
        alt: 'The share row on the Launch Kit, with one tracked button per channel.',
        caption: 'One tracked link per channel. Use the buttons rather than copying the address bar, or the attribution is lost.',
        viewport: 1440,
      },
    },
    {
      kind: 'pitfall',
      title: 'Copying the URL from the address bar throws away the tracking',
      text: 'The plain event address works perfectly and always will. What it cannot do is tell you where a sale came from. If you paste the address bar link into a group chat, that sale lands in your totals with no channel attached. Use the share buttons in the kit instead: same destination for the buyer, but the link knows where it came from. This is the difference between knowing your posters work and guessing.',
    },
    { kind: 'heading', text: 'A sensible first hour after publishing' },
    {
      kind: 'list',
      items: [
        'Open your own event page on a phone and check the cover, the price and the date read correctly.',
        'Paste your link into one chat and look at the invitation card that appears. That card is what most people will judge before they click.',
        'Share to the two channels where your audience actually lives, using the kit buttons.',
        'Print one poster and put it where your crowd already stands.',
        'Come back tomorrow and read the reach, not today. One day of numbers tells you nothing.',
      ],
    },
    {
      kind: 'note',
      title: 'The share links keep working after the event',
      text: 'A tracked link does not expire when the event does. That matters for the next one: the channels that brought people this time are the channels worth starting with next time, and the reporting stays on the event for you to look back at.',
    },
  ],
}
