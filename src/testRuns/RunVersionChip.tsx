import { useI18n } from '../i18n/useI18n'
import { gameBuildName, type RunGameBuild } from './testRunApi'

/**
 * 이 TR 을 만든 게임 버전(ARTEL-995). 버전이 없는 TR 에는 아무것도 그리지 않는다 — "버전 없음" 을 줄마다
 * 적으면 옛 TR 이 많은 프로젝트의 목록이 그 말로 덮인다.
 */
export function RunVersionChip({ build }: { build: RunGameBuild | null }) {
  const { t } = useI18n()
  if (build === null) return null
  const name = gameBuildName(build)
  return (
    <span className="run-version-chip" title={t.scenarios.runList.versionTitle(build.version)}>
      {name}
    </span>
  )
}
