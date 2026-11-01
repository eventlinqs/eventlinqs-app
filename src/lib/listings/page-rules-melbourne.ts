import { eventsFromHtml } from './collect'
import type { PageRule } from './page-rules'

/**
 * MELBOURNE'S PAGE RULES (WINDOW 2, 1 November 2026, the CONTROLLER's 16:41: Melbourne sources on WINDOW 6's framework).
 * The registry and each source's tested method: C:\dev\EVIDENCE\CITY-FIRST-1NOV\melbourne-source-registry.md.
 *
 * COMEDY REPUBLIC (comedyrepublic.com.au, 231 Bourke Street). Read 1 November: robots.txt disallows only /wp-admin/; its
 * terms (/terms/) carry no clause on reuse or automated access; its list pages carry no Event data, but each show page
 * under /shows/ carries one schema.org Event per performance (start and end with offset, the room and its street, the
 * price, the performance's own booking link). Its own sitemap (/wp-sitemap-posts-show-1.xml) lists the show pages. So
 * the rule is the collector's own JSON-LD reader on the pages the sitemap names: no page-specific parsing to go stale.
 */
export const comedyRepublic: PageRule = {
  host: 'comedyrepublic.com.au',
  eventPath: /^\/shows\/[^/]+\/?$/,
  read: (html, pageUrl) => eventsFromHtml(html, pageUrl),
}

export const MELBOURNE_PAGE_RULES: readonly PageRule[] = [comedyRepublic]
