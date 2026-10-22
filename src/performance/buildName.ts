import type { GameBuild } from '../projects/gameTypes'

/** 빌드 이름. 예전 선택 상자가 쓰던 모양 그대로다. */
export function buildName(build: GameBuild): string {
  return build.label ? `${build.version} · ${build.label}` : build.version
}
