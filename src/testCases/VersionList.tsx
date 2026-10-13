import { useI18n } from '../i18n/useI18n'
import { versionName, type TestCaseVersionSummary } from './testCaseVersions'

/**
 * 라이브러리 왼쪽 맨 위의 "버전" 묶음(ARTEL-1022). 최신 버전이 맨 위이고, 지금 버전에는 칩이 붙는다.
 * 버전을 고르면 그 버전의 TC 표를 본다. 줄 모양은 아래 폴더 tree(`tcl-folder`)와 같다.
 */
export function VersionList({
  onSelect,
  selectedId,
  versions,
}: {
  onSelect: (gameBuildId: string) => void
  selectedId: string | null
  versions: readonly TestCaseVersionSummary[]
}) {
  const { t } = useI18n()
  const m = t.testCases.versions
  return (
    <section aria-label={m.heading} className="tcl-versions">
      <h2 className="tcl-folders-title">{m.heading}</h2>
      <ul className="tcl-folder-list">
        {versions.map((version) => {
          const current = version.gameBuildId === selectedId
          return (
            <li key={version.gameBuildId}>
              <button
                aria-current={current ? 'true' : undefined}
                className={'tcl-folder tcl-version' + (current ? ' is-current' : '')}
                onClick={() => onSelect(version.gameBuildId)}
                type="button"
              >
                <span className="tcl-folder-name" title={versionName(version)}>{versionName(version)}</span>
                {version.latest && <span className="tcl-version-latest">{m.latest}</span>}
                <span className="tcl-folder-count">{version.total}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
