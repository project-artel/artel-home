import { useCallback, useEffect, useRef, useState } from 'react'
import { ProjectApiError } from '../projects/projectApi'
import {
  createTestCase,
  deleteTestCase,
  updateTestCase,
} from '../testCases/testCaseApi'
import {
  DEFAULT_VERIFICATION_STATUS,
  type TestCase,
  type TestCaseInput,
  type VerificationStatus,
} from '../testCases/testCaseTypes'
import { getScenarioCases, setScenarioCases } from './scenarioCaseApi'
import { getTestScenario, updateScenario } from './scenarioApi'
import { EMPTY_SCENARIO_DRAFT, type ScenarioDraft } from './scenarioTypes'

/**
 * The Edit view of one scenario in the 3-tier model.
 *
 * The scenario body here is its **case composition** — an ordered list of
 * reusable TestCases — not the agent-authored `payload.steps`. This hook keeps
 * the same three affordances the old canvas had, repointed at the new data:
 *
 * - undo/redo: an in-memory stack of committed states, client-only.
 * - autosave: debounced, reconciling the working state to the server across the
 *   three endpoints it now spans (composition order, case fields, scenario title).
 * - drag reorder: the UI rewrites `order`; a reorder is just a changed `order`.
 *
 * Creating and deleting a case are explicit actions (they need a server id, or
 * they destroy shared data), so they call through immediately rather than being
 * inferred by the autosave diff.
 */

const AUTOSAVE_DEBOUNCE_MS = 600
const UNDO_WINDOW = 20

type CompositionStatus = 'loading' | 'ready' | 'missing' | 'error'

/** The editable state: case order, the cases by id, and the scenario title. */
export type Composition = {
  title: string
  order: string[]
  caseById: Record<string, TestCase>
}

/** The server baseline also keeps the scenario payload, so a title save preserves it. */
type Baseline = Composition & { payload: ScenarioDraft }

const EMPTY_COMPOSITION: Composition = { title: '', order: [], caseById: {} }

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function compositionEqual(left: Composition, right: Composition): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/** The fields of a case that differ, or `null` when nothing changed. */
function caseFieldDiff(next: TestCase, base: TestCase | undefined): TestCaseInput | null {
  if (base === undefined) return null
  const diff: TestCaseInput = {}
  if (next.category !== base.category) diff.category = next.category
  if (next.title !== base.title) diff.title = next.title
  if (next.precondition !== base.precondition) diff.precondition = next.precondition
  if (next.expected !== base.expected) diff.expected = next.expected
  if (next.verificationStatus !== base.verificationStatus) {
    diff.verificationStatus = next.verificationStatus
  }
  return Object.keys(diff).length > 0 ? diff : null
}

function load(testScenarioId: number, signal?: AbortSignal) {
  return Promise.all([
    getTestScenario(testScenarioId, signal),
    getScenarioCases(testScenarioId, signal),
  ])
}

