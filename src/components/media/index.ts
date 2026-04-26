/**
 * Barrel export for the EventLinqs media component library.
 *
 * Feature components import from `@/components/media` and use only these
 * surfaces. Direct `import Image from 'next/image'` is forbidden in feature
 * code — see `eslint.config.mjs` `no-restricted-imports` rule.
 *
 * See docs/MEDIA-ARCHITECTURE.md.
 */
export { HeroMedia } from './HeroMedia'
export type { HeroMediaProps } from './HeroMedia'

export { EventCardMedia } from './EventCardMedia'
export type { EventCardMediaVariant } from './EventCardMedia'

export { CityTileImage } from './CityTileImage'

export { OrganiserAvatar } from './OrganiserAvatar'
export type { OrganiserAvatarSize } from './OrganiserAvatar'

export { CategoryTileImage } from './CategoryTileImage'

export { MEDIA_QUALITY } from './quality'
export type { MediaQualityTier } from './quality'

export { MEDIA_SIZES } from './sizes'
export type { MediaSizeKey } from './sizes'

export { MEDIA_TRANSITIONS, MEDIA_AUDIT_FLAG } from './transitions'
