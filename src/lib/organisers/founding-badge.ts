import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { captureException } from '@/lib/observability/sentry'

/**
 * Is this organisation a Founding Organiser, for the PUBLIC surfaces?
 *
 * Close-out FO1 requires the words "Founding Organiser" on the organiser's own
 * page and on their event pages, and nowhere for a standard organiser.
 *
 * WHY IT IS READ WITH THE SERVICE ROLE RATHER THAN BY THE PUBLIC CLIENT.
 * The founder ruling of 2026-08-08, recorded in migration
 * 20260808000010_rls_column_privilege_lockdown.sql, is that the public columns
 * of `organisations` are exactly id, name, slug, description, logo_url and
 * website, and the table comment says in as many words: do not grant further
 * columns to anon or authenticated. `is_founding` is not on that list and this
 * module does not add it. Instead the two surfaces that need the badge read it
 * here, on the server, and collapse it to a single boolean before anything
 * crosses the client boundary. That is the pattern `organiserCanSell` on the
 * event page and the status gate on the organiser profile already use, so this
 * introduces no new posture and widens no grant.
 *
 * WHY THE BADGE IS `is_founding` AND NOT "THE WINDOW IS OPEN". They are
 * different facts. The fee-free window expires; membership of the first fifty
 * does not. An organiser who joined in the first fifty and whose six months
 * have run out is still a Founding Organiser, and taking the words off their
 * page on the day their discount ends would be the platform quietly editing
 * their history. The window is shown to the ORGANISER, on their own dashboard,
 * because that is the one who needs to know when it ends.
 *
 * FAILS TO "NOT FOUNDING" on any error. A badge is decoration; refusing to
 * render it costs a line of text, and inventing one on a lookup failure would
 * put a claim on a public page that nothing in the database supports.
 */
export interface FoundingBadge {
  isFounding: boolean
}

export const FOUNDING_BADGE_LABEL = 'Founding Organiser'

export async function getFoundingBadge(
  organisationId: string | null | undefined,
): Promise<FoundingBadge> {
  if (!organisationId) return { isFounding: false }
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('organisations')
      .select('is_founding')
      .eq('id', organisationId)
      .maybeSingle()
    if (error) {
      console.error('[founding-badge] could not read is_founding for %s:', organisationId, error)
      return { isFounding: false }
    }
    return { isFounding: data?.is_founding === true }
  } catch (error) {
    captureException(error, { where: 'lib/organisers/founding-badge:getFoundingBadge' })
    return { isFounding: false }
  }
}
