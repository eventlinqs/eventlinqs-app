'use client'

import { createContext, useActionState, useContext, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'

/**
 * WHERE A FORM'S ANSWER LIVES, SO IT OUTLIVES THE FORM (window 6, 31 October 2026; Lawal's 11:13, one defect is a class).
 *
 * A server action that succeeds refreshes its page (revalidatePath), and the refreshed page often stops drawing the form
 * that was pressed: a withdrawn photo leaves the list with its Withdraw form, a given calendar moves the venue out of
 * the give form, a yes given leaves the unanswered claims. React applies the action's answer and the refreshed page in
 * one commit, so an answer held by the form unmounted with it: the 'Thank you', 'Withdrawn' and 'Stopped' lines were
 * never seen, and a screen reader heard nothing (WCAG 2.2, 4.1.3 Status Messages).
 *
 * So each family of forms is made here once, with createSectionAnswers, and its <Answers> wraps the page section the
 * forms sit in. The section holds the answer: its status line is always in the page (an empty line has no height), so a
 * change to it is read out, and it stays after the refresh. A refusal stays beside the form that was refused, since
 * that form is still there to try again. A form drawn with no <Answers> around it (a page that does not refresh, such
 * as the claim card's last steps) holds its own answer, in the same always-present status line, inside the form.
 *
 * The guard scripts/guards/form-answers-outlive-the-form.mjs keeps every useActionState form on this path.
 */

/** What every action here answers: the database's done, or its refusal in its own words. */
type Said = { readonly state: 'done' } | { readonly state: 'refused'; readonly reason: string }
type Act = (prev: null, formData: FormData) => Promise<Said | null>
type Held = { readonly answerFor: string; readonly said: Said } | null

const ANSWER_FOR = 'answerFor'

export function createSectionAnswers<K extends string>(kinds: Record<K, { act: Act; done: string }>) {
  async function run(_: Held, formData: FormData): Promise<Held> {
    const answerFor = String(formData.get(ANSWER_FOR) ?? '')
    const kind = kinds[answerFor.split(':')[0] as K]
    if (!kind) return { answerFor, said: { state: 'refused', reason: 'That form could not be read. Reload the page and try again.' } }
    const said = await kind.act(null, formData)
    return said ? { answerFor, said } : null
  }

  const Section = createContext<{ held: Held; action: (formData: FormData) => void } | null>(null)

  function doneWords(held: Held): string {
    return held?.said.state === 'done' ? kinds[held.answerFor.split(':')[0] as K].done : ''
  }

  /**
   * Wraps the page part the family's forms sit in; its status line holds every done answer there. With line={false}
   * the part places an AnswerLine in each section that stays after the refresh instead (a section that empties itself
   * cannot hold its own answer).
   */
  function Answers({ children, line = true }: { children: ReactNode; line?: boolean }) {
    const [held, action] = useActionState<Held, FormData>(run, null)
    return (
      <Section.Provider value={{ held, action }}>
        {line ? <StatusLine words={doneWords(held)} /> : null}
        {children}
      </Section.Provider>
    )
  }

  /** The done answer of the named kinds, where the page places it inside <Answers line={false}>. */
  function AnswerLine({ kinds: shown }: { kinds: K[] }) {
    const held = useContext(Section)?.held ?? null
    return <StatusLine words={held && shown.includes(held.answerFor.split(':')[0] as K) ? doneWords(held) : ''} />
  }

  /**
   * One form of the family. `subject` names the row it acts on (an image, a permission), so a refusal shows beside the
   * one form that was pressed, not every form of its kind in the list.
   */
  function useAnswerFor(kind: K, subject = '') {
    const section = useContext(Section)
    const [own, ownAction] = useActionState<Held, FormData>(run, null)
    const answerFor = `${kind}:${subject}`
    const held = section ? section.held : own
    const mine = held?.answerFor === answerFor ? held.said : null
    return {
      action: section ? section.action : ownAction,
      field: <input type="hidden" name={ANSWER_FOR} value={answerFor} />,
      // Beside the form: its refusal; and, only when no section holds the answer, its done words too.
      line: <StatusLine words={mine?.state === 'refused' ? mine.reason : !section && mine ? doneWords(held) : ''} />,
    }
  }

  return { Answers, AnswerLine, useAnswerFor }
}

/** Always in the page, so a change is read out; with no words it has no height. */
export function StatusLine({ words }: { words: string }) {
  return (
    <p role="status" className={words ? 'mt-2 text-sm text-ink-600' : 'text-sm text-ink-600'}>
      {words}
    </p>
  )
}

/** A submit button that knows its own form is being sent, whichever action holds the answer. */
export function SubmitButton({ className, children, busy }: { className: string; children: ReactNode; busy?: ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending && busy ? busy : children}
    </button>
  )
}
