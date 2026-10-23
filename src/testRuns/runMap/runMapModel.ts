import { isGapStep, type ScenarioDraft, type ScenarioStep } from '../../testScenarios/scenarioTypes'
import { targetOf, verbOf, type StepVerb } from './stepLabel'

/** 맵에 그리는 스텝 하나. [tc] 는 편집 화면과 같은 TC 구간 번호(같은 `case_id` 가 이어지면 한 구간)다. */
export type MapStep = {
  action: string
  caseId: number | null
  scene: string | null
  gap: boolean
  tc: number | null
  /** 이 스텝에서 새 TC 구간이 시작한다. */
  tcStart: boolean
  verb: StepVerb
  target: string
}

/** 같은 씬이 이어지는 스텝 구간. [from] · [to] 는 스텝 index(포함). */
export type SceneSegment = { scene: string | null; from: number; to: number }

export type MapScenario = {
  id: string
  title: string
  draft: ScenarioDraft
  steps: MapStep[]
  segments: SceneSegment[]
  tcCount: number
  gapCount: number
}

/**
 * TS 하나를 맵 모양으로 바꾼다. 스텝의 씬은 그 스텝이 걸린 TC 의 씬이다. TC 가 없는 스텝(다리 · 경로 끊김)은
 * 씬을 모른다.
 */
export function buildMapScenario(id: string, draft: ScenarioDraft, sceneOfCase: (caseId: number) => string | null): MapScenario {
  let seq = 0
  let previous: number | null = null
  const steps = draft.steps.map((step: ScenarioStep): MapStep => {
    const gap = isGapStep(step)
    let tc: number | null = null
    let tcStart = false
    if (step.case_id !== null) {
      if (step.case_id !== previous) {
        seq += 1
        tcStart = true
      }
      tc = seq
    }
    previous = step.case_id
    return {
      action: step.action,
      caseId: step.case_id,
      scene: step.case_id === null ? null : sceneOfCase(step.case_id),
      gap,
      tc,
      tcStart,
      verb: verbOf(step.action, gap),
      target: gap ? '' : targetOf(step.action),
    }
  })
  return {
    id,
    title: draft.title,
    draft,
    steps,
    segments: sceneSegments(steps),
    tcCount: seq,
    gapCount: steps.filter((step) => step.gap).length,
  }
}

/**
 * 씬 구간. 씬을 모르는 스텝은 앞 구간에 붙인다. 맨 앞에서 씬을 모르면 처음 아는 씬이 그 구간의 이름이 된다.
 * 씬을 몰라서 구간이 잘게 끊기면, 이름으로 묶는 뜻이 사라진다.
 */
export function sceneSegments(steps: readonly Pick<MapStep, 'scene'>[]): SceneSegment[] {
  const segments: SceneSegment[] = []
  steps.forEach((step, index) => {
    const last = segments[segments.length - 1]
    if (last === undefined) segments.push({ scene: step.scene, from: index, to: index })
    else if (step.scene === null || step.scene === last.scene || last.scene === null) {
      if (last.scene === null && step.scene !== null) last.scene = step.scene
      last.to = index
    } else segments.push({ scene: step.scene, from: index, to: index })
  })
  return segments
}
