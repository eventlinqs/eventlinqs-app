import type { NextResponse } from 'next/server'
import { handleList } from '@/lib/api/v1/handlers'

// API1. The route file holds no client, builds no response and makes no
// decision: it names its resource and delegates. See src/lib/api/v1/handlers.ts.
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<NextResponse> {
  return handleList(request, 'events')
}
