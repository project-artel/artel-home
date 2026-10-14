import type { GameInstance } from '../projects/gameTypes'
import type { TestCaseVersionSummary } from '../testCases/testCaseVersions'
import type { TestRun } from './testRunApi'

/*
 * 테스트 런 화면의 판정(ARTEL-1049). 왼쪽 버전 트리의 한 칸이 어느 TR 을 담는지, QA 를 시작할 때 켜진 게임이 TR 의 버전과
 * 다른지. 순수 함수라 렌더 없이 테스트한다.
 */

/** "버전 없음" 칸의 열쇠. 게임 빌드 id 와 겹치지 않는다. */
export const NO_VERSION = 'none'

/** TR 이 든 칸. 버전이 없으면 [NO_VERSION] 이다. */
export function bucketOf(run: TestRun): string {
  return run.gameBuild?.gameBuildId ?? NO_VERSION
}

export function runsIn(runs: readonly TestRun[], bucket: string): TestRun[] {
  return runs.filter((run) => bucketOf(run) === bucket)
}

/** 칸마다 TR 수. 트리의 수 칸에 쓴다. */
export function countRuns(runs: readonly TestRun[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const run of runs) counts.set(bucketOf(run), (counts.get(bucketOf(run)) ?? 0) + 1)
  return counts
}

/**
 * 처음 고를 칸. 주소에 있는 칸이 아직 있으면 그것, 아니면 현재(가장 최근) 버전, 버전이 없으면 "버전 없음" 이다. TR 의
 * 버전이 라이브러리 목록에 없는 빌드(목록을 읽은 뒤 새로 생긴 빌드)를 가리켜도 그 칸은 있는 것으로 본다.
 */
export function initialBucket(
  requested: string | null,
  versions: readonly TestCaseVersionSummary[],
  runs: readonly TestRun[],
): string {
  const known = new Set([NO_VERSION, ...versions.map((version) => version.gameBuildId), ...runs.map(bucketOf)])
  if (requested !== null && known.has(requested)) return requested
  return versions.find((version) => version.latest)?.gameBuildId ?? versions[0]?.gameBuildId ?? NO_VERSION
}

/**
 * 라이브러리 버전 목록에 없는데 TR 이 가리키는 빌드. 트리에 따로 그려야 그 TR 이 사라지지 않는다.
 */
export function strayBuilds(runs: readonly TestRun[], versions: readonly TestCaseVersionSummary[]) {
  const known = new Set(versions.map((version) => version.gameBuildId))
  const seen = new Map<string, NonNullable<TestRun['gameBuild']>>()
  for (const run of runs) {
    if (run.gameBuild !== null && !known.has(run.gameBuild.gameBuildId)) seen.set(run.gameBuild.gameBuildId, run.gameBuild)
  }
  return [...seen.values()]
}

/**
 * QA 를 돌릴 게임이 TR 의 TC 버전과 다른 빌드인가(ARTEL-1049). 다르면 경고만 하고 막지 않는다 — 판정은 켜진 게임의 빌드에
 * 적힌다. editor 는 보고한 버전 문자열로 견준다(editor 판정은 같은 버전의 게임 빌드 몫이다). 어느 한쪽을 모르면 다르다고
 * 하지 않는다.
 */
export function versionMismatch(run: TestRun | undefined, instance: GameInstance | undefined): { run: string; game: string } | null {
  const runBuild = run?.gameBuild ?? null
  const gameBuild = instance?.lastGameBuild ?? null
  if (runBuild === null || gameBuild === null) return null
  const same = gameBuild.isEditor ? gameBuild.version === runBuild.version : gameBuild.gameBuildId === runBuild.gameBuildId
  return same ? null : { run: runBuild.label ?? runBuild.version, game: gameBuild.label ?? gameBuild.version }
}
