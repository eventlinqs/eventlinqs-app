import ExcelJS from 'exceljs'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { AttendeeRow, OrderReportRow } from './types'

/**
 * Export builders for the organiser attendee and orders reports. Pure
 * functions over already-fetched, already-ownership-checked rows, so they
 * are unit-testable without a database and reused by the download routes.
 *
 * CSV is hand-built (RFC 4180 quoting, BOM for Excel UTF-8). XLSX uses
 * exceljs. The PDF door list uses pdf-lib with a manual layout.
 */

export function formatCurrency(cents: number, currency: string): string {
  return `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`
}

// Brand colours for the PDF, mirroring the design tokens (PDF cannot read CSS
// custom properties): ink-900 navy, gold-800 accent (AA on white), ink-600
// body, ink-200 divider, ink-100 row shade.
const PDF_INK_900 = rgb(0.039, 0.086, 0.157)
const PDF_INK_600 = rgb(0.29, 0.29, 0.29)
const PDF_INK_200 = rgb(0.851, 0.851, 0.839)
const PDF_INK_100 = rgb(0.937, 0.929, 0.91)
const PDF_GOLD_800 = rgb(0.435, 0.329, 0.035)

// ---- CSV -------------------------------------------------------------------

interface Column<T> {
  header: string
  value: (row: T) => string
}

function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function toCsv<T>(columns: Column<T>[], rows: T[]): string {
  const head = columns.map(c => csvCell(c.header)).join(',')
  const body = rows.map(r => columns.map(c => csvCell(c.value(r))).join(',')).join('\r\n')
  // Leading BOM so Excel opens UTF-8 (accents, names) correctly.
  return `﻿${head}\r\n${body}`
}

const attendeeColumns: Column<AttendeeRow>[] = [
  { header: 'Name', value: r => r.name },
  { header: 'Email', value: r => r.email },
  { header: 'Ticket type', value: r => r.ticketType },
  { header: 'Order ref', value: r => r.orderRef },
  { header: 'Purchase date', value: r => r.purchaseDate },
  { header: 'Ticket code', value: r => r.ticketCode },
  { header: 'Check-in status', value: r => (r.checkedIn ? 'Checked in' : 'Not checked in') },
  // Marketing consent (Spam Act): only email attendees marked Yes, and include
  // their unsubscribe link in any marketing you send.
  { header: 'Marketing consent', value: r => (r.marketingConsent ? 'Yes' : 'No') },
  { header: 'Unsubscribe link', value: r => r.unsubscribeUrl ?? '' },
]

const orderColumns: Column<OrderReportRow>[] = [
  { header: 'Order ref', value: r => r.orderRef },
  { header: 'Buyer name', value: r => r.buyerName },
  { header: 'Buyer email', value: r => r.buyerEmail },
  { header: 'Purchase date', value: r => r.purchaseDate },
  { header: 'Status', value: r => r.status },
  { header: 'Tickets', value: r => String(r.ticketCount) },
  { header: 'Currency', value: r => r.currency.toUpperCase() },
  { header: 'Subtotal', value: r => (r.subtotalCents / 100).toFixed(2) },
  { header: 'Discount', value: r => (r.discountCents / 100).toFixed(2) },
  { header: 'Platform fee', value: r => (r.platformFeeCents / 100).toFixed(2) },
  { header: 'Processing fee', value: r => (r.processingFeeCents / 100).toFixed(2) },
  { header: 'Total', value: r => (r.totalCents / 100).toFixed(2) },
]

export function buildAttendeesCsv(rows: AttendeeRow[]): string {
  return toCsv(attendeeColumns, rows)
}

export function buildOrdersCsv(rows: OrderReportRow[]): string {
  return toCsv(orderColumns, rows)
}

// ---- XLSX ------------------------------------------------------------------

