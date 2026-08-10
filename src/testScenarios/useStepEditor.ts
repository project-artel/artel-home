import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { updateScenario } from './scenarioApi'
import { isScenarioDraftEqual, type ScenarioDraft, type ScenarioStep } from './scenarioTypes'

/**
 * Editable working copy of a scenario's steps, with undo/redo and autosave.
 *
 * The steps are edited in place (add/edit/remove/reorder) against a working draft;
 * every mutation pushes the previous draft on the undo stack (재도입, ARTEL-289 —
 * the old composition studio had undo/redo + autosave before the redesign).
 *
 * Persistence is **automatic and debounced** ({@link AUTOSAVE_DEBOUNCE_MS}): a
 * change makes the draft `dirty`, and after the quiet window it is written to the
 * scenario's `payload` via {@link updateScenario}. Autosave never touches the
 * undo/redo stacks — so undo can walk back *through* already-saved states (and the
 * next autosave persists the reverted state). That matters because undo must be
 * able to revert an agent-applied change too, not only unsaved keystrokes.
 */
const AUTOSAVE_DEBOUNCE_MS = 600

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
  removeStep: (index: number) => void
  moveStep: (from: number, to: number) => void
  undo: () => void
  redo: () => void
  /** Persist now, bypassing the debounce (e.g. before navigating away). */
  flush: () => Promise<boolean>
  /** Seed the editor from a freshly loaded draft, clearing history (initial load). */
  reset: (draft: ScenarioDraft) => void
  /**
   * Adopt a draft applied out-of-band (a chat proposal) as the new working state,
   * recording the pre-apply draft on the undo stack so the apply can be undone.
   */
  rebase: (draft: ScenarioDraft) => void
}

export function useStepEditor(testScenarioId: number, initial: ScenarioDraft): StepEditor {
  const [working, setWorking] = useState<ScenarioDraft>(initial)
  const [past, setPast] = useState<ScenarioDraft[]>([])
  const [future, setFuture] = useState<ScenarioDraft[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // The last-persisted draft; `dirty` is working ≠ this. A ref so mutations don't
  // depend on it. `savedTick` forces `dirty`/effects to recompute when autosave
  // advances the baseline without `working` changing.
  const baseline = useRef<ScenarioDraft>(initial)
  const [savedTick, setSavedTick] = useState(0)

  // Every edit routes through here: snapshot the current draft onto the undo
  // stack, drop the redo stack (a new edit forks history), apply the change.
  const mutate = useCallback((next: (draft: ScenarioDraft) => ScenarioDraft) => {
    setWorking((current) => {
      setPast((stack) => [...stack, current])
      setFuture([])
      return next(current)
    })
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
        steps: [...d.steps, { action: '', case_id: null, hint: null, input: null }],
      })),
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

  const undo = useCallback(() => {
    setPast((stack) => {
      if (stack.length === 0) return stack
      const previous = stack[stack.length - 1]
      setWorking((current) => {
        setFuture((f) => [current, ...f])
        return previous
      })
      return stack.slice(0, -1)
    })
  }, [])

  const redo = useCallback(() => {
    setFuture((stack) => {
      if (stack.length === 0) return stack
      const nextDraft = stack[0]
      setWorking((current) => {
        setPast((p) => [...p, current])
        return nextDraft
      })
      return stack.slice(1)
    })
  }, [])

  const dirty = useMemo(
    () => !isScenarioDraftEqual(working, baseline.current),
    // savedTick: baseline.current is a ref, so re-read it after autosave lands too.
    [working, savedTick],
  )

  // Persists the given draft and, on success, advances the baseline to it — but
  // leaves working/past/future untouched, so a save never disturbs the edit state
  // or the undo history.
  const persist = useCallback(
    async (draft: ScenarioDraft): Promise<boolean> => {
      setSaving(true)
      setSaveError(null)
      try {
        await updateScenario(testScenarioId, draft)
        baseline.current = draft
        setSavedTick((n) => n + 1)
        return true
      } catch {
        setSaveError('save-failed')
        return false
      } finally {
        setSaving(false)
      }
    },
    [testScenarioId],
  )

  // Autosave: when the draft diverges from the baseline, persist it after a quiet
  // window. Re-running (a new keystroke) clears the pending timer, so a burst
  // collapses into one write.
  useEffect(() => {
    if (!dirty) return undefined
    const snapshot = working
    const timer = setTimeout(() => { void persist(snapshot) }, AUTOSAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [dirty, working, persist])

  const flush = useCallback(() => persist(working), [persist, working])

  const reset = useCallback((draft: ScenarioDraft) => {
    baseline.current = draft
    setWorking(draft)
    setPast([])
    setFuture([])
    setSavedTick((n) => n + 1)
  }, [])

  const rebase = useCallback((draft: ScenarioDraft) => {
    setWorking((current) => {
      setPast((stack) => [...stack, current])
      setFuture([])
      return draft
    })
    baseline.current = draft
    setSavedTick((n) => n + 1)
  }, [])

  return {
    working,
    dirty,
    saving,
    saveError,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    setTitle,
    updateStep,
    addStep,
    removeStep,
    moveStep,
    undo,
    redo,
    flush,
    reset,
    rebase,
  }
}
