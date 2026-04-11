# Benchmark: PWA & App Experience

## Overview

DICE is the gold standard for mobile-first ticketing app experience. Ticketmaster has a native app but its web experience is inferior. Eventbrite's app is functional but not distinctive. EventLinqs will use a Progressive Web App (PWA) approach: a single codebase that works as a website AND installs as an app on iOS and Android, with offline ticket access, push notifications, and wallet integration.

This document is the reference for EventLinqs' future PWA conversion milestone (tracked polish list item).

---

## DICE App Experience

### Installation

DICE is primarily an installable app (iOS App Store, Google Play). It also has a web version but directs users to install the app.

**Key app capabilities:**
- Tickets stored locally on device — viewable offline
- Push notifications for events you're tracking (artist announcements, on-sale times)
- Biometric authentication — Face ID / fingerprint to unlock tickets
- "Lock" screen widget (iOS) — shows your next upcoming event ticket on lock screen
- Apple Wallet / Google Wallet integration — ticket lives in native wallet app

### DICE Anti-Scalping Features (visible in app UX)

- Tickets linked to phone number — cannot be transferred to another device without organiser permission
- Barcode only becomes visible 24 hours before the event ("unlocking" animation)
- Resale happens only through DICE marketplace at capped price
- "DICE Friend" transfer — gift to a friend who also has DICE app (they must accept)

### DICE Ticket Display UX

- Ticket is a "card" with event artwork on the front
- Flip animation reveals barcode on back
- Brightness maximizes when barcode is visible (auto-brightness for scanner readability)
- Slight parallax on the card as phone tilts (gyroscope-driven)
- Passcode/biometric required to flip card (anti-screenshot)

---

## Ticketmaster App

- Native iOS and Android apps
- Tickets stored in app — offline accessible
- Push notifications: "Your event starts in 3 hours", "Parking info for tonight"
- Ticket transfer to other Ticketmaster users
- Mobile ticket display: barcode shown with brightness up, screen auto-lock disabled while barcode visible
- Apple Wallet pass: tap "Add to Apple Wallet" → generates .pkpass file

---

## Eventbrite App

- Less sophisticated than DICE or Ticketmaster
- Primarily a discovery app, not a ticket wallet
- Tickets link to PDF download
- Basic push notifications

---

## PWA Technical Implementation for EventLinqs

### Web App Manifest (`/public/manifest.json`)

```json
{
  "name": "EventLinqs",
  "short_name": "EventLinqs",
  "description": "Discover and buy tickets to events worldwide",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#FAFAFA",
  "theme_color": "#1A1A2E",
  "orientation": "portrait-primary",
  "icons": [
    { "src": "/icons/icon-72x72.png", "sizes": "72x72", "type": "image/png" },
    { "src": "/icons/icon-96x96.png", "sizes": "96x96", "type": "image/png" },
    { "src": "/icons/icon-128x128.png", "sizes": "128x128", "type": "image/png" },
    { "src": "/icons/icon-144x144.png", "sizes": "144x144", "type": "image/png" },
    { "src": "/icons/icon-152x152.png", "sizes": "152x152", "type": "image/png" },
    { "src": "/icons/icon-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/icon-384x384.png", "sizes": "384x384", "type": "image/png" },
    { "src": "/icons/icon-512x512.png", "sizes": "512x512", "type": "image/png" }
  ],
  "shortcuts": [
    {
      "name": "My Tickets",
      "url": "/tickets",
      "icons": [{ "src": "/icons/shortcut-tickets.png", "sizes": "96x96" }]
    },
    {
      "name": "Browse Events",
      "url": "/events",
      "icons": [{ "src": "/icons/shortcut-events.png", "sizes": "96x96" }]
    }
  ],
  "share_target": {
    "action": "/share-target",
    "method": "GET",
    "params": { "url": "url", "title": "title" }
  }
}
```

### Service Worker Strategy

**Caching strategy (using Workbox):**
- **Network-first** for: API calls, event data, organiser dashboard
- **Cache-first** for: static assets (JS, CSS, fonts, icons)
- **Stale-while-revalidate** for: event listing pages, homepage

**Offline-critical routes (must work offline):**
- `/tickets` — attendee's purchased tickets
- `/tickets/[orderId]` — specific ticket with QR code
- All assets on these routes cached at purchase time

**Cache invalidation:**
- Tickets cached on order confirmation
- Version-based cache naming: `eventlinqs-v2.1.0-tickets`
- On app update: stale caches deleted

### Push Notifications

