import type { SeatData, SectionData, SeatAreaData } from '@/components/checkout/seat-selector'

/**
 * SeatMapPreview - the read-only miniature of an event's room, for the Launch
 * Kit and any organiser surface that shows the map without selling from it.
 *
 * Pure server-rendered SVG: no client bundle, no interactivity, no zoom. It
 * mirrors the buyer map's visual language (stage band with gold accent line,
 * section colours, quiet ink for anything unavailable) so the organiser sees
 * exactly the room their buyers see, at a glance.
 */

const GOLD = '#D4A017' // --color-gold-500
const INK_900 = '#0A1628' // --color-ink-900
const INK_200 = '#D9D9D6' // --color-ink-200

const SEAT_SIZE = 20
const PADDING = 28
const STAGE_BAND = 44

interface Props {
  seats: SeatData[]
  sections: SectionData[]
  areas?: SeatAreaData[]
  className?: string
}

export function SeatMapPreview({ seats, sections, areas = [], className = '' }: Props) {
  if (seats.length === 0 && areas.length === 0) return null

  const xs = [
    ...seats.map(s => s.x),
    ...areas.flatMap(a => [a.x, a.x + a.width]),
  ]
  const ys = [
    ...seats.map(s => s.y),
    ...areas.flatMap(a => [a.y, a.y + a.height]),
  ]
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  const viewWidth = maxX - minX + SEAT_SIZE + PADDING * 2
  const viewHeight = maxY - minY + SEAT_SIZE + PADDING * 2 + STAGE_BAND

  const colorFor = new Map(sections.map(s => [s.id, s.color]))

  return (
    <svg
      viewBox={`0 0 ${viewWidth} ${viewHeight}`}
      className={className}
      role="img"
      aria-label={`Seat map preview: ${seats.length} seats across ${sections.length} section${sections.length === 1 ? '' : 's'}`}
    >
      {/* Stage band, same treatment as the buyer map */}
      <line
        x1={PADDING}
        y1={STAGE_BAND / 2 + 2}
        x2={viewWidth - PADDING}
        y2={STAGE_BAND / 2 + 2}
        stroke={GOLD}
        strokeWidth="1.5"
      />
      <rect
        x={viewWidth / 2 - 44}
        y={STAGE_BAND / 2 - 8}
        width={88}
        height={20}
        rx="4"
        fill="#FFFFFF"
      />
      <text
        x={viewWidth / 2}
        y={STAGE_BAND / 2 + 6}
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        letterSpacing="2"
        fill={INK_900}
      >
        STAGE
      </text>

      {/* Standing / GA zones and scenery (display-only, as buyers see them) */}
      {areas.map((a, i) => (
        <g key={`${a.label}-${i}`}>
          <rect
            x={a.x - minX + PADDING}
            y={a.y - minY + PADDING + STAGE_BAND}
            width={a.width}
            height={a.height}
            rx="6"
            fill={a.style === 'scenery' ? INK_900 : a.color}
            opacity={a.style === 'scenery' ? 0.08 : 0.28}
            stroke={a.style === 'scenery' ? '#9CA3AF' : a.color}
            strokeWidth="1.5"
          />
          <text
            x={a.x - minX + PADDING + a.width / 2}
            y={a.y - minY + PADDING + STAGE_BAND + a.height / 2 + 4}
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            fill={INK_900}
          >
            {a.label}
          </text>
        </g>
      ))}

      {/* Seats: section colour when open, quiet ink when not */}
      {seats.map(seat => {
        const open = seat.status === 'available'
        const fill = open ? (colorFor.get(seat.seat_map_section_id ?? '') ?? GOLD) : INK_200
        return (
          <rect
            key={seat.id}
            x={seat.x - minX + PADDING}
            y={seat.y - minY + PADDING + STAGE_BAND}
            width={SEAT_SIZE}
            height={SEAT_SIZE}
            rx="3"
            fill={fill}
            stroke={open ? 'rgba(255,255,255,0.55)' : 'transparent'}
            strokeWidth="1"
          />
        )
      })}
    </svg>
  )
}
