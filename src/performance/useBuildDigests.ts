import { useEffect, useState } from 'react'
import type { GameBuild } from '../projects/gameTypes'
import { sortByStartedAt } from './chartModel'
import { getBuildPerformance } from './performanceApi'
import { buildDigest, type BuildDigest } from './trendModel'

export type DigestState = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; digest: BuildDigest }

/**
 * 빌드 목록 줄마다 보일 런 수 · 최근 값 · 미니 추세(ARTEL-1207).
 *
 * 계약은 빌드 하나씩만 돌려주므로 빌드마다 한 번씩 부른다. 한 빌드가 실패해도 그 줄만 "불러오지 못함" 이 된다.
 * 빌드가 수십 개로 늘면 서버가 모아 보내는 길이 따로 있어야 한다.
 */
export function useBuildDigests(projectId: string, builds: readonly GameBuild[]): ReadonlyMap<string, DigestState> {
  const [states, setStates] = useState<ReadonlyMap<string, DigestState>>(new Map())
  const key = builds.map((build) => build.id).join(',')

  useEffect(() => {
    const controller = new AbortController()
    const ids = key === '' ? [] : key.split(',')
    // 아직 답이 없는 빌드는 맵에 없고, 읽는 쪽이 "불러오는 중" 으로 본다.

    for (const id of ids) {
      getBuildPerformance(projectId, id, controller.signal)
        .then((response) => {
          const digest = buildDigest(sortByStartedAt(response.runs))
          setStates((current) => new Map(current).set(id, { status: 'ready', digest }))
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return
          setStates((current) => new Map(current).set(id, { status: 'failed' }))
        })
    }

    return () => controller.abort()
  }, [projectId, key])

  return states
}
