/**
 * THE REFERER REFUSAL IS RECOGNISED WHATEVER SHAPE GOOGLE THROWS IT IN.
 *
 * On 4 September 2026 the desktop drive of the venue finder on a local server
 * showed "Venue search did not answer" instead of the one sentence that names
 * the blocked origin. The Maps JS library had thrown its own RpcError with the
 * message "Requests from referer http://localhost:3311/ are blocked." and the
 * classifier only read the message off an `instanceof Error`, which Google's
 * class is not. So the organiser was told the search had not answered when it
 * had answered, precisely, with the reason. These pin the classifier to the
 * message, not to the class.
 */
import { describe, it, expect } from 'vitest'
import { isRefererBlocked, PlacesUnavailable, MIN_QUERY_LENGTH, VENUE_REGION_CODES, PLACE_FIELDS } from '@/lib/maps/places-autocomplete'

/** The shape the Maps JS library threw on 4 September 2026: not an Error subclass. */
class RpcError {
  readonly message: string
  readonly code = 403
  constructor(message: string) {
    this.message = message
  }
}

describe('isRefererBlocked', () => {
  it('recognises the refusal when it arrives as a real Error', () => {
    expect(isRefererBlocked(new Error('Requests from referer http://localhost:3311/ are blocked.'))).toBe(true)
  })

  it("recognises the refusal when it arrives as Google's own RpcError, which is not an Error", () => {
    const err: unknown = new RpcError('Requests from referer http://localhost:3311/ are blocked.')
    expect(err instanceof Error).toBe(false)
    expect(isRefererBlocked(err)).toBe(true)
  })

  it('recognises the refusal when it arrives as a bare string', () => {
    expect(isRefererBlocked('Requests from referer https://preview.vercel.app/ are blocked.')).toBe(true)
  })

  it('does not mistake an unrelated failure for the referer refusal', () => {
    expect(isRefererBlocked(new Error('Network request failed'))).toBe(false)
    expect(isRefererBlocked(new RpcError('The provided API key is invalid.'))).toBe(false)
    expect(isRefererBlocked(null)).toBe(false)
    expect(isRefererBlocked(undefined)).toBe(false)
    expect(isRefererBlocked({})).toBe(false)
  })
})

describe('the finder contract with Google, pinned', () => {
  it('names each unavailable reason so the finder can say the right sentence', () => {
    expect(new PlacesUnavailable('this origin is not allowed by the browser key').reason).toBe('this origin is not allowed by the browser key')
    expect(new PlacesUnavailable('no browser key in this build')).toBeInstanceOf(Error)
  })

  it('searches Australia only, asks for the five billable fields the pick needs, and waits for three characters', () => {
    expect(VENUE_REGION_CODES).toEqual(['au'])
    expect(PLACE_FIELDS).toEqual(['id', 'displayName', 'formattedAddress', 'location', 'addressComponents'])
    expect(MIN_QUERY_LENGTH).toBe(3)
  })
})
