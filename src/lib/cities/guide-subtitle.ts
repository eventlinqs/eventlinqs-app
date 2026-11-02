/**
 * THE CITY GUIDE'S HERO LINE (Lawal, 2 November 2026, 12:05, round 2 item 4, his words: 'Replace the Geelong hero
 * subtitle with: "Discover live music, festivals, markets, family activities and everything happening in Geelong."';
 * the CONTROLLER's 12:06 (5)(c): 'the other three cities take the same sentence with their own name'). One sentence for
 * every city guide, its name the only change; it replaces the city data's descriptor under the guide's heading.
 */
export function cityGuideSubtitle(cityName: string): string {
  return `Discover live music, festivals, markets, family activities and everything happening in ${cityName}.`
}
