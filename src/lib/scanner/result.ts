export type ScanDecision = 'admit' | 'reject'

export type ScanResultView = {
  decision: ScanDecision
  label: string
  reason: string
}

// Distinct, human reject reasons for door staff. Keys are the result codes the
// scan_ticket RPC returns. No em or en dashes.
const REJECT_REASONS: Record<string, string> = {
  already_scanned: 'Already used',
  refunded: 'Refunded',
  void: 'Void',
  transferred: 'Transferred away',
  wrong_event: 'Wrong event',
  not_found: 'Not found',
  invalid: 'Not valid',
}

/**
 * How long ago, in the words someone standing at a door would use.
 *
 * FOUNDER RULING 29 August 2026: show the first-admission time. "Already used"
 * on its own starts an argument that nobody at the door can settle, because the
 * person holding the phone cannot tell a double-scan of their own from a ticket
 * that came through two hours ago on somebody else's phone. first_scanned_at is
 * already returned by the RPC and was simply never shown.
 *
 * RELATIVE, not a clock time, and that is the point: "two minutes ago" answers
 * the question being asked, which is whether this is the same person trying
 * again. A timestamp makes the reader do the arithmetic while a queue builds.
 */
export function describeHowLongAgo(iso: string | null | undefined, now: number = Date.now()): string | null {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  const seconds = Math.round((now - then) / 1000)
  if (seconds < 0) return null
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

/**
 * Maps a scan_ticket RPC result code to a door-staff decision and message.
 * Only the literal 'admitted' code admits; every other code, including any
 * unrecognised one, is a safe reject (fail closed - never admit on surprise).
 *
 * `firstScannedAt` is optional so every existing caller keeps working; when it
 * is present and the ticket was already used, the reason carries how long ago.
 */
export function describeScanResult(result: string, firstScannedAt?: string | null): ScanResultView {
  if (result === 'admitted') {
    return { decision: 'admit', label: 'ADMIT', reason: '' }
  }
  const base = REJECT_REASONS[result] ?? 'Not valid'
  if (result === 'already_scanned') {
    const ago = describeHowLongAgo(firstScannedAt)
    if (ago) return { decision: 'reject', label: 'REJECT', reason: `${base} ${ago}` }
  }
  return { decision: 'reject', label: 'REJECT', reason: base }
}
