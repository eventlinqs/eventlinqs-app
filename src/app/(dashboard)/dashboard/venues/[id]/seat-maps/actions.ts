'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveSeatingOrganisation } from '@/lib/organisations/access'
import { revalidatePath } from 'next/cache'
import {
  generateLayout,
  validateLayout,
  type SeatBlock,
} from '@/lib/seating/generate'

// CSV row shape after parsing
interface ParsedSeat {
  section: string
  row: string
  seat_number: string
  seat_type: string
  x: number
  y: number
}

// Layout JSON shape stored in seat_maps.layout
interface SeatMapLayout {
  sections: {
    id: string
    name: string
    color: string
    sort_order: number
    rows: {
      label: string
      seats: {
        number: string
        type: string
        x: number
        y: number
      }[]
    }[]
  }[]
}

const ALLOWED_SEAT_TYPES = ['standard', 'premium', 'accessible', 'companion', 'restricted_view', 'obstructed']
const REQUIRED_HEADERS = ['section', 'row', 'seat_number', 'seat_type', 'x', 'y']

// Section fills cycle per section for visual distinction on the seat map.
// The lead blue is the brand info token #0EA5E9 (was off-brand #4A90D9).
const SECTION_COLORS = [
  '#0EA5E9', '#E91E63', '#4CAF50', '#FF9800', '#9C27B0',
  '#00BCD4', '#F44336', '#3F51B5', '#8BC34A', '#FF5722',
]

export interface ImportResult {
  success: boolean
  seat_map_id?: string
  seat_count?: number
  sections?: { id: string; name: string; color: string }[]
  layout?: SeatMapLayout
  error?: string
}

function parseCsv(raw: string): { rows: ParsedSeat[]; errors: string[] } {
  const lines = raw.split(/\r?\n/).filter(l => l.trim())
  if (lines.length === 0) return { rows: [], errors: ['CSV is empty'] }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())

  // Validate headers
  const missing = REQUIRED_HEADERS.filter(h => !headers.includes(h))
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [`Missing required columns: ${missing.join(', ')}. Required: ${REQUIRED_HEADERS.join(', ')}`],
    }
  }

  const idx = (name: string) => headers.indexOf(name)
  const sectionIdx = idx('section')
  const rowIdx = idx('row')
  const seatNumIdx = idx('seat_number')
  const seatTypeIdx = idx('seat_type')
  const xIdx = idx('x')
  const yIdx = idx('y')

  const rows: ParsedSeat[] = []
  const errors: string[] = []

  for (let i = 1; i < lines.length; i++) {
    const lineNum = i + 1
    const cols = lines[i].split(',').map(c => c.trim())

    if (cols.length < headers.length) {
      errors.push(`Line ${lineNum}: expected ${headers.length} columns, got ${cols.length}`)
      continue
    }

    const section = cols[sectionIdx]
    const row = cols[rowIdx]
    const seat_number = cols[seatNumIdx]
    const seat_type = cols[seatTypeIdx].toLowerCase()
    const xRaw = cols[xIdx]
    const yRaw = cols[yIdx]

    if (!section) { errors.push(`Line ${lineNum}: section is blank`); continue }
    if (!row) { errors.push(`Line ${lineNum}: row is blank`); continue }
    if (!seat_number) { errors.push(`Line ${lineNum}: seat_number is blank`); continue }
    if (!ALLOWED_SEAT_TYPES.includes(seat_type)) {
      errors.push(`Line ${lineNum}: invalid seat_type "${seat_type}". Allowed: ${ALLOWED_SEAT_TYPES.join(', ')}`)
      continue
    }

    const x = parseFloat(xRaw)
    const y = parseFloat(yRaw)
    if (isNaN(x)) { errors.push(`Line ${lineNum}: x is not a number ("${xRaw}")`); continue }
    if (isNaN(y)) { errors.push(`Line ${lineNum}: y is not a number ("${yRaw}")`); continue }

    rows.push({ section, row, seat_number, seat_type, x, y })
  }

  return { rows, errors }
}

