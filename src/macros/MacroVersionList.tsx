import { useMemo } from 'react'
import { useI18n } from '../i18n/useI18n'
import { buildOptionText } from '../projects/gameBuilds'
import type { GameBuild } from '../projects/gameTypes'
import { orderLibraryBuilds } from './macroLibrary'

/**
 * Macro 라이브러리 왼쪽의 "버전" 목록 (ARTEL-1102).
 *
 * 케이스 라이브러리의 `VersionList` 와 같은 줄 모양(`tcl-folder tcl-version`)과 같은 문구를
 * 쓴다. `VersionList` 를 그대로 쓰지 않은 이유는 그쪽이 버전 묶음 · 숨기기 · 폴더로 복제 ·
 * 끌어 놓기를 함께 지고 있어서다. macro 에는 그런 정리가 없고 읽기만 한다.
 *
 * 최신 game version build 에 `현재` 가 붙는다(`latestBuildId`). 수는 고른 build 에만 붙는다 —
 * 다른 build 의 agent macro 수를 알려면 build 마다 요청을 하나씩 보내야 해서 세지 않는다.
 */
export function MacroVersionList({
  builds,
  latestBuildId,
  onSelect,
  selectedCount,
  selectedId,
}: {
  builds: GameBuild[]
  latestBuildId: string | null
  onSelect: (buildId: string) => void
  /** 고른 build 의 macro 수. 아직 다 읽지 못했으면 `null` 이고 수를 그리지 않는다. */
  selectedCount: number | null
  selectedId: string
}) {
  const { t } = useI18n()
  const versionCopy = t.testCases.versions
  const editorLabel = t.projects.builds.editorLabel
  const ordered = useMemo(() => orderLibraryBuilds(builds), [builds])

  return (
    <section aria-label={versionCopy.heading} className="tcl-versions macro-versions">
      <div className="tcl-versions-head">
        <h2 className="tcl-folders-title">{versionCopy.heading}</h2>
      </div>
      <ul className="tcl-folder-list">
        {ordered.map((build) => {
          const current = build.id === selectedId
          const name = buildOptionText(build, editorLabel)
          return (
            <li key={build.id}>
              <button
                aria-current={current ? 'true' : undefined}
                className={'tcl-folder tcl-version' + (current ? ' is-current' : '')}
                onClick={() => onSelect(build.id)}
                type="button"
              >
                <span className="tcl-folder-name" title={name}>{name}</span>
                {build.id === latestBuildId && <span className="tcl-version-latest">{versionCopy.latest}</span>}
                {current && selectedCount !== null && (
                  <span className="tcl-folder-count">{selectedCount}</span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
