/**
 * THE ONE LINE THAT PICKS THE HOME (SITE_LOOK.marketplaceHome, src/lib/home/site-look.ts; law 13).
 *
 * A re-export, not a branch, for the reason site-header-chosen.ts gives: First Load JS counts every client module a
 * route's server graph imports, rendered or not, and the guide home carries the city guide's whole client component.
 * tests/unit/home/marketplace-home.test.tsx fails when this line and the flag disagree. To bring the guide home back:
 * set the flag false and export CityGuideHome from './city-guide-home' here.
 */
export { MarketplaceHome as ChosenHome } from './marketplace-home'
