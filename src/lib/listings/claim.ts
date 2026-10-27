import 'server-only'
import { createHash, randomInt, randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { sendEmail } from '@/lib/email/send'
import { escapeHtml } from '@/lib/email/escape'

/**
 * CLAIM THIS VENUE, CLAIM THIS EVENT (window 6, 27 October 2026; the locked foundation's item 7; the design is
 * docs/walk-in/WI2-PLAN.md section 9, Part 3b, and the table supabase/migrations/20261027150001_listing_claims.sql).
 *
 * "The claim, signed in: name and role, then a 6-digit code (15 minutes, 5 tries, a rate-limit policy in policies.ts)
 * sent to the venue's published email on record, or to an address at the venue website's own domain. The email holds
 * only who asked, the code, and 'if this was not you, ignore this email': no invitation, no promotion (section 3, Spam
 * Act). With neither address, 'Ask us to check' files a manual claim for Lawal."
 *
 * Google's own page, read for the plan (WI2-PLAN.md section 2): "You can add or claim your business at no charge", an
 * emailed code being one of its methods. A claim is free, always.
 *
 * WHERE THE CODE GOES (addressFor): the venue's published address when it has one; else an address the claimant names
 * at the venue website's own domain (www. aside), so the code reaches someone inside the business; else nowhere, and
 * the claim is manual. An event is claimed through its venue's addresses. The address is never the claimant's own
 * account address: that would prove nothing.
 *
 * THE CODE. Six digits from the platform's own random source; only sha256(claim id : code) is kept, so a read of the
 * table never yields a usable code. The database holds the 15 minutes and the 5 tries (listing_claim_check), so no
 * caller can try past them.
 */

export const CODE_MINUTES = 15

export type ClaimTarget = { kind: 'venue'; venueId: string } | { kind: 'event'; eventId: string }
export type HostAddresses = { name: string; publishedEmail: string | null; websiteUrl: string | null }
export type ClaimAddress = { method: 'published_email' | 'domain_email'; email: string } | { method: 'manual' }

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** The bare host a site is on, www. aside, lower case; null where it is not an https address. */
export function siteHost(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === 'https:' ? u.hostname.toLowerCase().replace(/^www\./, '') : null
  } catch {
    return null
  }
}

/** Where a claim's code goes, by the plan's order; manual where the venue gives no address the code may go to. */
export function addressFor(host: HostAddresses, named: string | null): ClaimAddress {
  const published = host.publishedEmail?.trim().toLowerCase() ?? ''
  if (EMAIL.test(published)) return { method: 'published_email', email: published }
  const domain = siteHost(host.websiteUrl)
  const offered = named?.trim().toLowerCase() ?? ''
  if (domain && EMAIL.test(offered) && offered.split('@')[1] === domain) return { method: 'domain_email', email: offered }
  return { method: 'manual' }
}

export function claimCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function hashClaimCode(claimId: string, code: string): string {
  return createHash('sha256').update(`${claimId}:${code.trim()}`).digest('hex')
}

/** The code email: who asked, the code, and what to do if it was not them. Nothing else (Spam Act, section 3 of the plan). */
export function claimEmail(input: { hostName: string; claimantName: string; claimantRole: string; code: string }): { subject: string; html: string; text: string } {
  const subject = `Your EventLinqs code for ${input.hostName}`
  const text = [
    `${input.claimantName} (${input.claimantRole}) asked to manage ${input.hostName} on EventLinqs.`,
    '',
    `Their code is ${input.code}. It works for ${CODE_MINUTES} minutes.`,
    '',
    'If this was not you, or you do not know them, ignore this email and nothing changes.',
  ].join('\n')
  // The reminder emails' own shell (src/lib/walk-in/reminder-messages.ts), so every operational email EventLinqs sends
  // looks like one company: the same page, type and colours. Found reading the claim email at phone width (the project
  // manager's 21:56 (3)): it was bare markup in the reader's default type. No link of any kind, as before.
  const p = 'margin:0 0 8px;font-size:15px;line-height:1.6;color:#1A1A1A;'
  const html = [
    '<!DOCTYPE html>',
    '<html lang="en-AU"><body style="margin:0;background:#FAFAF7;">',
    '  <div style="font-family:Manrope,Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#FFFFFF;">',
    '    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6F5409;font-weight:700;">EventLinqs</p>',
    `    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#0A1628;">Your code for ${escapeHtml(input.hostName)}</h1>`,
    `    <p style="${p}">${escapeHtml(input.claimantName)} (${escapeHtml(input.claimantRole)}) asked to manage ${escapeHtml(input.hostName)} on EventLinqs.</p>`,
    `    <p style="${p}">Their code is <strong style="font-size:22px;letter-spacing:.12em;color:#0A1628;">${escapeHtml(input.code)}</strong>. It works for ${CODE_MINUTES} minutes.</p>`,
    '    <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#4A4A4A;">If this was not you, or you do not know them, ignore this email and nothing changes.</p>',
    '  </div>',
    '</body></html>',
  ].join('\n')
  return { subject, html, text }
}

