import { NextResponse } from 'next/server'
import { listLinkSource } from '@/lib/listings/source-capture'

/**
 * THE CHANNEL LINK: eventlinqs.com.au/list?src=ig, fb, email, qr or ref (the PM's car K lean, item K1: "Channel links ...
 * so organisers who arrive from the pilot messages can be traced"). It opens the listing form at its first field with
 * "Where did you find us?" already answered from the link (src/lib/listings/source-capture.ts); an unknown or missing src
 * opens the form with nothing chosen, never an error. A 307, so the link a person shares stays the short one.
 */
export function GET(request: Request): NextResponse {
  const src = listLinkSource(new URL(request.url).searchParams.get('src'))
  const to = new URL('/submit-event', request.url)
  if (src) to.searchParams.set('src', src)
  to.hash = 'submit'
  return NextResponse.redirect(to, 307)
}
