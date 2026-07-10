// Empty stub. The `server-only` and `client-only` marker packages are provided
// by the Next.js bundler at build time and are not installed in node_modules, so
// vitest's node resolver cannot find them. Aliasing them here to this no-op lets
// server modules that import the marker (a build-time guard) be unit-tested.
export {}
