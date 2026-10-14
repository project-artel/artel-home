import { useEffect, useState } from 'react'
import { getTestScenario } from '../testScenarios/scenarioApi'
import type { ExecutionMode, ScenarioStep } from '../testScenarios/scenarioTypes'

export type ScenarioStepsView = {
  steps: ScenarioStep[]
  /** `ORDERED` until the scenario has been read: a FREE one is only known once it arrives. */
  executionMode: ExecutionMode
}

/** Shared so an unresolved read keeps the same identity across renders. */
const NOT_LOADED: ScenarioStepsView = { steps: [], executionMode: 'ORDERED' }

/**
 * The steps of the scenario a QA Try is executing, for their titles and count.
 *
 * The log stream names steps by number only, so this is the one place their
 * wording comes from. A failure is swallowed: the progress strip degrades to
 * numbered steps, which is worse to read but still the whole truth about state,
 * and a scenario that will not load is not a reason to hide the run's progress.
 */
export function useScenarioSteps(testScenarioId: string | null): ScenarioStepsView {
  // The id is kept beside the steps rather than cleared when it changes: the
  // read below discards a stale result, so the effect never has to setState
  // synchronously just to blank the previous scenario.
  const [loaded, setLoaded] = useState<{ id: string; view: ScenarioStepsView } | null>(null)

  useEffect(() => {
    if (testScenarioId === null) return undefined
    const numericId = Number(testScenarioId)
    if (!Number.isSafeInteger(numericId)) return undefined

    const controller = new AbortController()
    getTestScenario(numericId, controller.signal)
      .then((scenario) => {
        if (!controller.signal.aborted) {
          setLoaded({
            id: testScenarioId,
            view: { steps: scenario.payload.steps, executionMode: scenario.payload.execution_mode },
          })
        }
      })
      .catch(() => {})

    return () => controller.abort()
  }, [testScenarioId])

  return loaded !== null && loaded.id === testScenarioId ? loaded.view : NOT_LOADED
}
