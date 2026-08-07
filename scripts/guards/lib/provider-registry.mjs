/**
 * THE ONE PROVIDER REGISTRY THE GUARDS READ.
 *
 * WHY IT IS A SEPARATE FILE. Two guards now ask questions about the same set of
 * components, from opposite directions:
 *
 *   auth-provider-guard.mjs       every provider button HAS a server-resolved gate
 *   auth-provider-cost-guard.mjs  every server-resolved gate IS on a route with a button
 *
 * The second was written after the first. The obvious way to write it was to
 * copy the two tables it needed, and that would have created a second
 * definition of "which components are provider buttons" that drifts silently:
 * adding a provider to one table and not the other leaves each guard passing
 * about a different platform, and neither says so. One definition, imported
 * twice, cannot do that.
 *
 * `src/lib/auth/providers.ts` remains the RUNTIME registry. This is the BUILD
 * registry, and CHECK 2 of auth-provider-guard.mjs fails if the two disagree.
 * That disagreement check is the reason two registries are tolerable at all.
 */

/**
 * Every provider this application can render a button for, with the component
 * that renders it and the identifier that must gate the render.
 */
export const PROVIDER_COMPONENTS = {
  google: {
    component: 'GoogleButton',
    file: 'src/components/auth/google-button.tsx',
    /** The identifier that must gate every render of the component. */
    gateToken: 'googleEnabled',
  },
}

/**
 * Components that must be handed a resolved provider state by a server page,
 * keyed by the module they come from. The import path matters: the admin
 * console has its own unrelated `LoginForm` with no OAuth on it at all, and
 * matching on the bare component name flagged it as a false positive.
 */
export const GATED_FORMS = [
  { component: 'LoginForm', module: '@/components/auth/login-form' },
  { component: 'SignupForm', module: '@/components/auth/signup-form' },
]

/** The resolver module, and the calls that cost a settings fetch. */
export const RESOLVER_MODULE = '@/lib/auth/providers'
export const GATE_CALLS = ['isProviderEnabled(', 'getEnabledProviders(']
