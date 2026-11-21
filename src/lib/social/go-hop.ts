/**
 * A LIFECYCLE POST'S LINK GOES THROUGH /go, SO EVERY PRESS IS COUNTED (the PM's 16:30 and 16:40 of 21 November 2026, AV
 * (e); the cause found at 12:12: every post linked straight to the event page, so go_presses read 0 ever). /go/<piece>
 * counts the press (go_presses) and lands the visitor on the piece's own stored link, the event page with its tags
 * (src/app/go/[piece]/route.ts, src/lib/growth/go-math.ts). A piece's id is made when it is written, after it is drawn,
 * so the planner writes PIECE_MARK where the id goes and the one writer of a revision (store.ts revisionRow) puts the
 * piece's own id in its place. Pure.
 */
export const PIECE_MARK = 'PIECE_ID_HERE'

/** The counted hop for a piece on one network, with the mark where its id goes. */
export function goHop(origin: string, platform: 'instagram' | 'facebook'): string {
  return `${origin}/go/${PIECE_MARK}?via=${platform}`
}

/** Every string inside a value, with the mark replaced by the piece's id (caption and both networks' versions). */
export function withPieceId<T>(value: T, pieceId: string): T {
  const text = JSON.stringify(value)
  if (text === undefined || !text.includes(PIECE_MARK)) return value
  if (!/^[0-9a-f-]{36}$/i.test(pieceId)) throw new Error(`not a piece id: ${pieceId}`)
  return JSON.parse(text.split(PIECE_MARK).join(pieceId)) as T
}
