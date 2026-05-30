import { NextRequest, NextResponse } from 'next/server'
import { getOrganiserEvent, fetchEventOrdersReport } from '@/lib/reporting/attendees'
import { buildOrdersCsv, buildOrdersXlsx } from '@/lib/reporting/exporters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

/**
 * Orders report export (financial and buyer transaction detail), CSV and
 * XLSX. Ownership-gated first so one organiser can never export another's
 * orders. Fee columns come straight off the order rows, preserving the
 * historical fee structure per order.
 */
export async function GET(request: NextRequest, { params }: Props) {
  const { id } = await params
  const format = (request.nextUrl.searchParams.get('format') ?? 'csv').toLowerCase()

  const event = await getOrganiserEvent(id)
  if (!event) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const orders = await fetchEventOrdersReport(id)
  const datePart = event.startDate.slice(0, 10)
  const base = `${event.slug || 'event'}-orders-${datePart}`

  if (format === 'csv') {
    return new NextResponse(buildOrdersCsv(orders), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${base}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  if (format === 'xlsx') {
    const buffer = await buildOrdersXlsx(orders)
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${base}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  return NextResponse.json({ error: 'Unsupported format' }, { status: 400 })
}
