import { getImageProps } from 'next/image'

/**
 * THE ONE PLACE `getImageProps` IS REACHED FROM, and it is here because of two
 * rules that pull in opposite directions until you separate the call from its
 * arguments.
 *
 * RULE ONE, the media architecture (CLAUDE.md Tooling, docs/MEDIA-ARCHITECTURE.md
 * §11): `next/image` may not be imported in feature code. The eslint rule's
 * exempt path is `src/components/media/**` and nothing else. The hero preload
 * needs the framework's own srcset arithmetic, so the import has to live in this
 * directory, whoever calls it.
 *
 * RULE TWO, `one-priority-image`: every `priority` grant on the platform is a
 * named LCP candidate on a reviewed list. That guard EXCLUDES this directory,
 * correctly, because every other `priority` line in it is a pass-through (a
 * `priority = false` default or a `priority={priority}` forward) and the decision
 * belongs to the caller. A grant written here would therefore be invisible to it,
 * which is exactly how `priority: true` sat unreviewed in
 * `hero-preload-link.tsx` from the day the preload shipped until 20 September
 * 2026, when moving this code surfaced it for the first time.
 *
 * SO THIS FUNCTION TAKES THE WHOLE OPTION BAG AND DECIDES NOTHING. The import is
 * in the exempt directory; `alt`, `fill`, `priority`, `sizes` and `quality` are
 * written by the caller in `src/lib/images/hero-preload.tsx`, which the guard DOES
 * scan and where that grant is declared. Neither rule is bent and no allowlist
 * entry is hidden.
 *
 * It is deliberately not a component and renders nothing: it resolves the props
 * the hero raster will be rendered with, without rendering it, so a preload can
 * be registered for the same resource key the `<img>` will ask for.
 */
export function heroRasterProps(options: Parameters<typeof getImageProps>[0]) {
  return getImageProps(options)
}
