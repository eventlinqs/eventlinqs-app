'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { fetchArtistForOwner, generateArtistSlug } from '@/lib/broadcast/artists'
import { PERFORMANCE_TYPES } from '@/lib/marketplace/gigs'
import { parseShowcaseEmbeds } from '@/lib/marketplace/showcase'

/**
 * Showcase profile server actions (flag artist_showcase). A performer edits
 * only the profile they OWN; external video is validated through the Event
 * Media Standard allowlist parser before any write, so a non-allowlisted or
 * markup-bearing URL never reaches the database.
 */

export type ShowcaseActionResult = { ok: boolean; error?: string; slug?: string }

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

const CreateProfileSchema = z.object({
  name: z.string().min(2).max(120),
})

/**
 * Self-serve performer profile creation: the marketplace on-ramp for a
 * performer nobody has tagged yet. One profile per account; a claim via an
 * organiser invite fills the same slot.
 */
export async function createOwnArtistProfileAction(
  input: z.infer<typeof CreateProfileSchema>,
): Promise<ShowcaseActionResult> {
  if (!(await isFeatureEnabled('artist_showcase'))) {
    return { ok: false, error: 'Performer profiles are not switched on yet.' }
  }
  const user = await requireUser()
  if (!user) return { ok: false, error: 'Sign in first.' }
  const parsed = CreateProfileSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Enter your performer name.' }

  const admin = createAdminClient()
  const existing = await fetchArtistForOwner(admin, user.id)
  if (existing) return { ok: false, error: 'Your account already has a performer profile.' }

  const name = parsed.data.name.trim()
  const { data: created, error } = await admin
    .from('artists')
    .insert({ name, slug: generateArtistSlug(name), owner_user_id: user.id })
    .select('slug')
    .single()
  if (error || !created) return { ok: false, error: 'Could not create your profile. Try again.' }

  revalidatePath('/artist/dashboard')
  return { ok: true, slug: created.slug as string }
}

const UpdateShowcaseSchema = z.object({
  bio: z.string().max(1000).optional(),
  performanceTypes: z.array(z.enum(PERFORMANCE_TYPES)).max(4).default([]),
  genres: z.array(z.string().min(2).max(40)).max(8).default([]),
  citySlug: z
    .string()
    .regex(/^[a-z0-9-]{2,60}$/)
    .nullable()
    .optional(),
  availableForBooking: z.boolean().default(false),
  payExpectation: z.string().max(140).optional(),
  embedUrls: z.array(z.string().max(500)).max(6).default([]),
  drawConsent: z.boolean().default(false),
  mentorOpen: z.boolean().default(false),
})

export async function updateShowcaseAction(
  input: z.infer<typeof UpdateShowcaseSchema>,
): Promise<ShowcaseActionResult> {
  if (!(await isFeatureEnabled('artist_showcase'))) {
    return { ok: false, error: 'Showcase editing is not switched on yet.' }
  }
  const user = await requireUser()
  if (!user) return { ok: false, error: 'Sign in first.' }
  const parsed = UpdateShowcaseSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the profile details.' }
  }

  const admin = createAdminClient()
  const artist = await fetchArtistForOwner(admin, user.id)
  if (!artist) return { ok: false, error: 'No performer profile is linked to your account.' }

  // The allowlist gate: every showcase link must parse as an approved
  // provider embed. A rejected URL names itself in the error.
  const embeds = parseShowcaseEmbeds(parsed.data.embedUrls)
  if (!embeds.ok) return { ok: false, error: embeds.error }

  if (parsed.data.citySlug) {
    const { data: city } = await admin
      .from('cities')
      .select('slug')
      .eq('slug', parsed.data.citySlug)
      .maybeSingle()
    if (!city) return { ok: false, error: 'Pick a city from the list.' }
  }

  const { error } = await admin
    .from('artists')
    .update({
      bio: parsed.data.bio?.trim() || null,
      performance_types: parsed.data.performanceTypes,
      genres: parsed.data.genres.map((g) => g.trim()).filter(Boolean),
      city_slug: parsed.data.citySlug ?? null,
      available_for_booking: parsed.data.availableForBooking,
      pay_expectation: parsed.data.payExpectation?.trim() || null,
      showcase_embeds: embeds.embeds,
      draw_consent: parsed.data.drawConsent,
      mentor_open: parsed.data.mentorOpen,
      updated_at: new Date().toISOString(),
    })
    .eq('id', artist.id)
    .eq('owner_user_id', user.id)

  if (error) return { ok: false, error: 'Could not save your profile. Try again.' }

  revalidatePath('/artist/dashboard')
  revalidatePath(`/artists/${artist.slug}`)
  revalidatePath('/artists')
  return { ok: true, slug: artist.slug }
}
