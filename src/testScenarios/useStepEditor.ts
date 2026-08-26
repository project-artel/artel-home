import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { updateScenario } from './scenarioApi'
import { isScenarioDraftEqual, type ScenarioDraft, type ScenarioStep, createEmptyStep } from './scenarioTypes'

/**
 * Editable working copy of a scenario's steps, with undo/redo and autosave.
 *
 * Steps are edited in place (add/edit/remove/reorder) against a live `working`
 * draft. Persistence is **automatic and debounced** ({@link AUTOSAVE_DEBOUNCE_MS}):
 * a change makes the draft `dirty`, and after the quiet window it is written to the
 * scenario's `payload` via {@link updateScenario}.
 *
 * Undo granularity is the **autosave commit, not the keystroke** (재도입, ARTEL-289
 * — matching the old composition studio). Keystrokes never touch the history; each
 * successful autosave pushes one snapshot. So one undo walks back a whole burst of
 * edits (everything since the last save), not a single character. Undo can walk
 * back through already-saved states — and the next autosave persists the reverted
 * state — because undo must also be able to revert an agent-applied proposal, not
 * only unsaved keystrokes.
 */
const AUTOSAVE_DEBOUNCE_MS = 600
const UNDO_WINDOW = 30

export type StepEditor = {
  working: ScenarioDraft
  dirty: boolean
  saving: boolean
  saveError: string | null
  canUndo: boolean
  canRedo: boolean
  setTitle: (title: string) => void
  updateStep: (index: number, patch: Partial<ScenarioStep>) => void
  addStep: () => void
  /** Insert an empty step at `index` — used by the gap block to fill the place it marks. */
  insertStep: (index: number, step?: ScenarioStep) => void
  /**
   * Replace the step at `index` with `steps`. The gap block uses it: once someone
   * answers the question it asked, the notice should give up its place rather than
   * sit above the answer repeating itself.
   */
  replaceStep: (index: number, steps: ScenarioStep[]) => void
  removeStep: (index: number) => void
  moveStep: (from: number, to: number) => void
  undo: () => void
  redo: () => void
  /** Persist now, bypassing the debounce (e.g. before navigating away). */
  flush: () => Promise<boolean>
  /** Seed the editor from a freshly loaded draft, clearing history (initial load). */
  reset: (draft: ScenarioDraft) => void
  /**
   * Adopt a draft applied out-of-band (a chat proposal) as a new committed state,
   * recording it on the history so the apply can be undone.
   */
  rebase: (draft: ScenarioDraft) => void
}

