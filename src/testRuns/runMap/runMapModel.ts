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
  /** 그리는 동안 이 스텝을 가리키는 이름(원래 순번). 끄는 동안 순서가 바뀌어도 점이 같은 요소로 남아 새 자리로 미끄러진다. */
  key: string
  /** 끄는 동안 놓일 자리를 비워 두는 빈 칸. */
  slot?: boolean
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
  const steps = draft.steps.map((step: ScenarioStep, index): MapStep => {
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
      key: String(index),
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

/**
 * 끄는 동안 프레임에 그릴 모양. [remove] 범위를 빼고(같은 TS 안에서 끌 때, 또는 끌려 나간 TS), [insert] 자리에
 * 끄는 스텝 수만큼 빈 칸을 연다(놓일 TS). [insert.before] 는 원래 순번이다.
 */
export function previewScenario(
  scenario: MapScenario,
  change: { remove?: { start: number; end: number }; insert?: { before: number; steps: readonly MapStep[] } },
): MapScenario {
  let steps = [...scenario.steps]
  let before = change.insert?.before ?? 0
  if (change.remove !== undefined) {
    const { start, end } = change.remove
    steps = [...steps.slice(0, start), ...steps.slice(end + 1)]
    if (before > end) before -= end - start + 1
    else if (before > start) before = start
  }
  if (change.insert !== undefined) {
    const slots = change.insert.steps.map((step, offset): MapStep => ({ ...step, key: `slot${offset}`, slot: true }))
    steps = [...steps.slice(0, before), ...slots, ...steps.slice(before)]
  }
  return { ...scenario, steps, segments: sceneSegments(steps) }
}
