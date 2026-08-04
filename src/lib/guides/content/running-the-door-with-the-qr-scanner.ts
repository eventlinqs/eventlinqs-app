import type { Guide } from '../types'

/**
 * Verified against the running app 2026-07-26:
 * - Route /scan/[eventId]. Access: organisation owner, or a member with role
 *   owner / admin / manager, or a platform admin. Anyone else sees Not authorised.
 * - Two input paths (src/components/features/scanner/scanner.tsx): native
 *   BarcodeDetector camera scanning where the browser supports it, and manual
 *   or paste entry which works on every device.
 * - The QR encodes https://<host>/t/<TICKET-CODE>?k=<secret>
 *   (src/lib/scanner/parse-qr.ts); ticket codes look like EL-XXXX-XXXX.
 * - One decision per scan, fail closed: only the literal 'admitted' result
 *   admits (src/lib/scanner/result.ts). Reject reasons: Already used, Refunded,
 *   Void, Transferred away, Wrong event, Not found, Not valid.
 * - Same-code rescans inside 3 seconds are ignored; a result holds for 4 seconds.
 * - Reserved seating: the seat is shown on the admit result so the door can
 *   direct the guest.
 */
export const runningTheDoorWithTheQrScanner: Guide = {
  slug: 'running-the-door-with-the-qr-scanner',
  title: 'Running the door with the QR scanner',
  summary:
    'Set your door team up, scan tickets on any phone, and understand every decision the scanner gives you before the queue is out the door.',
  category: 'event-day',
  minutes: 7,
  updated: '2026-07-26',
  keywords: [
    'scanner',
    'QR',
    'check in',
    'door',
    'admit',
    'reject',
    'scan tickets',
    'event day',
    'guest list',
    'already used',
  ],
  hero: {
    src: '/guides/running-the-door-with-the-qr-scanner-1.png',
    alt: 'The door scanner screen for an event, with the camera scanning panel and the manual code entry beneath it.',
    caption: 'The scanner. Camera where the phone supports it, typed or pasted codes everywhere else.',
    viewport: 390,
  },
  related: ['refunds-and-transfers', 'creating-your-first-event', 'building-a-seating-chart'],
  blocks: [
    {
      kind: 'para',
      text: 'The scanner is a web page, not an app to install. Open it on any phone with a browser, sign in, and start scanning. That matters at the door, because the person you handed the shift to five minutes ago does not have time to install anything.',
    },
    { kind: 'heading', text: 'Before the doors open' },
    {
      kind: 'steps',
      items: [
        {
          title: 'Add your door team to the organisation',
          text: 'Scanning needs permission. The organisation owner can scan, and so can any member with the owner, admin or manager role. Anyone else gets a clear Not authorised message rather than a broken screen. Add people the day before, not at the door.',
        },
        {
          title: 'Send them the scan link',
          text: 'The scanner lives at a per-event address. Send it to your team, and have them open it and sign in before the first guest arrives so nobody is fighting a login in a queue.',
        },
        {
          title: 'Test one real ticket',
          text: 'Scan a real ticket for the event and watch it come back as an admit. Then scan the same one again and watch it come back as Already used. Now your team has seen both outcomes before it matters.',
        },
        {
          title: 'Check the phones',
          text: 'Camera scanning uses a browser feature that is available on recent Android and Chromium browsers. On other phones, including iPhones, the camera panel simply does not appear and the manual path takes over. Both paths reach exactly the same decision, so a mixed set of phones is fine.',
        },
      ],
    },
    { kind: 'heading', text: 'The two ways in' },
    {
      kind: 'para',
      text: 'Camera scanning is the fast path: point at the QR code on the guest phone or printed ticket and the decision appears. Manual entry is the universal path: type the ticket code and its key, or paste the whole ticket link the guest has open. A ticket code looks like EL-XXXX-XXXX, and it uses no letter that can be confused with a number, so reading one aloud in a loud room actually works.',
    },
    {
      kind: 'shot',
      shot: {
        src: '/guides/running-the-door-with-the-qr-scanner-2.png',
        alt: 'The scanner manual entry panel with fields for a ticket code and key.',
        caption: 'The manual path. It works on every device, so no phone at the door is the wrong phone.',
        viewport: 390,
      },
    },
    { kind: 'heading', text: 'Reading the decision' },
    {
      kind: 'para',
      text: 'Every scan resolves to one of two answers, in large type. ADMIT means let them in, along with the holder name and, for reserved seating, the seat to send them to. REJECT means do not, and it always names the reason.',
    },
    {
      kind: 'list',
      items: [
        'Already used: this ticket has been scanned. Usually a screenshot passed around, sometimes a friend already inside on the same code.',
        'Refunded: the money has gone back, so the ticket is dead.',
        'Void: the ticket was cancelled.',
        'Transferred away: the holder gave it to someone else, and the new code is the live one. Ask for the current ticket.',
        'Wrong event: a valid ticket, for a different night.',
        'Not found or Not valid: the code does not resolve. Retype it, or check they are not showing a receipt instead of a ticket.',
      ],
    },
    {
      kind: 'note',
      title: 'A ticket can only be admitted once, and the server decides',
      text: 'Admission is settled on the server, not on the phone, so two doors scanning at the same moment cannot both admit the same ticket. Anything the scanner does not recognise is refused rather than waved through. On a busy door, that failing-closed behaviour is the behaviour you want.',
    },
    {
      kind: 'note',
      title: 'It will not double-scan on you',
      text: 'The same code scanned again within a few seconds is ignored, so a camera lingering on a QR code does not fire twice. Each result stays on screen for a few seconds and then clears itself, ready for the next guest, which means nobody has to tap between scans.',
    },
    {
      kind: 'pitfall',
      title: 'Signal at the door',
      text: 'Every scan asks the server for its decision, so the scanner needs a connection. Venues with thick walls and one bar of reception are where door queues die. Test the signal where your team will actually stand, not at the bar. If it is weak, put the scanning position near the entrance glass, use a phone on a different network as backup, or ask the venue for the guest wifi password before the night.',
    },
    {
      kind: 'para',
      text: 'After the event, the door result is already in your numbers: attendance sits alongside your sales, and any refund you process afterwards follows the path in the refunds guide.',
    },
  ],
}