export type ClaimDeps = {
  hostOf(target: ClaimTarget): Promise<HostAddresses | null>
  insertClaim(row: {
    id: string
    target: ClaimTarget
    userId: string
    name: string
    role: string
    address: ClaimAddress
    codeHash: string | null
    expiresAt: Date | null
  }): Promise<void>
  send(to: string, email: { subject: string; html: string; text: string }): Promise<void>
  /** The claimant's own organisation, or null where they have none. */
  organisationOf(userId: string): Promise<string | null>
  /** Makes the claimant an organisation named after the host, only once their code is known to be right. */
  makeOrganisation(userId: string, hostName: string): Promise<string>
  check(claimId: string, codeHash: string, organisationId: string | null, at: Date): Promise<string>
  /** Who started a claim and what it claims; null where there is no such claim. */
  claimOf(claimId: string): Promise<{ userId: string; target: ClaimTarget } | null>
}

export type Started =
  | { state: 'sent'; claimId: string; to: string; method: 'published_email' | 'domain_email' }
  | { state: 'manual'; claimId: string }
  | { state: 'refused'; reason: string }

/** Starts a claim: a code to the venue's own address, or a manual claim for Lawal where it gives none. */
export async function startClaim(
  input: { target: ClaimTarget; userId: string; name: string; role: string; namedEmail: string | null; at: Date },
  deps: ClaimDeps,
): Promise<Started> {
  const name = input.name.trim()
  const role = input.role.trim()
  if (name.length < 1 || name.length > 120) return { state: 'refused', reason: 'Add your name.' }
  if (role.length < 1 || role.length > 80) return { state: 'refused', reason: 'Add your role at the venue.' }
  const host = await deps.hostOf(input.target)
  if (!host) return { state: 'refused', reason: 'This listing cannot be claimed.' }
  const address = addressFor(host, input.namedEmail)
  const id = randomUUID()
  if (address.method === 'manual') {
    await deps.insertClaim({ id, target: input.target, userId: input.userId, name, role, address, codeHash: null, expiresAt: null })
    return { state: 'manual', claimId: id }
  }
  const code = claimCode()
  await deps.insertClaim({
    id,
    target: input.target,
    userId: input.userId,
    name,
    role,
    address,
    codeHash: hashClaimCode(id, code),
    expiresAt: new Date(input.at.getTime() + CODE_MINUTES * 60_000),
  })
  await deps.send(address.email, claimEmail({ hostName: host.name, claimantName: name, claimantRole: role, code }))
  return { state: 'sent', claimId: id, to: address.email, method: address.method }
}

export type Checked = 'verified' | 'wrong' | 'expired' | 'locked' | 'not_yours'

/** Tries a code once, for the claimant who started the claim; the database counts the try and does the move. */
export async function checkClaim(input: { claimId: string; code: string; userId: string; at: Date }, deps: ClaimDeps): Promise<Checked> {
  const claim = await deps.claimOf(input.claimId)
  if (!claim || claim.userId !== input.userId) return 'not_yours'
  if (!/^\d{6}$/.test(input.code.trim())) return 'wrong'
  const codeHash = hashClaimCode(input.claimId, input.code)
  let answer = await deps.check(input.claimId, codeHash, await deps.organisationOf(input.userId), input.at)
  if (answer === 'needs_organisation') {
    const host = await deps.hostOf(claim.target)
    answer = await deps.check(input.claimId, codeHash, await deps.makeOrganisation(input.userId, host?.name ?? 'My organisation'), input.at)
  }
  return answer === 'verified' || answer === 'wrong' || answer === 'expired' || answer === 'locked' ? answer : 'expired'
}

