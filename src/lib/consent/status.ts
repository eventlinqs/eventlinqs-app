import { normaliseConsentEmail } from './wording'

/**
 * Pure consent-status logic (client-safe, unit-tested). Turns the raw consent
 * rows for an organisation into a per-email lookup the attendee export uses to
 * mark who may lawfully be emailed. A withdrawn row is honoured: it reads as not
 * consented, even though the row still exists for the audit trail.
 */

export type ConsentRow = {
  email: string
  status: string
  unsubscribe_token: string
}

export type ConsentState = {
  consented: boolean
  unsubscribeToken: string
}

export function buildConsentIndex(rows: ConsentRow[]): Map<string, ConsentState> {
  const index = new Map<string, ConsentState>()
  for (const row of rows) {
    index.set(normaliseConsentEmail(row.email), {
      consented: row.status === 'granted',
      unsubscribeToken: row.unsubscribe_token,
    })
  }
  return index
}

/** True only when a granted, non-withdrawn consent exists for this email. */
export function isEmailConsented(index: Map<string, ConsentState>, email: string): boolean {
  return index.get(normaliseConsentEmail(email))?.consented ?? false
}
