import type { LabelStep } from './expectedLabelsApi'

/** 3상태를 화면 순서대로. 미지정이 앞인 것은 그것이 기본이자, 사람이 판단하기 전의 정직한 답이라서다. */
export const LABEL_STATES: (boolean | null)[] = [null, true, false]

/**
 * 이 시나리오가 **실패를 기대하는** 스텝 수.
 *
 * 0이면 그 시나리오는 관대한 에이전트와 꼼꼼한 에이전트를 같은 점수로 본다 — 모든 라벨이
 * "전부 통과"라는 답과 일치하기 때문이다. 라벨링은 사람의 시간을 쓰는 일이라, 그 시간이 값을
 * 만들었는지 화면이 말해 줘야 한다.
 */
export function countExpectedFailures(steps: LabelStep[]): number {
  return steps.filter((step) => step.expectedPassed === false).length
}

/** 채점 대상 스텝 수(라벨이 달린 것). 미지정은 분모에도 들지 않는다. */
export function countLabelled(steps: LabelStep[]): number {
  return steps.filter((step) => step.expectedPassed !== null).length
}

/**
 * 첫 "실패 기대" 스텝의 번호(1부터). 없으면 0.
 *
 * 실패해야 하는 스텝은 실행을 거기서 끝낼 수 있고, 그러면 뒤 스텝은 아무도 판정하지 못한다.
 * 그건 틀린 것이 아니라 **미보고**로 채점되는데, 그 사실을 모르는 저작자는 낮은 커버리지를
 * 시나리오의 모양이 아니라 모델 탓으로 읽는다.
 */
export function firstExpectedFailure(steps: LabelStep[]): number {
  const index = steps.findIndex((step) => step.expectedPassed === false)
  return index === -1 ? 0 : index + 1
}

/**
 * 저장할 것만 고른다.
 *
 * 전부 보내면 이 화면이 읽은 뒤 저작 쪽에서 달라진 라벨까지 덮어쓴다. 서버는 목록에 없는
 * 스텝을 손대지 않으므로, 바뀐 것만 싣는 것이 그 경합을 좁히는 방법이다.
 */
export function changedLabels(original: LabelStep[], current: LabelStep[]): LabelStep[] {
  const before = new Map(original.map((step) => [step.step, step.expectedPassed]))
  return current.filter((step) => before.get(step.step) !== step.expectedPassed)
}
