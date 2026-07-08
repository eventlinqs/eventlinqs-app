/**
 * One formatter for the seat line shown everywhere a seated ticket appears
 * (ticket views, order confirmation, email, door scan), so "Stalls Row A
 * Seat 12" reads identically across every surface. Tables read naturally
 * because the table label is the row label: "Gala floor Table 1 Seat 3"
 * renders as "Gala floor, Table 1, Seat 3" without a Row prefix.
 */
export interface SeatParts {
  sectionName?: string | null
  rowLabel: string
  seatNumber: string
}

export function formatSeatLabel({ sectionName, rowLabel, seatNumber }: SeatParts): string {
  const parts: string[] = []
  if (sectionName) parts.push(sectionName)
  if (rowLabel) {
    parts.push(/^table/i.test(rowLabel) ? rowLabel : `Row ${rowLabel}`)
  }
  parts.push(`Seat ${seatNumber}`)
  return parts.join(', ')
}
