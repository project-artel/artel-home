import { useLayoutEffect, useRef, type RefObject } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useActionBinding, useFieldBinding } from '../projectAgent/bindings'
import { listedOptions, readOnlyListWrite } from '../projectAgent/specs/listedOptions'
import {
  TEST_SCENARIO_ADD_CASES_ACTION,
  TEST_SCENARIO_ADD_CASES_TO_BUILD_ACTION,
  TEST_SCENARIO_CASES_FIELD,
  TEST_SCENARIO_CONVERT_TO_FREE_ACTION,
  TEST_SCENARIO_REMOVE_CASES_ACTION,
  TEST_SCENARIO_TITLE_FIELD,
} from '../projectAgent/specs/testScenario'
import { listTestCases } from '../testCases/testCaseApi'
import { addCasesToVersion, listTestCaseVersions } from '../testCases/testCaseVersions'
import { getTestRun, type RunGameBuild } from '../testRuns/testRunApi'
import { invalidateCaseLists } from './caseListRevision'
import {
  addCasesToBuildBlockedReason,
  convertToFreeBlockedReason,
  createScenarioAgentRunners,
  freeOnlyBlockedReason,
} from './scenarioAgentRunners'
import { caseIdsInDraft } from './scenarioAgentEdits'
import type { ScenarioDraft } from './scenarioTypes'
import type { StepEditor } from './useStepEditor'

export type ScenarioAgentActionsArgs = {
  projectId: string
  editor: StepEditor
  /** 테스트 런의 빌드 버전. 아직 읽는 중이면 null 이어도 된다 — 실행할 때 `?run=` 의 런을 다시 읽는다. */
  runBuild: RunGameBuild | null
  /**
   * 화면 쪽에서 막는 이유(시나리오를 읽는 중, chat 의 draft 를 열어 둠 등). 있으면 모든 action 이 막힌다.
   * 편집기의 draft 가 아직 이 시나리오의 것이 아닐 때 바꾸지 않게 하려는 것이다.
   */
  blockedReason?: string | null
  /** 강조할 element. 주지 않으면 편집기의 class 로 찾는다. */
  editorRef?: RefObject<HTMLElement | null>
  titleRef?: RefObject<HTMLElement | null>
}

/** `testScenario.cases` 의 option. ORDERED 면 그 케이스의 첫 스텝 문장을 붙인다. FREE 스텝은 action 이 비어 있다. */
function scenarioCaseOptions(draft: ScenarioDraft) {
  const caseIds = caseIdsInDraft(draft)
  return listedOptions(caseIds, (caseId) => {
    const action = draft.steps.find((step) => String(step.case_id) === caseId)?.action ?? ''
    return { value: caseId, label: action.length > 0 ? `TC #${caseId} ${action}` : `TC #${caseId}` }
  })
}

function findElement(ref: RefObject<HTMLElement | null> | undefined, selector: string): HTMLElement | null {
  return ref?.current ?? document.querySelector<HTMLElement>(selector)
}

/**
 * 시나리오 편집 화면의 project agent binding(`testScenario.*`). project agent provider 밖에서는 빈 registry
 * 에 등록되므로 아무 일도 하지 않는다.
 */
export function useScenarioAgentActions(args: ScenarioAgentActionsArgs): void {
  const { projectId, editor, runBuild, blockedReason = null, editorRef, titleRef } = args
  const [searchParams] = useSearchParams()
  const runId = searchParams.get('run')

  // 실행부는 서버를 기다리는 동안에도 편집기의 최신 draft 를 읽어야 한다.
  const latest = useRef({ editor, runBuild, runId })
  useLayoutEffect(() => {
    latest.current = { editor, runBuild, runId }
  })

  // action 을 실행할 때만 만든다. ref 를 읽는 함수라 render 중에 부르면 안 된다.
  const runners = () =>
    createScenarioAgentRunners({
      readDraft: () => latest.current.editor.working,
      replaceDraft: (next) => latest.current.editor.replaceDraft(next),
      resolveRunBuild: async () => {
        const { runBuild: knownBuild, runId: currentRunId } = latest.current
        if (knownBuild !== null) return knownBuild
        if (currentRunId === null) return null
        return (await getTestRun(projectId, currentRunId))?.gameBuild ?? null
      },
      listProjectCases: () => listTestCases(projectId),
      listBuildCases: (gameBuildId) => listTestCases(projectId, undefined, { gameBuildId }),
      listVersions: async () => (await listTestCaseVersions(projectId)).versions,
      addCasesToVersion: (gameBuildId, caseIds) => addCasesToVersion(projectId, gameBuildId, caseIds),
      onCaseListsChanged: () => invalidateCaseLists(projectId),
    })

  const editorTarget = () => findElement(editorRef, '.st-editor')
  const draft = editor.working

  useFieldBinding(TEST_SCENARIO_TITLE_FIELD, {
    target: () => findElement(titleRef, '.st-editor-title'),
    read: () => editor.working.title,
    write: (value) => {
      if (blockedReason !== null) throw new Error(blockedReason)
      if (typeof value !== 'string') throw new Error('testScenario.title must be a string.')
      editor.setTitle(value)
    },
  })

  useFieldBinding(TEST_SCENARIO_CASES_FIELD, {
    target: () => findElement(undefined, '.free-case-list') ?? editorTarget(),
    read: () => caseIdsInDraft(editor.working).length,
    options: () => scenarioCaseOptions(editor.working),
    write: readOnlyListWrite(TEST_SCENARIO_CASES_FIELD.name, 'use testScenario.addCases or testScenario.removeCases.'),
  })

  useActionBinding(TEST_SCENARIO_CONVERT_TO_FREE_ACTION, {
    target: editorTarget,
    blocked: () => blockedReason ?? convertToFreeBlockedReason(draft),
    run: (actionArgs) => runners().convertToFree(actionArgs),
  })

  useActionBinding(TEST_SCENARIO_ADD_CASES_ACTION, {
    target: () => findElement(undefined, '.st-editor-add') ?? editorTarget(),
    blocked: () => blockedReason ?? freeOnlyBlockedReason(draft),
    run: (actionArgs) => runners().addCases(actionArgs),
  })

  useActionBinding(TEST_SCENARIO_REMOVE_CASES_ACTION, {
    target: () => findElement(undefined, '.free-case-list') ?? editorTarget(),
    blocked: () => blockedReason ?? freeOnlyBlockedReason(draft),
    run: (actionArgs) => runners().removeCases(actionArgs),
  })

  useActionBinding(TEST_SCENARIO_ADD_CASES_TO_BUILD_ACTION, {
    target: editorTarget,
    blocked: () => blockedReason ?? addCasesToBuildBlockedReason(runId),
    run: (actionArgs) => runners().addCasesToBuild(actionArgs),
  })
}
