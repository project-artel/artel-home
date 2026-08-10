import { useCallback, useMemo, useRef, useState } from 'react'
import { updateScenario } from './scenarioApi'
import { isScenarioDraftEqual, type ScenarioDraft, type ScenarioStep } from './scenarioTypes'

/**
 * Editable working copy of a scenario's steps, with undo/redo and save.
 *
 * The steps are edited in place (add/edit/remove/reorder) against a working draft;
 * every mutation pushes the previous draft on the undo stack (재도입, ARTEL-289 —
 * the old composition studio had undo/redo before the redesign). `save` writes the
 * working draft to the scenario's `payload` via {@link updateScenario} and rebases
 * the baseline, so `dirty` reflects unsaved edits only.
 */
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
  save: () => Promise<boolean>
  /** Adopt a new server draft as the baseline (e.g. after a chat apply reloads it). */
  rebase: (draft: ScenarioDraft) => void
}

export function useStepEditor(testScenarioId: number, initial: ScenarioDraft): StepEditor {
  const [working, setWorking] = useState<ScenarioDraft>(initial)
  const [past, setPast] = useState<ScenarioDraft[]>([])
  const [future, setFuture] = useState<ScenarioDraft[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // The last-saved draft; `dirty` is working ≠ this. A ref so mutations don't
  // depend on it (they only ever read it inside save/rebase).
  const baseline = useRef<ScenarioDraft>(initial)

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

  const save = useCallback(async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const saved = await updateScenario(testScenarioId, working)
      baseline.current = saved.payload
      setWorking(saved.payload)
      setPast([])
      setFuture([])
      return true
    } catch {
      setSaveError('save-failed')
      return false
    } finally {
      setSaving(false)
    }
  }, [testScenarioId, working])

  const rebase = useCallback((draft: ScenarioDraft) => {
    baseline.current = draft
    setWorking(draft)
    setPast([])
    setFuture([])
  }, [])

  const dirty = useMemo(() => !isScenarioDraftEqual(working, baseline.current), [working])

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
    save,
    rebase,
  }
}
