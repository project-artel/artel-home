import { createTestRun, setRunScenarios } from '../../../testRuns/testRunApi'
import { approveTestScenario, createTestScenario, updateScenario } from '../../../testScenarios/scenarioApi'
import { buildFreeScenarioDraft } from '../../../testScenarios/scenarioTypes'

/**
 * TC 묶음으로 바로 돌릴 테스트 런을 만든다(ARTEL-1164). 런 하나에 FREE 시나리오 하나 — FREE 는 TC 마다 step 하나라
 * 저작 없이 돌릴 수 있다. 런은 [gameBuildId] 의 TC 를 따른다. 실행 시작은 QA 실행 화면이 한다(콘솔 · 모델을 고르는 곳).
 *
 * 서버에 한 번에 만드는 길이 없어 네 번 부른다. 중간에 실패하면 그때까지 만든 런은 남는다 — 이름으로 알아볼 수 있다.
 */
export async function createFreeRun(projectId: string, gameBuildId: string, name: string, caseIds: readonly string[]): Promise<string> {
  const run = await createTestRun(projectId, { name, gameBuildId })
  const testScenarioId = await createTestScenario(Number(projectId))
  const draft = buildFreeScenarioDraft(name, caseIds)
  await updateScenario(testScenarioId, draft)
  await approveTestScenario(testScenarioId, draft)
  await setRunScenarios(projectId, run.id, [String(testScenarioId)])
  return run.id
}
