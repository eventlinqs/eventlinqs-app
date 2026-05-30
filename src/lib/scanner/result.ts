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
 * Maps a scan_ticket RPC result code to a door-staff decision and message.
 * Only the literal 'admitted' code admits; every other code, including any
 * unrecognised one, is a safe reject (fail closed - never admit on surprise).
 */
export function describeScanResult(result: string): ScanResultView {
  if (result === 'admitted') {
    return { decision: 'admit', label: 'ADMIT', reason: '' }
  }
  return {
    decision: 'reject',
    label: 'REJECT',
    reason: REJECT_REASONS[result] ?? 'Not valid',
  }
}
