/**
 * Snazzymaps-inspired minimal muted-grey style. Matches the
 * Ticketmaster/DICE aesthetic: clean land, major roads only, water in
 * soft blue, POIs suppressed. Shared between the /events cluster map and
 * the single-venue map on /events/[slug] so both have identical styling.
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
