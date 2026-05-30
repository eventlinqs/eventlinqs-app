/**
 * Pure, client-safe reporting types and filter logic. No server-only imports
 * here (no supabase client), so client components like the attendee table can
 * import it without pulling server code into the browser bundle.
 */

export interface AttendeeRow {
  name: string
  email: string
  ticketType: string
  ticketCode: string
  orderRef: string
  purchaseDate: string // order created_at, ISO
  checkedIn: boolean
  status: string // raw ticket status
}

export interface OrderReportRow {
  orderRef: string
  buyerName: string
  buyerEmail: string
  purchaseDate: string // ISO
  status: string
  ticketCount: number
  currency: string
  subtotalCents: number
  discountCents: number
  platformFeeCents: number
  processingFeeCents: number
  totalCents: number
}

export interface AttendeeFilters {
  search: string
  ticketType: string // 'all' or an exact tier name
  checkIn: 'all' | 'checked_in' | 'not_checked_in'
}

/**
 * Pure filter shared by the table UI and any server-side use. Search matches
 * name or email (case-insensitive); ticketType is an exact match; checkIn
 * narrows by check-in state.
 */
export function filterAttendees(rows: AttendeeRow[], filters: AttendeeFilters): AttendeeRow[] {
  const q = filters.search.trim().toLowerCase()
  return rows.filter(r => {
    if (q && !r.name.toLowerCase().includes(q) && !r.email.toLowerCase().includes(q)) return false
    if (filters.ticketType !== 'all' && r.ticketType !== filters.ticketType) return false
    if (filters.checkIn === 'checked_in' && !r.checkedIn) return false
    if (filters.checkIn === 'not_checked_in' && r.checkedIn) return false
    return true
  })
}
