import type { GameBuild } from '../projects/gameTypes'

/**
 * 화면 지도가 빌드를 줄 세우는 순서(ARTEL-1185): 등록이 늦은 것부터. 에디터 빌드도 함께 센다.
 *
 * 다른 화면(QA · 매크로)의 `selectBuild` 는 에디터를 빼고 고른다. 화면 지도는 지금 손에 든 게임을 보는 곳이라, 에디터로
 * 1.4.0 을 돌리고 있는데 옛 출시 빌드 1.0 이 열리면 안 된다. 빌드 고르기의 "최신" 표시도 이 순서의 첫째다.
 */
export function newestFirst(builds: readonly GameBuild[]): GameBuild[] {
  return [...builds].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || Number(b.id) - Number(a.id))
}

/** `?build=` 이 아는 빌드면 그것, 아니면 가장 최근 빌드. 빌드가 없으면 undefined. */
export function selectContentMapBuild(builds: readonly GameBuild[], requestedId: string | null): GameBuild | undefined {
  return builds.find((build) => build.id === requestedId) ?? newestFirst(builds)[0]
}
