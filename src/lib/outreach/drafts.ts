/**
 * ONE MESSAGE FROM A TEMPLATE ROW, STORED QUEUED OR HELD (window 6, 28 October 2026).
 *
 * The newest version of the template is filled from the contact's verified facts (src/lib/outreach/facts.ts) and judged
 * by every rule of the messages file (src/lib/outreach/rules.ts). A message that passes is stored QUEUED for the sender
 * when it may go automatically (an email inside an approved play, or an answer or partner message by email); one that
 * fails any rule is stored HELD with the rules named, for Lawal (the project manager's 20:10). The database judges it
 * again either way and refuses what it must (migrations 213001 and 224001), in its own words.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { renderTemplate, type MessageChannel, type MessagePurpose } from './rules'
import { factsForContact } from './facts'
import { refusalFromError, type Done } from './crm'

type Admin = SupabaseClient<Database>

export type DraftRequest = {
  contactId: string
  /** The newest version of this key, unless templateId pins the exact version (a play's approved version). */
  templateKey: string
  templateId?: string | null
  purpose: MessagePurpose
  step?: 1 | 2 | 3 | null
  playId?: string | null
  /** Facts the caller holds that the rows do not: the thread's subject, a provider name, figures for a report. */
  extraFields?: Record<string, string | null>
  /** The inbound message this answers, so it sits in their thread. */
  inReplyTo?: string | null
  /** Message 8: the night report it was drafted from; the database holds one live message per report. */
  nightReportId?: string | null
  /** Message 7: the partner's own tracked link the message carries, which also keeps it to one per kit. */
  trackedLink?: string | null
  scheduledFor: Date
  origin: string
  draftedBy: string
}

export type DraftResult = Done<{ id: string; state: 'queued' | 'held'; heldBecause: string[] }>

export async function draftFromTemplate(db: Admin, r: DraftRequest): Promise<DraftResult> {
  const template = r.templateId
    ? await db.from('outreach_templates').select('id, channel, purpose, step, subject, body').eq('id', r.templateId).maybeSingle()
    : await db
        .from('outreach_templates')
        .select('id, channel, purpose, step, subject, body')
        .eq('key', r.templateKey)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()
  if (template.error || !template.data) return { state: 'refused', reason: `no template ${r.templateKey}` }
  const contact = await db.from('organiser_contacts').select('channel, unsubscribe_token').eq('id', r.contactId).single()
  if (contact.error) return { state: 'refused', reason: refusalFromError(contact.error) }

  const facts = { ...(await factsForContact(db, r.contactId, r.origin)), ...(r.extraFields ?? {}) }
  const unsubscribe = contact.data.channel === 'email' ? `${r.origin.replace(/\/+$/, '')}/unsubscribe/outreach?t=${contact.data.unsubscribe_token}` : null
  const rendered = renderTemplate(
    {
      channel: template.data.channel as MessageChannel,
      purpose: template.data.purpose as MessagePurpose,
      step: template.data.step,
      subject: template.data.subject,
      body: template.data.body,
    },
    facts,
    unsubscribe,
  )

  const automatic = contact.data.channel === 'email' && (r.purpose !== 'cadence' || Boolean(r.playId))
  const state: 'queued' | 'held' = automatic && rendered.heldBecause.length === 0 ? 'queued' : 'held'
  const row = await db
    .from('outreach_touches')
    .insert({
      contact_id: r.contactId,
      purpose: r.purpose,
      step: r.purpose === 'cadence' ? (r.step ?? 1) : null,
      template_id: template.data.id,
      play_id: r.playId ?? null,
      subject: rendered.subject,
      body: rendered.body,
      held_because: rendered.heldBecause,
      state,
      provider: state === 'queued' ? 'graph' : null,
      scheduled_for: state === 'queued' ? r.scheduledFor.toISOString() : null,
      in_reply_to: r.inReplyTo ?? null,
      night_report_id: r.nightReportId ?? null,
      tracked_link: r.trackedLink ?? null,
      drafted_by: r.draftedBy,
    })
    .select('id')
    .single()
  if (row.error) return { state: 'refused', reason: refusalFromError(row.error) }
  return { state: 'done', value: { id: row.data.id, state, heldBecause: rendered.heldBecause } }
}