async function buildWorkbook<T>(
  sheetName: string,
  columns: { header: string; value: (row: T) => string | number; width: number }[],
  rows: T[]
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'EventLinqs'
  const ws = wb.addWorksheet(sheetName)
  ws.columns = columns.map(c => ({ header: c.header, key: c.header, width: c.width }))
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A1628' } }
  ws.getRow(1).height = 20
  for (const row of rows) {
    ws.addRow(columns.map(c => c.value(row)))
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }
  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

export function buildAttendeesXlsx(rows: AttendeeRow[]): Promise<Buffer> {
  return buildWorkbook<AttendeeRow>(
    'Attendees',
    [
      { header: 'Name', value: r => r.name, width: 28 },
      { header: 'Email', value: r => r.email, width: 32 },
      { header: 'Ticket type', value: r => r.ticketType, width: 22 },
      { header: 'Order ref', value: r => r.orderRef, width: 18 },
      { header: 'Purchase date', value: r => r.purchaseDate, width: 24 },
      { header: 'Ticket code', value: r => r.ticketCode, width: 18 },
      { header: 'Check-in status', value: r => (r.checkedIn ? 'Checked in' : 'Not checked in'), width: 16 },
      { header: 'Marketing consent', value: r => (r.marketingConsent ? 'Yes' : 'No'), width: 18 },
      { header: 'Unsubscribe link', value: r => r.unsubscribeUrl ?? '', width: 44 },
    ],
    rows
  )
}

export function buildOrdersXlsx(rows: OrderReportRow[]): Promise<Buffer> {
  return buildWorkbook<OrderReportRow>(
    'Orders',
    [
      { header: 'Order ref', value: r => r.orderRef, width: 18 },
      { header: 'Buyer name', value: r => r.buyerName, width: 26 },
      { header: 'Buyer email', value: r => r.buyerEmail, width: 32 },
      { header: 'Purchase date', value: r => r.purchaseDate, width: 24 },
      { header: 'Status', value: r => r.status, width: 18 },
      { header: 'Tickets', value: r => r.ticketCount, width: 10 },
      { header: 'Currency', value: r => r.currency.toUpperCase(), width: 10 },
      { header: 'Subtotal', value: r => r.subtotalCents / 100, width: 12 },
      { header: 'Discount', value: r => r.discountCents / 100, width: 12 },
      { header: 'Platform fee', value: r => r.platformFeeCents / 100, width: 14 },
      { header: 'Processing fee', value: r => r.processingFeeCents / 100, width: 14 },
      { header: 'Total', value: r => r.totalCents / 100, width: 12 },
    ],
    rows
  )
}

// ---- PDF door list ---------------------------------------------------------

export interface DoorListMeta {
  eventTitle: string
  eventDateLabel: string
  organisationName: string
  generatedLabel: string
}

/**
 * A4 portrait door list: a simplified, printable check-in sheet for event-day
 * hosts. Columns: row number, attendee name, ticket type, and an empty box to
 * tick on arrival. Paginates automatically with a repeated header.
 */
export async function buildDoorListPdf(rows: AttendeeRow[], meta: DoorListMeta): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`${meta.eventTitle} door list`)
  doc.setCreator('EventLinqs')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const PAGE_W = 595.28
  const PAGE_H = 841.89
  const MARGIN = 48
  const rowH = 26
  const tableW = PAGE_W - MARGIN * 2
  // Columns: number | name | ticket type | check box
  const colNum = MARGIN
  const colName = MARGIN + 36
  const colType = MARGIN + 300
  const colBox = PAGE_W - MARGIN - 22

  const total = rows.length
  let page = doc.addPage([PAGE_W, PAGE_H])
  let y = 0

  const drawPageHeader = (): number => {
    let top = PAGE_H - MARGIN
    page.drawText('EVENTLINQS', { x: MARGIN, y: top, size: 10, font: bold, color: PDF_GOLD_800 })
    page.drawText('Door list', { x: PAGE_W - MARGIN - bold.widthOfTextAtSize('Door list', 10), y: top, size: 10, font: bold, color: PDF_INK_600 })
    top -= 26
    page.drawText(meta.eventTitle, { x: MARGIN, y: top, size: 18, font: bold, color: PDF_INK_900 })
    top -= 18
    page.drawText(`${meta.eventDateLabel}  |  ${meta.organisationName}`, { x: MARGIN, y: top, size: 10, font, color: PDF_INK_600 })
    top -= 14
    page.drawText(`${total} ${total === 1 ? 'attendee' : 'attendees'}`, { x: MARGIN, y: top, size: 10, font, color: PDF_INK_600 })
    top -= 22
    // Column header row
    page.drawText('#', { x: colNum, y: top, size: 9, font: bold, color: PDF_INK_600 })
    page.drawText('NAME', { x: colName, y: top, size: 9, font: bold, color: PDF_INK_600 })
    page.drawText('TICKET TYPE', { x: colType, y: top, size: 9, font: bold, color: PDF_INK_600 })
    page.drawText('IN', { x: colBox - 2, y: top, size: 9, font: bold, color: PDF_INK_600 })
    top -= 8
    page.drawLine({ start: { x: MARGIN, y: top }, end: { x: MARGIN + tableW, y: top }, thickness: 1, color: PDF_INK_900 })
    return top - rowH + 6
  }

  const truncate = (text: string, f: typeof font, size: number, maxW: number): string => {
    if (f.widthOfTextAtSize(text, size) <= maxW) return text
    let t = text
    while (t.length > 1 && f.widthOfTextAtSize(`${t}...`, size) > maxW) t = t.slice(0, -1)
    return `${t}...`
  }

  y = drawPageHeader()

  if (total === 0) {
    page.drawText('No attendees yet. Tickets will appear here once people buy.', {
      x: MARGIN,
      y: y,
      size: 11,
      font,
      color: PDF_INK_600,
    })
  }

  rows.forEach((r, i) => {
    if (y < MARGIN + rowH) {
      page = doc.addPage([PAGE_W, PAGE_H])
      y = drawPageHeader()
    }
    if (i % 2 === 1) {
      page.drawRectangle({ x: MARGIN, y: y - 7, width: tableW, height: rowH - 4, color: PDF_INK_100 })
    }
    page.drawText(String(i + 1), { x: colNum, y, size: 10, font, color: PDF_INK_600 })
    page.drawText(truncate(r.name, font, 11, colType - colName - 10), { x: colName, y, size: 11, font: bold, color: PDF_INK_900 })
    page.drawText(truncate(r.ticketType, font, 10, colBox - colType - 14), { x: colType, y, size: 10, font, color: PDF_INK_600 })
    // Check-in box (pre-ticked if already scanned)
    page.drawRectangle({ x: colBox, y: y - 3, width: 14, height: 14, borderColor: PDF_INK_900, borderWidth: 1.2, color: rgb(1, 1, 1) })
    if (r.checkedIn) {
      page.drawText('X', { x: colBox + 3, y: y - 1, size: 11, font: bold, color: PDF_INK_900 })
    }
    page.drawLine({ start: { x: MARGIN, y: y - 9 }, end: { x: MARGIN + tableW, y: y - 9 }, thickness: 0.5, color: PDF_INK_200 })
    y -= rowH
  })

  // Footer on the last page
  page.drawText(meta.generatedLabel, { x: MARGIN, y: MARGIN - 18, size: 8, font, color: PDF_INK_600 })

  return doc.save()
}