export function useScenarioComposition(projectId: string, testScenarioId: number) {
  const [status, setStatus] = useState<CompositionStatus>('loading')
  const [working, setWorking] = useState<Composition>(EMPTY_COMPOSITION)
  const [saving, setSaving] = useState(false)

  const baselineRef = useRef<Baseline>({ ...EMPTY_COMPOSITION, payload: EMPTY_SCENARIO_DRAFT })
  const [baselineTick, setBaselineTick] = useState(0)
  const bumpBaseline = useCallback(() => setBaselineTick((n) => n + 1), [])

  const undoStackRef = useRef<Composition[]>([])
  const undoCursorRef = useRef(-1)
  const [undoAvail, setUndoAvail] = useState({ canUndo: false, canRedo: false })
  const syncUndoAvail = useCallback(() => {
    const cursor = undoCursorRef.current
    setUndoAvail({
      canUndo: cursor > 0,
      canRedo: cursor >= 0 && cursor < undoStackRef.current.length - 1,
    })
  }, [])

  const adoptBaseline = useCallback((next: Baseline) => {
    baselineRef.current = next
    bumpBaseline()
  }, [bumpBaseline])

  const applyLoaded = useCallback(
    ([scenario, items]: Awaited<ReturnType<typeof load>>) => {
      const order = items.map((item) => item.case.id)
      const caseById: Record<string, TestCase> = {}
      for (const item of items) caseById[item.case.id] = item.case
      const title = scenario.payload.title
      const composition: Composition = { title, order, caseById }

      undoStackRef.current = [composition]
      undoCursorRef.current = 0
      syncUndoAvail()

      adoptBaseline({ ...composition, payload: scenario.payload })
      setWorking(composition)
      setStatus('ready')
    },
    [adoptBaseline, syncUndoAvail],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(testScenarioId, controller.signal)
      .then(applyLoaded)
      .catch((error: unknown) => {
        if (isAbort(error)) return
        setStatus(error instanceof ProjectApiError && error.isNotFound ? 'missing' : 'error')
      })
    return () => controller.abort()
  }, [testScenarioId, applyLoaded])

  /**
   * Records each committed baseline as an undo entry. Mirrors the old canvas:
   * the trigger is the baseline moving (a successful reconcile), and the
   * autosave debounce has already collapsed a burst of edits into one commit,
   * so the stack holds one entry per persisted state and never floods.
   */
  useEffect(() => {
    if (status !== 'ready') return
    const snapshot: Composition = {
      title: baselineRef.current.title,
      order: baselineRef.current.order,
      caseById: baselineRef.current.caseById,
    }
    const stack = undoStackRef.current
    const cursor = undoCursorRef.current
    if (cursor >= 0 && compositionEqual(stack[cursor], snapshot)) return

    const kept = stack.slice(0, cursor + 1)
    kept.push(snapshot)
    const trimmed = kept.length > UNDO_WINDOW ? kept.slice(kept.length - UNDO_WINDOW) : kept
    undoStackRef.current = trimmed
    undoCursorRef.current = trimmed.length - 1
    syncUndoAvail()
  }, [baselineTick, status, syncUndoAvail])

  /**
   * Autosave: reconciles `working` to the server, debounced. Nothing to do when
   * the working state already equals the baseline (a fresh load, or an undo that
   * landed back on a saved state). Runs the three saves in sequence — title,
   * then case fields, then composition — updating the baseline as each lands, so
   * an edit made mid-flight simply diverges again and the effect re-runs.
   */
  useEffect(() => {
    if (status !== 'ready') return undefined
    const base = baselineRef.current
    const baseComposition: Composition = { title: base.title, order: base.order, caseById: base.caseById }
    if (compositionEqual(working, baseComposition)) return undefined

    let cancelled = false
    const timer = setTimeout(() => {
      void (async () => {
        setSaving(true)
        try {
          let next: Baseline = base

          if (working.title !== next.title) {
            const updatedPayload: ScenarioDraft = { ...next.payload, title: working.title }
            const scenario = await updateScenario(testScenarioId, updatedPayload)
            if (cancelled) return
            next = { ...next, title: scenario.payload.title, payload: scenario.payload }
          }

          for (const id of working.order) {
            const diff = caseFieldDiff(working.caseById[id], next.caseById[id])
            if (diff === null) continue
            const saved = await updateTestCase(projectId, id, diff)
            if (cancelled) return
            next = { ...next, caseById: { ...next.caseById, [id]: saved } }
          }

          const orderChanged =
            JSON.stringify(working.order) !== JSON.stringify(next.order)
          if (orderChanged) {
            const items = await setScenarioCases(testScenarioId, working.order)
            if (cancelled) return
            const order = items.map((item) => item.case.id)
            const caseById = { ...next.caseById }
            for (const item of items) caseById[item.case.id] = item.case
            next = { ...next, order, caseById }
          }

          adoptBaseline(next)
        } catch {
          // Left dirty; the next edit retries. No data is lost — the working
          // state stays on screen and diverged.
        } finally {
          if (!cancelled) setSaving(false)
        }
      })()
    }, AUTOSAVE_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [working, baselineTick, status, projectId, testScenarioId, adoptBaseline])

  const undo = useCallback(() => {
    if (undoCursorRef.current <= 0) return
    undoCursorRef.current -= 1
    setWorking(undoStackRef.current[undoCursorRef.current])
    syncUndoAvail()
  }, [syncUndoAvail])

  const redo = useCallback(() => {
    if (undoCursorRef.current >= undoStackRef.current.length - 1) return
    undoCursorRef.current += 1
    setWorking(undoStackRef.current[undoCursorRef.current])
    syncUndoAvail()
  }, [syncUndoAvail])

  // ---- editing intents (UI calls these) ----

  const setTitle = useCallback((title: string) => {
    setWorking((current) => ({ ...current, title }))
  }, [])

  const editCase = useCallback((caseId: string, patch: Partial<TestCase>) => {
    setWorking((current) => {
      const existing = current.caseById[caseId]
      if (existing === undefined) return current
      return { ...current, caseById: { ...current.caseById, [caseId]: { ...existing, ...patch } } }
    })
  }, [])

  const reorder = useCallback((order: string[]) => {
    setWorking((current) => ({ ...current, order }))
  }, [])

  const removeFromScenario = useCallback((caseId: string) => {
    setWorking((current) => ({ ...current, order: current.order.filter((id) => id !== caseId) }))
  }, [])

  const addExisting = useCallback((testCase: TestCase) => {
    setWorking((current) => {
      if (current.order.includes(testCase.id)) return current
      return {
        ...current,
        order: [...current.order, testCase.id],
        caseById: { ...current.caseById, [testCase.id]: testCase },
      }
    })
  }, [])

  /**
   * Creates a new case and appends it to the scenario. A create needs a server
   * id before it can join the composition, so it is awaited rather than
   * inferred; the append then flows through autosave like any other reorder.
   */
  const createAndAdd = useCallback(
    async (input: TestCaseInput): Promise<TestCase | null> => {
      try {
        const created = await createTestCase(projectId, {
          category: input.category ?? '',
          title: input.title ?? '',
          precondition: input.precondition ?? null,
          expected: input.expected ?? '',
          verificationStatus: input.verificationStatus ?? DEFAULT_VERIFICATION_STATUS,
        })
        setWorking((current) => ({
          ...current,
          order: [...current.order, created.id],
          caseById: { ...current.caseById, [created.id]: created },
        }))
        return created
      } catch {
        return null
      }
    },
    [projectId],
  )

  /** Deletes a case from the library entirely (destroys shared data). */
  const deleteCase = useCallback(
    async (caseId: string): Promise<boolean> => {
      try {
        await deleteTestCase(projectId, caseId)
        setWorking((current) => {
          const caseById = { ...current.caseById }
          delete caseById[caseId]
          return { ...current, order: current.order.filter((id) => id !== caseId), caseById }
        })
        return true
      } catch {
        return false
      }
    },
    [projectId],
  )

  const reload = useCallback(() => {
    setStatus('loading')
    load(testScenarioId).then(applyLoaded).catch((error: unknown) => {
      setStatus(error instanceof ProjectApiError && error.isNotFound ? 'missing' : 'error')
    })
  }, [testScenarioId, applyLoaded])

  const baseComposition: Composition = {
    title: baselineRef.current.title,
    order: baselineRef.current.order,
    caseById: baselineRef.current.caseById,
  }

  return {
    status,
    working,
    cases: working.order
      .map((id) => working.caseById[id])
      .filter((testCase): testCase is TestCase => testCase !== undefined),
    dirty: status === 'ready' && !compositionEqual(working, baseComposition),
    saving,
    setTitle,
    editCase,
    reorder,
    removeFromScenario,
    addExisting,
    createAndAdd,
    deleteCase,
    undo,
    redo,
    canUndo: undoAvail.canUndo,
    canRedo: undoAvail.canRedo,
    reload,
  }
}

export type { VerificationStatus }
