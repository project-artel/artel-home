/*
 * 시나리오 화면 오른쪽 칸이 어느 agent 와 대화할지 고른 값.
 *
 * 'workflow' 는 시나리오 AI(RunChat), 'project' 는 프로젝트 agent 다. 화면을 열 때마다 다시
 * 고르게 하지 않으려고 마지막 선택을 이 브라우저에 남긴다. 저장이 막혀 있으면 'workflow' 로 돌아간다.
 */

export type ScenarioChatAgent = 'workflow' | 'project'

const KEY = 'artel.testScenario.chatAgent'

type ChoiceStorage = Pick<Storage, 'getItem' | 'setItem'>

function storageOf(storage?: ChoiceStorage) {
  return storage ?? window.localStorage
}

export function readScenarioChatAgent(storage?: ChoiceStorage): ScenarioChatAgent {
  try {
    return storageOf(storage).getItem(KEY) === 'project' ? 'project' : 'workflow'
  } catch {
    return 'workflow'
  }
}

export function storeScenarioChatAgent(agent: ScenarioChatAgent, storage?: ChoiceStorage): void {
  try {
    storageOf(storage).setItem(KEY, agent)
  } catch {
    // private mode 등. 이번 화면에서만 기억한다.
  }
}