export function useStepEditor(testScenarioId: number, initial: ScenarioDraft): StepEditor {
  const [working, setWorking] = useState<ScenarioDraft>(initial)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // The last-persisted draft; `dirty` is working ≠ this. A ref so mutations don't
  // depend on it. `savedTick` re-reads it after autosave advances it silently.
  const baseline = useRef<ScenarioDraft>(initial)
  const [savedTick, setSavedTick] = useState(0)

  // History of committed states (one per autosave / apply), with a cursor. Refs
  // so recording inside effects never re-triggers renders on its own; `avail`
  // mirrors the derived button state.
  const historyRef = useRef<ScenarioDraft[]>([initial])
  const cursorRef = useRef(0)
  const [avail, setAvail] = useState({ canUndo: false, canRedo: false })
  const syncAvail = useCallback(() => {
    const cursor = cursorRef.current
    setAvail({ canUndo: cursor > 0, canRedo: cursor < historyRef.current.length - 1 })
  }, [])

  // Records a committed draft as the next history entry, dropping any redo tail.
  const recordCommit = useCallback((draft: ScenarioDraft) => {
    const history = historyRef.current
    const cursor = cursorRef.current
    if (cursor >= 0 && isScenarioDraftEqual(history[cursor], draft)) return
    const kept = history.slice(0, cursor + 1)
    kept.push(draft)
    const trimmed = kept.length > UNDO_WINDOW ? kept.slice(kept.length - UNDO_WINDOW) : kept
    historyRef.current = trimmed
    cursorRef.current = trimmed.length - 1
    syncAvail()
  }, [syncAvail])

  // Every edit routes through here: apply the change to the working draft. Undo
  // history is NOT touched — it advances only on commit (autosave), so undo is
  // per-save, not per-keystroke.
  const mutate = useCallback((next: (draft: ScenarioDraft) => ScenarioDraft) => {
    setWorking((current) => next(current))
  }, [])

  const setTitle = useCallback(
    (title: string) => mutate((d) => ({ ...d, title })),
    [mutate],
  )
  const updateStep = useCallback(
    (index: number, patch: Partial<ScenarioStep>) =>
      mutate((d) => ({
        ...d,
        steps: d.steps.map((step, i) => (i === index ? { ...step, ...patch } : step)),
      })),
    [mutate],
  )
  const addStep = useCallback(
    () =>
      mutate((d) => ({
        ...d,
        steps: [...d.steps, createEmptyStep()],
      })),
    [mutate],
  )
  const insertStep = useCallback(
    (index: number, step?: ScenarioStep) =>
      mutate((d) => {
        const steps = [...d.steps]
        steps.splice(Math.max(0, Math.min(index, steps.length)), 0, step ?? createEmptyStep())
        return { ...d, steps }
      }),
    [mutate],
  )
  const replaceStep = useCallback(
    (index: number, steps: ScenarioStep[]) =>
      mutate((d) => {
        if (index < 0 || index >= d.steps.length || steps.length === 0) return d
        const next = [...d.steps]
        next.splice(index, 1, ...steps)
        return { ...d, steps: next }
      }),
    [mutate],
  )
  const removeStep = useCallback(
    (index: number) =>
      mutate((d) => ({ ...d, steps: d.steps.filter((_, i) => i !== index) })),
    [mutate],
  )
  const moveStep = useCallback(
    (from: number, to: number) =>
      mutate((d) => {
        if (from === to || from < 0 || to < 0 || from >= d.steps.length || to >= d.steps.length) {
          return d
        }
        const steps = [...d.steps]
        const [moved] = steps.splice(from, 1)
        steps.splice(to, 0, moved)
        return { ...d, steps }
      }),
    [mutate],
  )

  const dirty = useMemo(
    () => !isScenarioDraftEqual(working, baseline.current),
    [working, savedTick],
  )

  // Persists a draft and, on success, advances the baseline and records the
  // commit on the history. Leaves `working` untouched.
  const persist = useCallback(
    async (draft: ScenarioDraft): Promise<boolean> => {
      setSaving(true)
      setSaveError(null)
      try {
        await updateScenario(testScenarioId, draft)
        baseline.current = draft
        recordCommit(draft)
        setSavedTick((n) => n + 1)
        return true
      } catch {
        setSaveError('save-failed')
        return false
      } finally {
        setSaving(false)
      }
    },
    [testScenarioId, recordCommit],
  )

  // Autosave: when the draft diverges from the baseline, persist it after a quiet
  // window; a fresh keystroke clears the pending timer, collapsing a burst into
  // one write (and thus one undo entry).
  useEffect(() => {
    if (!dirty) return undefined
    const snapshot = working
    const timer = setTimeout(() => { void persist(snapshot) }, AUTOSAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [dirty, working, persist])

  const flush = useCallback(() => persist(working), [persist, working])

  const undo = useCallback(() => {
    if (cursorRef.current <= 0) return
    cursorRef.current -= 1
    setWorking(historyRef.current[cursorRef.current])
    syncAvail()
  }, [syncAvail])

  const redo = useCallback(() => {
    if (cursorRef.current >= historyRef.current.length - 1) return
    cursorRef.current += 1
    setWorking(historyRef.current[cursorRef.current])
    syncAvail()
  }, [syncAvail])

  const reset = useCallback((draft: ScenarioDraft) => {
    baseline.current = draft
    historyRef.current = [draft]
    cursorRef.current = 0
    setWorking(draft)
    syncAvail()
    setSavedTick((n) => n + 1)
  }, [syncAvail])

  const rebase = useCallback((draft: ScenarioDraft) => {
    baseline.current = draft
    recordCommit(draft)
    setWorking(draft)
    setSavedTick((n) => n + 1)
  }, [recordCommit])

  return {
    working,
    dirty,
    saving,
    saveError,
    canUndo: avail.canUndo,
    canRedo: avail.canRedo,
    setTitle,
    updateStep,
    addStep,
    insertStep,
    replaceStep,
    removeStep,
    moveStep,
    undo,
    redo,
    flush,
    reset,
    rebase,
  }
}
