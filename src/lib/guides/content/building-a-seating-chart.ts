import type { Guide } from '../types'

/**
 * Verified against the running app 2026-07-26:
 * - Room studio: src/app/(dashboard)/dashboard/venues/[id]/seat-maps/seat-map-builder.tsx
 *   (block kinds rows/round/square/area, the room palette, trace underlay,
 *   undo and redo, seat tools, print export, live-usage banner).
 * - Charts belong to a VENUE and are applied per event from the event Seats page.
 */
export const buildingASeatingChart: Guide = {
  slug: 'building-a-seating-chart',
  title: 'Building a seating chart',
  summary:
    'Draw your room once in the studio, from rows and tables to the stage and the bar, and reuse it for every event at that venue.',
  category: 'seating',
  minutes: 9,
  updated: '2026-07-26',
  surface: 'room-studio',
  keywords: [
    'seating chart',
    'seat map',
    'room studio',
    'rows',
    'tables',
    'gala',
    'theatre',
    'stage',
    'aisle',
    'floor plan',
    'trace',
    'venue',
    'allocated seating',
    'reserved seating',
  ],
  hero: {
    src: '/guides/building-a-seating-chart-1.png',
    alt: 'The room studio with a drawn seating chart: curved rows facing a stage, tables at the sides and a standing area at the back.',
    caption: 'The room studio. Blocks on the left of the sheet, the inspector on the right, the room in the middle.',
    viewport: 1440,
  },
  related: ['mapping-ticket-tiers-to-seats', 'creating-your-first-event', 'running-the-door-with-the-qr-scanner'],
  blocks: [
    {
      kind: 'para',
      text: 'A seating chart belongs to a venue, not to an event. You draw the room once and every event you run there can apply it. That is the whole point: the second show at the same venue costs you no drawing at all.',
    },
    {
      kind: 'para',
      text: 'Open Venues from the dashboard, choose the venue, and open its seating charts. A new chart opens the room studio on an empty sheet.',
    },
    { kind: 'heading', text: 'Start from a shape, or start from the real plan' },
    {
      kind: 'para',
      text: 'The empty sheet offers three starting shapes: Theatre, Gala tables, and Rows and standing. Each one lays a sensible room you then reshape, which is faster than building from nothing. If you have the venue floor plan as an image, choose Trace a plan instead: the plan drops in as a dimmed underlay and you build your rows directly over the real geometry. The underlay is a guide only and never becomes part of the chart.',
    },
    {
      kind: 'shot',
      shot: {
        src: '/guides/building-a-seating-chart-2.png',
        alt: 'The empty room studio showing the Draw your room invitation with Lay rows, Trace a plan, and the three starting shapes.',
        caption: 'The empty sheet is an invitation, not a blank page. Three shapes, or trace the venue plan.',
        viewport: 1440,
      },
    },
    { kind: 'heading', text: 'The blocks you build with' },
    {
      kind: 'steps',
      items: [
        {
          title: 'Rows',
          text: 'The workhorse. Set how many rows and how many seats per row, then bow them. The bow slider under the sheet curves the rows toward the stage, and Arc wraps them around it. A slight bow reads far more like a real room than a rigid grid, and it helps buyers understand where they are sitting.',
        },
        {
          title: 'Round and square tables',
          text: 'For galas, dinners and awards nights. Set the seats per table and drop as many as the room holds. Tables label themselves as tables rather than rows, and the buyer map lets a guest take a whole table in one action.',
        },
        {
          title: 'Standing area',
          text: 'A zone rather than seats. It sells through its own general admission ticket type at that ticket type capacity, so it never creates individual seats. Use it for the floor, the back bar, the lawn.',
        },
        {
          title: 'The room',
          text: 'Under the Room menu: the stage with its shape, aisles that punch a walkway through rows, and the venue objects that make a plan legible, along with text captions and standalone icons. A bar, a door and an exit sign do more for buyer confidence than another row of seats.',
        },
      ],
    },
    {
      kind: 'note',
      title: 'Snapping, guides and undo',
      text: 'Blocks snap to a grid and align to each other as you drag, so rows line up without you nudging pixels. Undo and redo sit in the toolbar and cover every edit, so experiment freely. Nothing is committed until you save.',
    },
    { kind: 'heading', text: 'Marking individual seats' },
    {
      kind: 'para',
      text: 'The seat tools in the toolbar switch the sheet from moving blocks to marking seats. Choose a tool and click seats on the plan. You can block a seat so it never sells, mark it accessible, mark it as a companion seat beside an accessible one, remove it entirely where the room has a pillar, relabel it when the venue numbers oddly, or add a note that only you see.',
    },
    {
      kind: 'list',
      items: [
        'Blocked seats stay visible on the buyer map but cannot be chosen, which is the honest way to show a restricted view or a held seat.',
        'Accessible and companion seats are drawn with their own marks so a buyer can find them without asking.',
        'Removing a seat is for geometry that does not exist. Blocking is for a seat that exists but is not for sale.',
      ],
    },
    { kind: 'heading', text: 'Check it the way a buyer will' },
    {
      kind: 'para',
      text: 'Before you save, zoom to fit and look at the whole room. Then zoom in as far as a buyer on a phone would. Seat numbers should be readable, the stage should be obviously the stage, and no label should sit on top of a chair. If a section is hard to read at a glance, it will be harder on a phone at the moment of buying.',
    },
    {
      kind: 'para',
      text: 'The toolbar also prints. The print export gives you a clean line drawing of the room for the venue, the door team, or the run sheet.',
    },
    {
      kind: 'pitfall',
      title: 'Editing a chart that is already selling',
      text: 'If the chart is applied to live events, the studio tells you so at the top, along with how many seats are already sold, reserved or held. Edits here stay on the template. Each event picks them up from its own Seats page after showing you what will change, and a seat that someone has already bought is never moved or deleted by a template edit. That is deliberate: a chart change must never rearrange a paying guest.',
    },
    {
      kind: 'para',
      text: 'Save the chart, then apply it to an event from that event Seats page. The next thing to get right is which ticket type each section sells at, which is its own short guide.',
    },
  ],
}
