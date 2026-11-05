/**
 * NEXT'S REQUEST-ONLY APIS, FOR AN OPS SCRIPT (car 44c). The platform's own occurrence run calls revalidatePath and the
 * lifecycle audit calls headers(), both of which exist only inside a Next request ('Invariant: static generation store
 * missing in revalidatePath', 'headers was called outside a request scope'). A script that runs that code resolves
 * 'next/cache' and 'next/headers' here: a revalidation is a no-op (every public page re-renders within its own revalidate,
 * 300 s on the guides and event pages), and the request headers are empty. Never imported by the app.
 */
export function revalidatePath(path: string): void {
  void path
}
export function revalidateTag(tag: string): void {
  void tag
}
export function unstable_cache<T extends (...args: never[]) => unknown>(fn: T): T {
  return fn
}
export async function headers(): Promise<Headers> {
  return new Headers()
}
export async function cookies(): Promise<{ get: (name: string) => undefined; getAll: () => never[] }> {
  return { get: () => undefined, getAll: () => [] }
}
