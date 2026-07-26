import type { SeatData, SectionData, SeatAreaData, SeatDecorData } from '@/components/checkout/seat-selector'
import { editorialSectionColor } from '@/lib/seating/palette'
import { buildScene } from '@/lib/seating/render/scene'
import { sceneToPrintSvg } from '@/lib/seating/render/svg-export'

/**
 * SeatMapPreview - the read-only miniature of an event's room, for the
 * Launch Kit and any organiser surface that shows the map without selling
 * from it. Server-rendered through the printed-plan path (the one SVG
 * renderer kept), so the preview IS the plan: stage geometry, chair
 * glyphs, flank letters and section names, no client bundle.
 */

interface Props {
  seats: SeatData[]
  sections: SectionData[]
  areas?: SeatAreaData[]
  decor?: SeatDecorData
  className?: string
}

export function SeatMapPreview({ seats, sections, areas = [], decor, className = '' }: Props) {
  if (seats.length === 0 && areas.length === 0) return null

  const sectionColor = new Map(
    sections.map(s => [s.id, editorialSectionColor(s.color)]),
  )
  const scene = buildScene({
    seats,
    sections,
    areas: areas.map(a => ({ ...a, color: editorialSectionColor(a.color) })),
    stage: decor?.stage ?? undefined,
    objects: decor?.objects ?? [],
    colorForSeat: s => sectionColor.get(s.seat_map_section_id ?? '') ?? '#1F5673',
  })
  const svg = sceneToPrintSvg(scene, '')

  return (
    <div
      className={`[&>svg]:block [&>svg]:h-auto [&>svg]:max-h-[inherit] [&>svg]:w-full ${className}`}
      role="img"
      aria-label={`Seat map preview: ${seats.length} seats across ${sections.length} section${
        sections.length === 1 ? '' : 's'
      }`}
      // Our own generator, every text node escaped: safe to inline.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