function buildLayout(seats: ParsedSeat[]): SeatMapLayout {
  // Group by section → row
  const sectionMap = new Map<string, Map<string, ParsedSeat[]>>()

  for (const seat of seats) {
    if (!sectionMap.has(seat.section)) sectionMap.set(seat.section, new Map())
    const rowMap = sectionMap.get(seat.section)!
    if (!rowMap.has(seat.row)) rowMap.set(seat.row, [])
    rowMap.get(seat.row)!.push(seat)
  }

  let colorIndex = 0
  const sections: SeatMapLayout['sections'] = []

  for (const [sectionName, rowMap] of sectionMap) {
    const color = SECTION_COLORS[colorIndex % SECTION_COLORS.length]
    colorIndex++

    const rows = Array.from(rowMap.entries()).map(([rowLabel, rowSeats]) => ({
      label: rowLabel,
      seats: rowSeats.map(s => ({
        number: s.seat_number,
        type: s.seat_type,
        x: s.x,
        y: s.y,
      })),
    }))

    sections.push({
      id: `section-${sectionName.toLowerCase().replace(/\s+/g, '-')}`,
      name: sectionName,
      color,
      sort_order: sections.length,
      rows,
    })
  }

  return { sections }
}

export interface SaveSeatMapResult {
  success: boolean
  seat_map_id?: string
  total_seats?: number
  error?: string
}

/**
 * Save (create or update) a venue seat map from the visual builder's block
 * definitions. The blocks are the editable source of truth; the layout the
 * attendee map and materialize_seats consume is REGENERATED server-side by
 * the same pure module the builder previews with, so a tampered client
 * cannot save a layout its blocks do not describe. Editing a template never
 * touches an existing event's seats: events materialise a copy at attach
 * time, and materialize_seats refuses events with live inventory.
 */
export async function saveSeatMap(
  venueId: string,
  seatMapId: string | null,
  mapName: string,
  blocks: SeatBlock[]
): Promise<SaveSeatMapResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // Owner OR owner/admin/manager member (the door-scan trust level). The
  // venue must belong to the resolved organisation; the venue read runs on
  // the admin client so a member is not blocked by owner-scoped venue RLS.
  const org = await resolveSeatingOrganisation(supabase, user.id)
  if (!org) return { success: false, error: 'Organisation not found' }

  const { data: venue } = await createAdminClient()
    .from('venues')
    .select('id')
    .eq('id', venueId)
    .eq('organisation_id', org.id)
    .eq('is_active', true)
    .single()
  if (!venue) return { success: false, error: 'Venue not found or access denied' }

  if (!Array.isArray(blocks) || blocks.length === 0) {
    return { success: false, error: 'Add at least one seating block before saving.' }
  }
  if (blocks.length > 500) {
    return { success: false, error: 'Too many blocks in one chart (500 maximum).' }
  }

  const layout = generateLayout(blocks)
  const issues = validateLayout(layout)
  if (issues.length > 0) {
    return {
      success: false,
      error: `Fix these before saving:\n${issues.slice(0, 8).map(i => i.message).join('\n')}`,
    }
  }
  if (layout.totalSeats === 0 && layout.areas.length === 0) {
    return { success: false, error: 'This chart has no seats and no standing areas.' }
  }

  const admin = createAdminClient()
  const name = mapName.trim() || 'Seating chart'

  let mapId = seatMapId
  if (mapId) {
    const { error: updateError } = await admin
      .from('seat_maps')
      .update({ name, layout, total_seats: layout.totalSeats })
      .eq('id', mapId)
      .eq('venue_id', venueId)
    if (updateError) {
      console.error('[seat-maps] update failed:', updateError)
      return { success: false, error: 'Failed to save the seating chart.' }
    }
  } else {
    const { data: created, error: insertError } = await admin
      .from('seat_maps')
      .insert({ venue_id: venueId, name, layout, total_seats: layout.totalSeats, is_active: true })
      .select('id')
      .single()
    if (insertError || !created) {
      console.error('[seat-maps] insert failed:', insertError)
      return { success: false, error: 'Failed to create the seating chart.' }
    }
    mapId = created.id
  }

  // Upsert the section rows (name + colour) so tier mapping and the attendee
  // map read consistent section identities. Uses the (seat_map_id, name)
  // unique index from 20260705000001.
  for (const section of layout.sections) {
    const { error: sectionError } = await admin
      .from('seat_map_sections')
      .upsert(
        {
          seat_map_id: mapId,
          name: section.name,
          color: section.color,
          sort_order: section.sort_order,
        },
        { onConflict: 'seat_map_id,name' }
      )
    if (sectionError) {
      console.error('[seat-maps] section upsert failed:', sectionError)
      return { success: false, error: `Failed to save section "${section.name}".` }
    }
  }

  revalidatePath(`/dashboard/venues/${venueId}/seat-maps`)
  return { success: true, seat_map_id: mapId ?? undefined, total_seats: layout.totalSeats }
}

