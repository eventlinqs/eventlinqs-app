/**
 * A STAND-IN FOR GOOGLE'S MAPS JAVASCRIPT API, for the venue-finder UI drive.
 *
 * WHY IT EXISTS, and what it is NOT. The browser key is referer restricted to
 * www.eventlinqs.com.au (proven 4 September 2026: from that origin the Places
 * library answers; from localhost and from a Vercel preview origin it answers
 * "Requests from referer ... are blocked", and a Referer header override in the
 * harness does not get past it). This build never writes to production, so a
 * drive on a local server cannot reach the real Places library. The finder's
 * OWN behaviour still has to be driven at 390, 768 and 1440: the listbox, the
 * keyboard, the fill, the preview, the save, the city map. This script is what
 * the harness serves in place of https://maps.googleapis.com/maps/api/js so
 * that drive can happen.
 *
 * The suggestion and the place it returns are the REAL answers Google gave for
 * "Forum Melbourne" from the allowed origin (C:\dev\EVIDENCE\A3-places-js-probe-
 * 20260904.txt), so the fields the pick fills are what production fills.
 *
 * It is NOT the driven proof of the pick against Google. That proof waits on
 * the founder adding the local and preview referers to the browser key, and is
 * recorded as such in the ledger. Every run that uses this file says so in its
 * log line ("STUBBED PLACES").
 */
export const MAPS_JS_STUB = `
(() => {
  const FORUM = {
    id: 'ChIJ-stub-forum-melbourne',
    displayName: 'Forum Melbourne',
    formattedAddress: '154 Flinders St, Melbourne VIC 3000, Australia',
    lat: -37.8166268,
    lng: 144.9695761,
    addressComponents: [
      { longText: '154', shortText: '154', types: ['street_number'] },
      { longText: 'Flinders Street', shortText: 'Flinders St', types: ['route'] },
      { longText: 'Melbourne', shortText: 'Melbourne', types: ['locality', 'political'] },
      { longText: 'City of Melbourne', shortText: 'Melbourne', types: ['administrative_area_level_2', 'political'] },
      { longText: 'Victoria', shortText: 'VIC', types: ['administrative_area_level_1', 'political'] },
      { longText: 'Australia', shortText: 'AU', types: ['country', 'political'] },
      { longText: '3000', shortText: '3000', types: ['postal_code'] },
    ],
  }
  const NIGHTCAT = {
    id: 'ChIJ-stub-night-cat',
    displayName: 'The Night Cat',
    formattedAddress: '137 Johnston St, Fitzroy VIC 3065, Australia',
    lat: -37.7996,
    lng: 144.9784,
    addressComponents: [
      { longText: '137', shortText: '137', types: ['street_number'] },
      { longText: 'Johnston Street', shortText: 'Johnston St', types: ['route'] },
      { longText: 'Fitzroy', shortText: 'Fitzroy', types: ['locality', 'political'] },
      { longText: 'Victoria', shortText: 'VIC', types: ['administrative_area_level_1', 'political'] },
      { longText: 'Australia', shortText: 'AU', types: ['country', 'political'] },
      { longText: '3065', shortText: '3065', types: ['postal_code'] },
    ],
  }
  const PLACES = [FORUM, NIGHTCAT]
  const latLng = (lat, lng) => ({ lat: () => lat, lng: () => lng })
  class Place {
    constructor(p) { this._p = p; this.id = p.id }
    async fetchFields() {
      this.displayName = this._p.displayName
      this.formattedAddress = this._p.formattedAddress
      this.location = latLng(this._p.lat, this._p.lng)
      this.addressComponents = this._p.addressComponents
      return { place: this }
    }
  }
  class AutocompleteSessionToken {}
  class AutocompleteSuggestion {
    static async fetchAutocompleteSuggestions(req) {
      const q = String(req.input || '').toLowerCase()
      const hits = PLACES.filter((p) => p.displayName.toLowerCase().includes(q) || p.formattedAddress.toLowerCase().includes(q))
      return {
        suggestions: hits.map((p) => ({
          placePrediction: {
            placeId: p.id,
            text: { text: p.displayName + ', ' + p.formattedAddress },
            mainText: { text: p.displayName },
            secondaryText: { text: p.formattedAddress },
            toPlace: () => new Place(p),
          },
        })),
      }
    }
  }
  class Map {
    constructor(el, opts) {
      this.el = el
      this.opts = opts
      el.setAttribute('data-stub-map', 'painted')
      el.style.background = 'linear-gradient(135deg, #EFEDE8, #D9D9D6)'
    }
    setCenter() {}
    setZoom() {}
    panTo() {}
    addListener() { return { remove() {} } }
    fitBounds() {}
  }
  class AdvancedMarkerElement {
    constructor(opts) { this.position = opts.position; this.map = opts.map; if (opts.content && opts.map?.el) opts.map.el.appendChild(opts.content) }
    addListener() { return { remove() {} } }
  }
  class InfoWindow { open() {} close() {} setContent() {} addListener() { return { remove() {} } } }
  class Geocoder { async geocode() { return { results: [] } } }
  const libs = {
    places: { AutocompleteSessionToken, AutocompleteSuggestion, Place },
    maps: { Map, InfoWindow, event: { addListener() { return { remove() {} } } } },
    marker: { AdvancedMarkerElement, PinElement: class {} },
    geocoding: { Geocoder },
    core: { LatLng: function (lat, lng) { return latLng(lat, lng) }, LatLngBounds: class { extend() { return this } } },
  }
  window.google = window.google || {}
  window.google.maps = Object.assign(window.google.maps || {}, {
    importLibrary: async (name) => libs[name] || {},
    LatLng: function (lat, lng) { return latLng(lat, lng) },
    LatLngBounds: class { extend() { return this } },
    Map, InfoWindow, Geocoder,
    marker: { AdvancedMarkerElement },
    places: libs.places,
    event: libs.maps.event,
    __stub: 'STUBBED PLACES',
  })
  // The loader names a DOTTED callback (google.maps.__ib__) and stores the
  // bootstrap's resolve there; Google's script resolves the path and calls it.
  const cb = new URL(document.currentScript.src).searchParams.get('callback')
  const fn = cb ? cb.split('.').reduce((o, k) => (o == null ? undefined : o[k]), window) : undefined
  if (typeof fn === 'function') fn()
})()
`
