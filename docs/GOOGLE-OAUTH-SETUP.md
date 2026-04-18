# Google OAuth Setup Checklist

Follow these steps once to enable the **Continue with Google** button on the login and signup pages. The UI and Supabase client calls are already wired — this just turns on the provider.

Estimated time: 10 minutes.

---

## Part 1 — Google Cloud Console

1. Open https://console.cloud.google.com/ and pick or create a project (suggestion: `EventLinqs`).
2. In the left menu go to **APIs & Services → OAuth consent screen**.
3. Choose **External** user type, click **Create**.
4. Fill **App information**:
   - App name: `EventLinqs`
   - User support email: your Gmail
   - App logo: skip for now (add when we have a final logo)
5. Fill **App domain**:
   - Application home page: `https://eventlinqs.com`
   - Privacy policy: `https://eventlinqs.com/privacy`
   - Terms of service: `https://eventlinqs.com/terms`
6. **Authorized domains**: add `eventlinqs.com` and `supabase.co`.
7. Developer contact email: your Gmail. Click **Save and continue**.
8. **Scopes**: click **Save and continue** (default `email` and `profile` is fine).
9. **Test users**: add your own Gmail while the app is in Testing mode. **Save and continue**.
10. Back in left menu go to **APIs & Services → Credentials**.
11. Click **Create credentials → OAuth client ID**.
12. Application type: **Web application**. Name: `EventLinqs Web`.
13. **Authorised JavaScript origins** — add all of:
    - `https://eventlinqs.com`
    - `https://www.eventlinqs.com`
    - `http://localhost:3000`
14. **Authorised redirect URIs** — add:
    - `https://<your-project-ref>.supabase.co/auth/v1/callback`

    Replace `<your-project-ref>` with the ref shown in your Supabase project URL, e.g. `abcd1234.supabase.co`.

15. Click **Create**. Copy the **Client ID** and **Client secret** that appear. Keep the tab open.

---

## Part 2 — Supabase Dashboard

1. Open https://supabase.com/dashboard and pick the EventLinqs project.
2. Left menu → **Authentication → Providers**.
3. Scroll to **Google**, click to expand.
4. Toggle **Enable sign in with Google** on.
5. Paste the **Client ID** from Google Cloud into **Client ID (for OAuth)**.
6. Paste the **Client secret** from Google Cloud into **Client Secret (for OAuth)**.
7. **Authorized Client IDs**: leave blank unless you also want native mobile sign-in later.
8. **Skip nonce check**: leave off.
9. Click **Save**.

---

## Part 3 — Verify URL settings in Supabase

Still in Supabase:

1. Go to **Authentication → URL Configuration**.
2. Confirm **Site URL** is `https://eventlinqs.com`.
3. Under **Redirect URLs**, ensure these are all listed (add any that are missing):
   - `https://eventlinqs.com/auth/callback`
   - `https://eventlinqs.com/auth/reset-password`
   - `https://www.eventlinqs.com/auth/callback`
   - `https://www.eventlinqs.com/auth/reset-password`
   - `http://localhost:3000/auth/callback`
   - `http://localhost:3000/auth/reset-password`
4. **Save**.

---

## Part 4 — Smoke test

1. Locally: `npm run dev`, visit http://localhost:3000/login, click **Continue with Google**.
2. You should be bounced to Google, see the EventLinqs consent screen, pick your account, and land back on `/dashboard` signed in.
3. Repeat from **/signup** — same redirect behaviour.
4. On production once deployed, repeat from `https://eventlinqs.com/login`.

If the redirect fails with `redirect_uri_mismatch`, the URI in step 14 (Google Cloud) does not match what Supabase is sending. Copy the exact URI from the Google error page into Google Cloud.

---

## Part 5 — Publish the Google OAuth app (when ready)

While the app is in **Testing** mode only the test users you added can sign in. Before launch:

1. Back in Google Cloud → **OAuth consent screen**.
2. Click **Publish app**. Google may ask for verification if you use any sensitive scopes (we do not — `email` and `profile` are non-sensitive), so publishing should be instant.

---

## Troubleshooting

- `400: redirect_uri_mismatch` → the Supabase callback URI in step 14 is wrong. It must be your project-ref + `.supabase.co/auth/v1/callback`.
- `Error 401 invalid_client` → you pasted the Client ID or Secret wrong in Supabase. Regenerate the secret in Google Cloud and repeat Part 2.
- Nothing happens on button click locally → check the browser console. If you see a CORS error, add `http://localhost:3000` to **Authorised JavaScript origins** (step 13).