export async function importSeatMapCsv(
  venueId: string,
  mapName: string,
  csvContent: string
): Promise<ImportResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // Verify venue belongs to an organisation the caller may manage seating for
  const org = await resolveSeatingOrganisation(supabase, user.id)
  if (!org) return { success: false, error: 'Organisation not found' }

  const { data: venue } = await createAdminClient()
    .from('venues')
    .select('id')
    .eq('id', venueId)
    .eq('organisation_id', org.id)
    .eq('is_active', true)
    .single()
  if (!venue) return { success: false, error: 'Venue not found or access denied' }

  // Parse CSV
  const { rows: parsedSeats, errors: parseErrors } = parseCsv(csvContent)

  if (parseErrors.length > 0) {
    return {
      success: false,
      error: `CSV validation failed:\n${parseErrors.slice(0, 10).join('\n')}${parseErrors.length > 10 ? `\n…and ${parseErrors.length - 10} more errors` : ''}`,
    }
  }

  if (parsedSeats.length === 0) {
    return { success: false, error: 'No valid seats found in CSV' }
  }

  const layout = buildLayout(parsedSeats)
  const admin = createAdminClient()

  // Insert seat_maps row
  const { data: seatMap, error: mapError } = await admin
    .from('seat_maps')
    .insert({
      venue_id: venueId,
      name: mapName.trim() || 'Seat Map',
      layout,
      total_seats: parsedSeats.length,
      is_active: true,
    })
    .select('id')
    .single()

  if (mapError || !seatMap) {
    console.error('[seat-maps] insert seat_maps failed:', mapError)
    return { success: false, error: `Failed to create seat map: ${mapError?.message}` }
  }

  // Insert seat_map_sections (one per unique section)
  const sectionInserts = layout.sections.map(s => ({
    seat_map_id: seatMap.id,
    name: s.name,
    color: s.color,
    sort_order: s.sort_order,
  }))

  const { data: insertedSections, error: sectionsError } = await admin
    .from('seat_map_sections')
    .insert(sectionInserts)
    .select('id, name, color')

  if (sectionsError) {
    console.error('[seat-maps] insert seat_map_sections failed:', sectionsError)
    // Rollback seat_map row
    await admin.from('seat_maps').delete().eq('id', seatMap.id)
    return { success: false, error: `Failed to create seat map sections: ${sectionsError.message}` }
  }

  revalidatePath(`/dashboard/venues/${venueId}/seat-maps`)
  revalidatePath('/dashboard/venues')

  return {
    success: true,
    seat_map_id: seatMap.id,
    seat_count: parsedSeats.length,
    sections: insertedSections ?? [],
    layout,
  }
}

export async function deleteSeatMap(venueId: string, seatMapId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const org = await resolveSeatingOrganisation(supabase, user.id)
  if (!org) return { error: 'Organisation not found' }

  const admin = createAdminClient()

  // The venue must belong to the caller's organisation: without this check a
  // caller could soft-delete another organisation's chart by guessing ids.
  const { data: venue } = await admin
    .from('venues')
    .select('id')
    .eq('id', venueId)
    .eq('organisation_id', org.id)
    .single()
  if (!venue) return { error: 'Venue not found or access denied' }

  const { error } = await admin
    .from('seat_maps')
    .update({ is_active: false })
    .eq('id', seatMapId)
    .eq('venue_id', venueId)

  if (error) {
    console.error('[seat-maps] deleteSeatMap failed:', error)
    return { error: `Failed to delete seat map: ${error.message}` }
  }

  revalidatePath(`/dashboard/venues/${venueId}/seat-maps`)
  revalidatePath('/dashboard/venues')
  return {}
}
