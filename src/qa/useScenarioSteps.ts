import { useEffect, useState } from 'react'
import { getTestScenario } from '../testScenarios/scenarioApi'
import type { ScenarioStep } from '../testScenarios/scenarioTypes'

/** Shared so an unresolved read keeps the same identity across renders. */
const NO_STEPS: ScenarioStep[] = []

/**
 * The steps of the scenario a QA Try is executing, for their titles and count.
 *
 * The log stream names steps by number only, so this is the one place their
 * wording comes from. A failure is swallowed: the progress strip degrades to
 * numbered steps, which is worse to read but still the whole truth about state,
 * and a scenario that will not load is not a reason to hide the run's progress.
 */
export function useScenarioSteps(testScenarioId: string | null): ScenarioStep[] {
  // The id is kept beside the steps rather than cleared when it changes: the
  // read below discards a stale result, so the effect never has to setState
  // synchronously just to blank the previous scenario.
  const [loaded, setLoaded] = useState<{ id: string; steps: ScenarioStep[] } | null>(null)

  useEffect(() => {
    if (testScenarioId === null) return undefined
    const numericId = Number(testScenarioId)
    if (!Number.isSafeInteger(numericId)) return undefined

    const controller = new AbortController()
    getTestScenario(numericId, controller.signal)
      .then((scenario) => {
        if (!controller.signal.aborted) {
          setLoaded({ id: testScenarioId, steps: scenario.payload.steps })
        }
      })
      .catch(() => {})

    return () => controller.abort()
  }, [testScenarioId])

  return loaded !== null && loaded.id === testScenarioId ? loaded.steps : NO_STEPS
}
