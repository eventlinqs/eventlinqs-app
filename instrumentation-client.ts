// Next.js client instrumentation hook (15.3+). Runs in the browser
// before any application code. We use it as a thin wrapper that
// triggers ./sentry.client.config so the client Sentry.init runs at
// app boot rather than at first React-component import.
//
// The actual init lives in sentry.client.config.ts to keep the
// configuration co-located with its server and edge siblings.

import './sentry.client.config'

// Hook required by @sentry/nextjs for client-side navigation
// instrumentation. Exported even when no DSN is configured so the
// SDK's static analyser does not fail; Sentry.captureRouterTransitionStart
// is a no-op when init was skipped.
import * as Sentry from '@sentry/nextjs'

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