/** A slug the organisation form itself would accept: lower case letters, digits and hyphens, 2 to 60 long. */
export function organisationSlug(hostName: string, suffix: number): string {
  const stem = hostName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
  return `${stem.length >= 2 ? stem : 'venue'}-${suffix}`
}

/** The deps as the platform holds them. */
export function claimDeps(): ClaimDeps {
  const admin = createAdminClient()
  return {
    async hostOf(target) {
      const venueId =
        target.kind === 'venue'
          ? target.venueId
          : ((
              await readOrThrow('claim event venue', () => admin.from('events').select('venue_id').eq('id', target.eventId).limit(1).maybeSingle())
            )?.venue_id ?? null)
      if (!venueId) return null
      const venue = await readOrThrow('claim host addresses', () =>
        admin.from('venues').select('name, published_email, website_url, removed_at').eq('id', venueId).limit(1).maybeSingle(),
      )
      if (!venue || venue.removed_at) return null
      return { name: venue.name, publishedEmail: venue.published_email, websiteUrl: venue.website_url }
    },
    async insertClaim(row) {
      const { error } = await admin.from('listing_claims').insert({
        id: row.id,
        venue_id: row.target.kind === 'venue' ? row.target.venueId : null,
        event_id: row.target.kind === 'event' ? row.target.eventId : null,
        claimant_user_id: row.userId,
        claimant_name: row.name,
        claimant_role: row.role,
        email_used: row.address.method === 'manual' ? null : row.address.email,
        method: row.address.method,
        code_hash: row.codeHash,
        expires_at: row.expiresAt?.toISOString() ?? null,
        status: row.address.method === 'manual' ? 'manual_open' : 'sent',
      })
      if (error) throw new Error(`the claim was not kept: ${error.message}`)
    },
    async send(to, email) {
      await sendEmail({ to, subject: email.subject, html: email.html, text: email.text, messageType: 'listing_claim_code', recipientRole: 'prospect' })
    },
    async organisationOf(userId) {
      const org = await readOrThrow('claimant organisation', () =>
        admin.from('organisations').select('id').eq('owner_id', userId).order('created_at', { ascending: true }).limit(1).maybeSingle(),
      )
      return org?.id ?? null
    },
    async makeOrganisation(userId, hostName) {
      const { data: org, error } = await admin
        .from('organisations')
        .insert({ name: hostName.slice(0, 100), slug: organisationSlug(hostName, randomInt(1000, 10000)), owner_id: userId, status: 'active' })
        .select('id')
        .single()
      if (error || !org) throw new Error(`the claimant's organisation was not made: ${error?.message ?? 'no row'}`)
      const { error: memberError } = await admin.from('organisation_members').insert({ organisation_id: org.id, user_id: userId, role: 'owner' })
      if (memberError) {
        await admin.from('organisations').delete().eq('id', org.id)
        throw new Error(`the claimant was not made its owner: ${memberError.message}`)
      }
      return org.id
    },
    async check(claimId, codeHash, organisationId, at) {
      const { data, error } = await admin.rpc('listing_claim_check', {
        p_claim: claimId,
        p_code_hash: codeHash,
        p_organisation: organisationId as string,
        p_at: at.toISOString(),
      })
      if (error) throw new Error(`the code was not checked: ${error.message}`)
      return String(data)
    },
    async claimOf(claimId) {
      const row = await readOrThrow('listing claim', () =>
        admin.from('listing_claims').select('claimant_user_id, venue_id, event_id').eq('id', claimId).limit(1).maybeSingle(),
      )
      if (!row) return null
      return { userId: row.claimant_user_id, target: row.venue_id ? { kind: 'venue', venueId: row.venue_id } : { kind: 'event', eventId: row.event_id as string } }
    },
  }
}
