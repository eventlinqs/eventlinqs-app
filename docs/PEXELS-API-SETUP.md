# Pexels API Setup

EventLinqs uses the Pexels API to pull category-aware photography and video for any event that has not been assigned organiser media. The integration is graceful: if the API key is missing, the platform falls back to built-in EventLinqs-branded SVG placeholders. No errors, no broken images.

## Why Pexels

- Free tier: 200 requests per hour, 20,000 per month.
- High-quality, royalty-free stills and video.
- Covers the categories we care about (Afrobeats, Amapiano, Owambe, Comedy, Business, Sports, Food, etc.).
- Easy migration path: real photography swaps in by uploading organiser media per event.

## Three-step checklist (takes two minutes)

### 1. Create a free Pexels API account

Visit [https://www.pexels.com/api](https://www.pexels.com/api) and sign up. It is free forever. Confirm your email.

### 2. Copy your API key

From the Pexels dashboard, copy the **API key** (a long alphanumeric string).

### 3. Add the key to the project

**Local development** — add to `.env.local` at the project root:

```
PEXELS_API_KEY=your_key_here
```

**Production (Vercel)** — add the same variable in the Vercel project settings:

1. Vercel dashboard → EventLinqs project → Settings → Environment Variables.
2. Add `PEXELS_API_KEY` with your key. Apply to Production, Preview, and Development scopes.
3. Redeploy.

## What happens without a key

Every `getCategoryPhoto()` / `getCategoryVideo()` call short-circuits to `public/images/event-fallback-hero.svg` and `public/images/event-fallback-thumb.svg`. These are EventLinqs-branded solid-ink panels with a gold dot watermark. They look intentional, not broken.

## Cache behaviour

- Photo results cached 7 days via `unstable_cache`.
- Video results cached 30 days.
- Cache is keyed on the category query string, so the same query does not re-hit Pexels inside the cache window.

## Migrating to real organiser photography

Once organisers start uploading covers, galleries, and video, the `getEventMedia()` orchestrator automatically prefers the organiser asset over Pexels. No code changes needed. Pexels becomes the graceful fallback for any event that has not yet been branded.
