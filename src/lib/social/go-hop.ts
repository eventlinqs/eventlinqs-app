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

/**
 * A PIECE'S OWN PAGE (the PM's 22:50 of 28 November 2026, fix (a)): a link to /ig names its piece, /ig?piece=<its id>,
 * so the visitor and the publish gate meet exactly that piece's nights (src/lib/growth/ig.ts readIgPiecePage), never the
 * profile's list, which lists a night only while its slot is listed and is cached five minutes (the Melbourne weekend
 * piece c6bdc9da, held twice on 28 November). The id goes first and every tag is kept; a link that already names a
 * piece, any other page and anything that is not an address are returned as they are. Pure.
 */
export function ownPageLink(link: string, pieceId: string): string {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return link
  }
  if (url.pathname !== '/ig' || url.searchParams.has('piece')) return link
  if (!/^[0-9a-f-]{36}$/i.test(pieceId)) throw new Error(`not a piece id: ${pieceId}`)
  const tags = url.search.replace(/^\?/, '')
  return `${url.origin}/ig?piece=${pieceId.toLowerCase()}${tags ? `&${tags}` : ''}${url.hash}`
}

/** Every string inside a value, with the mark replaced by the piece's id (caption and both networks' versions). */
export function withPieceId<T>(value: T, pieceId: string): T {
  const text = JSON.stringify(value)
  if (text === undefined || !text.includes(PIECE_MARK)) return value
  if (!/^[0-9a-f-]{36}$/i.test(pieceId)) throw new Error(`not a piece id: ${pieceId}`)
  return JSON.parse(text.split(PIECE_MARK).join(pieceId)) as T
}
