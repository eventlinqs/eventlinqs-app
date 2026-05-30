import { describe, expect, test } from 'vitest'
import ExcelJS from 'exceljs'
import { PDFDocument } from 'pdf-lib'
import { filterAttendees, type AttendeeRow, type OrderReportRow } from '@/lib/reporting/types'
import {
  buildAttendeesCsv,
  buildOrdersCsv,
  buildAttendeesXlsx,
  buildOrdersXlsx,
  buildDoorListPdf,
} from '@/lib/reporting/exporters'

function attendee(over: Partial<AttendeeRow> = {}): AttendeeRow {
  return {
    name: 'John Smith',
    email: 'john@example.com',
    ticketType: 'General Admission',
    ticketCode: 'EL-AAAA-1111',
    orderRef: 'EL-ORDER01',
    purchaseDate: '2026-06-01T10:00:00+00:00',
    checkedIn: false,
    status: 'valid',
    ...over,
  }
}

const sample: AttendeeRow[] = [
  attendee({ name: 'John Smith', email: 'john@example.com', ticketType: 'VIP', checkedIn: true, ticketCode: 'EL-AAAA-1111' }),
  attendee({ name: 'Mary Jones', email: 'mary@test.com', ticketType: 'General Admission', checkedIn: false, ticketCode: 'EL-BBBB-2222' }),
  attendee({ name: 'Ada Okafor', email: 'ada@example.com', ticketType: 'VIP', checkedIn: false, ticketCode: 'EL-CCCC-3333' }),
]

describe('filterAttendees', () => {
  test('search matches name (case-insensitive)', () => {
    expect(filterAttendees(sample, { search: 'mary', ticketType: 'all', checkIn: 'all' })).toHaveLength(1)
  })
  test('search matches email', () => {
    const r = filterAttendees(sample, { search: 'example.com', ticketType: 'all', checkIn: 'all' })
    expect(r.map(a => a.name).sort()).toEqual(['Ada Okafor', 'John Smith'])
  })
  test('ticket type filter is exact', () => {
    expect(filterAttendees(sample, { search: '', ticketType: 'VIP', checkIn: 'all' })).toHaveLength(2)
  })
  test('check-in filters narrow correctly', () => {
    expect(filterAttendees(sample, { search: '', ticketType: 'all', checkIn: 'checked_in' })).toHaveLength(1)
    expect(filterAttendees(sample, { search: '', ticketType: 'all', checkIn: 'not_checked_in' })).toHaveLength(2)
  })
  test('combined filters intersect', () => {
    expect(filterAttendees(sample, { search: 'ada', ticketType: 'VIP', checkIn: 'not_checked_in' })).toHaveLength(1)
  })
})

describe('CSV export', () => {
  test('attendee CSV has header, BOM, and one row per attendee', () => {
    const csv = buildAttendeesCsv(sample)
    expect(csv.charCodeAt(0)).toBe(0xfeff) // UTF-8 BOM
    const lines = csv.replace(/^﻿/, '').split('\r\n')
    expect(lines[0]).toBe('Name,Email,Ticket type,Order ref,Purchase date,Ticket code,Check-in status')
    expect(lines).toHaveLength(1 + sample.length)
    expect(lines[1]).toContain('Checked in')
    expect(lines[2]).toContain('Not checked in')
  })

  test('CSV quotes and escapes commas and quotes in values', () => {
    const csv = buildAttendeesCsv([attendee({ name: 'Smith, "DJ" Jones', ticketType: 'GA' })])
    expect(csv).toContain('"Smith, ""DJ"" Jones"')
  })

  test('orders CSV includes financial columns', () => {
    const orders: OrderReportRow[] = [
      {
        orderRef: 'EL-ORDER01',
        buyerName: 'John Smith',
        buyerEmail: 'john@example.com',
        purchaseDate: '2026-06-01T10:00:00+00:00',
        status: 'confirmed',
        ticketCount: 2,
        currency: 'aud',
        subtotalCents: 13000,
        discountCents: 0,
        platformFeeCents: 376,
        processingFeeCents: 408,
        totalCents: 13784,
      },
    ]
    const csv = buildOrdersCsv(orders).replace(/^﻿/, '')
    const lines = csv.split('\r\n')
    expect(lines[0]).toContain('Total')
    expect(lines[1]).toContain('AUD')
    expect(lines[1]).toContain('137.84')
  })
})

describe('XLSX export', () => {
  test('attendees XLSX is a valid workbook that round-trips', async () => {
    const buf = await buildAttendeesXlsx(sample)
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK') // zip/OOXML magic
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const ws = wb.getWorksheet('Attendees')
    expect(ws).toBeTruthy()
    expect(ws!.getRow(1).getCell(1).value).toBe('Name')
    expect(ws!.rowCount).toBe(sample.length + 1)
    expect(ws!.getRow(2).getCell(1).value).toBe('John Smith')
  })

  test('orders XLSX writes numeric money cells', async () => {
    const buf = await buildOrdersXlsx([
      {
        orderRef: 'EL-ORDER01',
        buyerName: 'John Smith',
        buyerEmail: 'john@example.com',
        purchaseDate: '2026-06-01T10:00:00+00:00',
        status: 'confirmed',
        ticketCount: 2,
        currency: 'aud',
        subtotalCents: 13000,
        discountCents: 0,
        platformFeeCents: 376,
        processingFeeCents: 408,
        totalCents: 13784,
      },
    ])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const ws = wb.getWorksheet('Orders')!
    // Total column is the 12th; value stored as a number (137.84), not a string.
    expect(ws.getRow(2).getCell(12).value).toBeCloseTo(137.84, 2)
  })
})

describe('PDF door list', () => {
  const meta = {
    eventTitle: 'Lagos to Sydney After Party',
    eventDateLabel: 'Fri, 5 June 2026, 11:25 pm AEST',
    organisationName: 'Owambe Sydney',
    generatedLabel: 'Generated by EventLinqs. You own this data.',
  }

  test('produces a valid PDF file', async () => {
    const bytes = await buildDoorListPdf(sample, meta)
    expect(Buffer.from(bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(800)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
  })

  test('paginates across pages for a large list', async () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      attendee({ name: `Guest ${i}`, ticketCode: `EL-CODE-${i}` })
    )
    const bytes = await buildDoorListPdf(many, meta)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThan(1)
  })

  test('renders an empty-state door list without throwing', async () => {
    const bytes = await buildDoorListPdf([], meta)
    expect(Buffer.from(bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-')
  })
})
