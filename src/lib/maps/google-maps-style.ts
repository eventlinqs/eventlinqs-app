/**
 * Snazzymaps-inspired minimal muted-grey style. Matches the
 * Ticketmaster/DICE aesthetic: clean land, major roads only, water in
 * soft blue, POIs suppressed. Shared between the /events cluster map and
 * the single-venue map on /events/[slug] so both have identical styling.
 *
 * NO LONGER PASSED TO A MAP, AND DELIBERATELY KEPT. Since the
 * AdvancedMarkerElement migration every map is built with a Map ID, and Google
 * (MapOptions.styles reference) states: "This feature is not available when
 * using a map ID, or when using vector maps (use cloud-based maps styling
 * instead)." Passing it now would be silently ignored, which reads as applied
 * and is worse than not passing it.
 *
 * This array is therefore the SOURCE OF TRUTH for the cloud style that must
 * live on the Map ID. Regenerate the import JSON with:
 *
 *   node scripts/verify/print-map-style.mjs
 *
 * and paste it into Google Cloud console, Map Styles, Import JSON. If the two
 * ever diverge, this file wins and the cloud style is stale.
 */
export const EVENTLINQS_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#f5f4ef' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4a4a4a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#d6d3cc' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#6b6b6b' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#6b6b6b' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e2e4dc' }, { visibility: 'on' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.arterial', elementType: 'labels', stylers: [{ visibility: 'simplified' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e9e7df' }] },
  { featureType: 'road.highway', elementType: 'labels', stylers: [{ visibility: 'simplified' }] },
  { featureType: 'road.local', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#cde3e6' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#7a9ca0' }] },
]