**Required web push support:**
- Browser push API (works on Chrome Android, Firefox, Edge; NOT Safari until iOS 16.4+ where Web Push is supported)
- On iOS < 16.4: fall back to in-app notification center

**EventLinqs notification types:**

| Trigger | Message | Timing |
|---------|---------|--------|
| Event day | "Your event starts in 3 hours" | 3 hours before event |
| Event day | "Doors open in 30 minutes — your ticket is ready" | 30 min before doors |
| Waitlist promotion | "Good news! A ticket for [Event] became available" | Immediate |
| On-sale reminder | "[Artist] tickets go on sale in 1 hour" | 1 hour before on-sale |
| Order confirmation | "Your ticket for [Event] is confirmed" | On purchase |

### Apple Wallet Integration (.pkpass)

A .pkpass file is a ZIP archive with specific structure:

```
MyTicket.pkpass/
  pass.json        ← pass data (name, dates, barcode, etc.)
  background.png   ← 180×220px or 360×440px @2x
  icon.png         ← 29×29px or 58×58px @2x
  logo.png         ← 160×50px or 320×100px @2x
  manifest.json    ← SHA1 hashes of all files
  signature        ← PKCS7 signed manifest
```

**pass.json structure (event ticket type):**
```json
{
  "formatVersion": 1,
  "passTypeIdentifier": "pass.com.eventlinqs.ticket",
  "serialNumber": "[order-uuid]",
  "teamIdentifier": "[Apple-Team-ID]",
  "organizationName": "EventLinqs",
  "description": "Event Ticket",
  "foregroundColor": "rgb(255, 255, 255)",
  "backgroundColor": "rgb(26, 26, 46)",
  "eventTicket": {
    "primaryFields": [{ "key": "event", "label": "EVENT", "value": "Event Name" }],
    "secondaryFields": [
      { "key": "date", "label": "DATE", "value": "Sat 15 Apr 2026" },
      { "key": "time", "label": "TIME", "value": "8:00 PM" }
    ],
    "auxiliaryFields": [
      { "key": "venue", "label": "VENUE", "value": "Venue Name" },
      { "key": "seat", "label": "SEAT", "value": "Section A · Row 3 · Seat 12" }
    ],
    "backFields": [
      { "key": "refund", "label": "REFUND POLICY", "value": "All sales final" },
      { "key": "order", "label": "ORDER #", "value": "EL-394827" }
    ]
  },
  "barcode": {
    "message": "[QR-code-data]",
    "format": "PKBarcodeFormatQR",
    "messageEncoding": "iso-8859-1"
  }
}
```

Apple Wallet passes require an Apple Developer account ($99/year) and a Pass Type Certificate.

### Google Wallet Integration

Google Wallet uses a JWT-based approach (simpler than Apple):

```js
// Server-side: generate a signed JWT
const payload = {
  iss: serviceAccountEmail,
  aud: 'google',
  origins: ['eventlinqs.com'],
  typ: 'savetowallet',
  payload: {
    eventTicketObjects: [{
      id: `${issuerId}.${orderId}`,
      classId: `${issuerId}.eventlinqs_ticket`,
      state: 'ACTIVE',
      ticketHolderName: 'Attendee Name',
      ticketNumber: orderId,
      barcode: { type: 'QR_CODE', value: qrCodeData },
      eventName: { defaultValue: { language: 'en', value: eventName } },
      dateTime: { start: eventIsoDateTime, end: eventEndIsoDateTime },
      venue: { name: { defaultValue: { language: 'en', value: venueName } } }
    }]
  }
}
```

Google Wallet "Add to Wallet" button: `https://pay.google.com/gp/v/save/[signed-jwt]`

---

## "Add to Home Screen" Prompt

**iOS (Safari):** No automatic prompt — user must manually tap Share → Add to Home Screen.
- EventLinqs should show an instructional banner on iOS Safari for returning users (>2 visits): "Add EventLinqs to your home screen for faster ticket access. Tap Share → Add to Home Screen."
- Dismiss permanently with "X"

**Android (Chrome):** Browser shows automatic "Add to Home Screen" prompt if PWA criteria are met:
- Manifest with icons ✓
- Service Worker registered ✓
- HTTPS ✓
- User has visited twice in 5 minutes: automatic `beforeinstallprompt` event fires
- EventLinqs should intercept this event and show a custom in-app prompt instead of the browser default

**Custom install prompt:**
```jsx
// Capture the event
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  setInstallPromptEvent(e);
});

// Trigger on button click
installPromptEvent.prompt();
const { outcome } = await installPromptEvent.userChoice;
```
