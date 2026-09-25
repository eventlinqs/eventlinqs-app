'use server'

/**
 * SAVING WHAT AN ORGANISER OR A VENUE SAYS ABOUT ACCESS.
 *
 * Close-out SEO5 step 4: "populated from fields the organiser and venue can
 * fill."
 *
 * ============================================================================
 * WHY THIS IS ITS OWN ACTION AND NOT TWELVE MORE FIELDS ON `updateEvent`
 * ============================================================================
 *
 * The migration that creates these columns is PARKED
 * (`docs/migrations-pending/20260914000002_accessibility_fields.sql`), because
 * applying one to production is the founder's reserved step and merging code is
 * not. Until he applies it the columns do not exist on production.
 *
 * PostgREST fails the WHOLE statement on a column it does not have. So adding
 * `wheelchair_accessible` to the payload `createEvent` and `updateEvent` write
 * would mean that, between this merge and his migration, NO ORGANISER COULD
 * CREATE OR EDIT AN EVENT AT ALL. Twelve informational fields would have taken
 * out the platform's most important authenticated flow, and the local gate
 * would have been green the whole time because this machine's TEST database
 * already has the columns.
 *
 * Separating the write means the blast radius of the missing columns is exactly
 * this panel: it reports that the fields are not available yet and nothing else
 * on the page is affected.
 *
 * ============================================================================
 * IT WRITES ONLY WHAT IT OWNS
 * ============================================================================
 *
 * The update payload is built from `ACCESSIBILITY_FLAGS` plus the two text
 * fields and nothing else, so this action cannot be used to change a price, a
 * date or a status even if a caller sends one. The column list is derived from
 * the same constant the display and the guard read, so the three cannot drift.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { resolveEventAccess } from '@/lib/organisations/event-access'
import { resolveOrganisationScope } from '@/lib/organisations/scope'
import { ACCESSIBILITY_FLAGS, type AccessibilityScope } from '@/lib/accessibility/fields'

/** What a panel sends. Flags by column name, plus the two text fields. */
export interface AccessibilityInput {
  flags: Record<string, boolean>
  notes: string | null
  contact: string | null
}

export interface AccessibilityResult {
  error?: string
  /** True when the failure was "these columns do not exist here yet". */
  notMigrated?: boolean
}

/** Postgres: undefined_column. PostgREST passes the SQLSTATE through. */
const UNDEFINED_COLUMN = '42703'

/**
 * The two text fields, bounded the same way the migration's CHECK bounds them.
 *
 * Checked HERE as well as in the database so the organiser gets a sentence
 * rather than a raw constraint violation, and so the bound is enforced even for
 * a writer that reaches the table some other way.
 */
const NOTES_MAX = 2000
const CONTACT_MAX = 200

function cleanText(value: string | null, max: number): { value: string | null; tooLong: boolean } {
  if (typeof value !== 'string') return { value: null, tooLong: false }
  const trimmed = value.trim()
  if (trimmed.length === 0) return { value: null, tooLong: false }
  return { value: trimmed, tooLong: trimmed.length > max }
}

/**
 * Build the payload from the constant, never from the caller's key list.
 *
 * A flag the caller did not send is written `false`, which is the honest
 * encoding of an unticked box: NOT STATED. The display never renders a false,
 * so this cannot become a claim that something is absent.
 */
function payloadFor(scope: AccessibilityScope, input: AccessibilityInput) {
  const payload: Record<string, boolean | string | null> = {}
  for (const flag of ACCESSIBILITY_FLAGS) {
    if (!flag.scopes.includes(scope)) continue
    payload[flag.column] = input.flags[flag.column] === true
  }
  return payload
}

function describe(error: { code?: string; message: string }): AccessibilityResult {
  if (error.code === UNDEFINED_COLUMN) {
    return {
      notMigrated: true,
      error:
        'Accessibility fields are not available on this environment yet. They arrive with the next database change.',
    }
  }
  return { error: `Could not save accessibility details: ${error.message}` }
}

export async function saveEventAccessibility(
  eventId: string,
  input: AccessibilityInput,
): Promise<AccessibilityResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // The SAME gate the edit page and updateEvent use: owner, or a member holding
  // owner/admin/manager. Never a second authorisation rule of its own.
  const access = await resolveEventAccess(eventId)
  if (!access.allowed) return { error: 'You do not have access to this event' }

  const notes = cleanText(input.notes, NOTES_MAX)
  if (notes.tooLong) return { error: `Access notes must be ${NOTES_MAX} characters or fewer` }
  const contact = cleanText(input.contact, CONTACT_MAX)
  if (contact.tooLong) return { error: `Access contact must be ${CONTACT_MAX} characters or fewer` }

  const admin = createAdminClient()
  const { error } = await admin
    .from('events')
    .update({
      ...payloadFor('event', input),
      accessibility_notes: notes.value,
      accessibility_contact: contact.value,
    } as never)
    .eq('id', eventId)

  if (error) return describe(error)

  // The public page is what this is for, so it is the page that must change.
  const { data: row } = await admin.from('events').select('slug').eq('id', eventId).maybeSingle()
  if (row?.slug) revalidatePath(`/events/${row.slug}`)
  revalidatePath(`/dashboard/events/${eventId}/edit`)
  return {}
}

export async function saveVenueAccessibility(
  venueId: string,
  input: AccessibilityInput,
): Promise<AccessibilityResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // The same scope `updateVenue` uses, and the same `.eq('organisation_id')`
  // on the statement, so a venue id from another business updates nothing.
  const scope = await resolveOrganisationScope()
  if (!scope.ok) return { error: 'Organisation not found' }

  const notes = cleanText(input.notes, NOTES_MAX)
  if (notes.tooLong) return { error: `Access notes must be ${NOTES_MAX} characters or fewer` }
  const contact = cleanText(input.contact, CONTACT_MAX)
  if (contact.tooLong) return { error: `Access contact must be ${CONTACT_MAX} characters or fewer` }

  const admin = createAdminClient()
  const { error } = await admin
    .from('venues')
    .update({
      ...payloadFor('venue', input),
      accessibility_notes: notes.value,
      accessibility_contact: contact.value,
    } as never)
    .eq('id', venueId)
    .eq('organisation_id', scope.active.id)

  if (error) return describe(error)

  revalidatePath('/dashboard/venues')
  return {}
}
