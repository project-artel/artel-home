import { useSyncExternalStore } from 'react'

/*
 * 프로젝트마다 케이스 목록을 다시 읽으라는 번호. 케이스를 빌드 버전에 넣은 쪽(`testScenario.addCasesToBuild`)이
 * 번호를 올리면, 그 프로젝트의 목록을 읽는 hook(`useProjectCases`, `useRunCases`)이 다시 읽는다. 화면이
 * 목록을 props 로 내려받지 않고 저마다 읽으므로, 하나하나에 새로고침 함수를 건네는 대신 이 번호를 구독한다.
 */

const revisions = new Map<string, number>()
const listeners = new Set<() => void>()

export function invalidateCaseLists(projectId: string): void {
  revisions.set(projectId, (revisions.get(projectId) ?? 0) + 1)
  for (const listener of [...listeners]) listener()
}

export function caseListRevision(projectId: string): number {
  return revisions.get(projectId) ?? 0
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useCaseListRevision(projectId: string): number {
  return useSyncExternalStore(subscribe, () => caseListRevision(projectId), () => caseListRevision(projectId))
}
