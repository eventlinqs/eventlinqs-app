/**
 * ONE STEP OF A RUN IN ITS OWN GUARD (Lawal, 22 November 2026, 15:14: "No individual event, organiser, contact, message
 * or failed job should be able to disable an entire business operation unless there is a genuine platform-wide security
 * or safety emergency"; the PM's 15:15, F1). A step that throws is caught here, logged with its name, and answered as
 * { error, step }, so the run's later steps (the sender above all) still run and the run's answer names what failed.
 */
export type StepFault = { readonly error: string; readonly step: string }

export function isStepFault(x: unknown): x is StepFault {
  return typeof x === 'object' && x !== null && typeof (x as StepFault).error === 'string' && typeof (x as StepFault).step === 'string'
}

export async function isolated<T>(run: string, step: string, work: () => Promise<T>): Promise<T | StepFault> {
  try {
    return await work()
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error(`[${run}] ${step} failed:`, error)
    return { error, step }
  }
}
