import { buildDisplayName } from '../../projects/buildEnvironment'
import type { GameBuild, InstanceBuild } from '../../projects/gameTypes'

/** 서버가 판정 대상으로 정한 build의 이름만 표시한다. 오래된 instance의 이름을 다른 build에 붙이지 않는다. */
export function versionCaseBuildName(gameBuildId: string | null | undefined, builds: readonly GameBuild[], instanceBuild: InstanceBuild | null): string | null {
  if (gameBuildId == null) return null
  const build = builds.find((candidate) => candidate.id === gameBuildId)
  if (build !== undefined) return buildDisplayName(build)
  if (instanceBuild?.gameBuildId === gameBuildId) return buildDisplayName(instanceBuild)
  return null
}
