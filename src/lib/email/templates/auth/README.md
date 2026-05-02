# Supabase Auth email templates

These HTML files are paste-targets for the Supabase Dashboard email template editor. They are NOT consumed at runtime by code; Supabase Auth renders them server-side using the placeholder tokens documented at https://supabase.com/docs/guides/auth/auth-email-templates.

When updating: edit the HTML here, copy the body into Supabase Dashboard > Authentication > Email Templates > {template name}, and verify by sending a test email through Supabase's preview tool.

## Files in this directory

| File | Supabase template | When triggered |
| --- | --- | --- |
| `confirm-signup.html` | Confirm signup | New user verifies email after signup |
| `magic-link.html` | Magic link | Passwordless sign-in via email link |
| `password-reset.html` | Reset password | User clicks "forgot password" |
| `email-change.html` | Change email address | User updates email in profile |
| `reauthentication.html` | Reauthentication | Sensitive action requires fresh proof |

## Placeholder tokens

Supabase substitutes these at send time:

- `{{ .ConfirmationURL }}` - the action link (sign-in, confirm, reset, etc.)
- `{{ .Token }}` - 6-digit OTP if used instead of a link
- `{{ .TokenHash }}` - hashed token for URL-based flows
- `{{ .Email }}` - user email address
- `{{ .RedirectTo }}` - the post-action redirect URL set by the client
- `{{ .Data }}` - custom claims set during signup

## Brand voice compliance

All copy in this directory complies with the EventLinqs brand voice rules:

- No em-dashes
- No en-dashes
- No exclamation marks in user-facing copy
- No "diaspora" references
- Australian English (`-ise`, `-our`, `-re`)
- Plain HTML, inline styles only (no external CSS, no client-side JS)
- Mobile-readable (single column, 16px minimum body text, dark on light)
- Light-mode optimised; dark-mode auto-degrades cleanly via system preference

## Visual standard

These are transactional auth emails, not marketing. The bar is "professional, branded, scannable in 2 seconds, click the button" - not "Hollywood spectacle". Anything beyond a wordmark + button + 2 sentences of copy is over-engineering.

The wordmark is text-only (`EVENTLINQS`) per CLAUDE.md until the logo image lands.
