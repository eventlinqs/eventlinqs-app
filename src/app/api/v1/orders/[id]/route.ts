import type { NextResponse } from 'next/server'
import { handleItem } from '@/lib/api/v1/handlers'

// API1. One row by id, or 404 whether it does not exist or is not yours.
// See src/lib/api/v1/handlers.ts.
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params
  return handleItem(request, 'orders', id)
}
