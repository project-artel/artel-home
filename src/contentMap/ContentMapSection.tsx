import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { InfoHint } from '../design-system/primitives/InfoHint'
import { buildOptionText, selectBuild } from '../projects/gameBuilds'
import { useWorkspace } from '../projects/workspace/workspaceContext'
import { useFieldBinding } from '../projectAgent/bindings'
import { CONTENT_MAP_BUILD_FIELD } from '../projectAgent/specs/contentMap'
import { ContentMapReport } from './ContentMapPage'

/**
 * 프로젝트 작업공간의 화면 지도 섹션.
 *
 * 빌드 하나를 골라 그 빌드의 씬과 화면을 중첩 다이어그램으로 본다. 고른 빌드는 `?build=` 에
 * 남는다 — 성능 섹션과 같은 관용구이고, 그래야 이 그림의 주소를 그대로 붙여 넣어 남에게
 * 보여 줄 수 있다.
 *
 * ## 콘텐츠 맵 화면은 여기 하나다
 *
 * `/game-builds/:buildId/content-map` 이 이 주소로 넘어온다. 한때 그 경로에는 씬만 그리는
 * 그래프가, 여기에는 화면까지 그리는 지도가 따로 있었다. 같은 응답을 읽고 같은 질문에 답하는
 * 화면이 둘이면 링크가 어디를 가리켰느냐에 따라 화면이 보이기도 하고 안 보이기도 하는데,
 * 안 보이는 쪽에 도착한 사람은 그것을 "아직 기록이 없다"로 읽는다. 지금은 한 벌이다.
 *
 * 빌드를 고르는 일만 여기 남고, 그림과 인스펙터는 `ContentMapReport` 가 진다.
 */
export function ContentMapSection() {
  const { builds, projectId } = useWorkspace()
  const { t } = useI18n()
  const copy = t.contentMap.section
  const editorLabel = t.projects.builds.editorLabel
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedBuildId = searchParams.get('build')
  const selectedBuild = selectBuild(builds, requestedBuildId)

  const buildSelect = useRef<HTMLSelectElement>(null)

  // agent 가 빌드를 고르는 길. 셀렉트의 onChange 와 같은 주소 갱신을 쓴다.
  useFieldBinding(CONTENT_MAP_BUILD_FIELD, {
    target: () => buildSelect.current,
    read: () => selectedBuild?.id ?? null,
    options: () => builds.map((build) => ({ value: build.id, label: buildOptionText(build, editorLabel) })),
    write: (value) => setSearchParams({ build: String(value) }),
  })

  // 주소가 늘 고른 빌드를 말하게 한다. `replace` 라 기본 빌드가 채워지는 것이 뒤로 가기
  // 한 걸음을 잡아먹지 않는다.
  useEffect(() => {
    if (selectedBuild === undefined || requestedBuildId === selectedBuild.id) return
    setSearchParams({ build: selectedBuild.id }, { replace: true })
  }, [requestedBuildId, selectedBuild, setSearchParams])

  return (
    <section className="cm-section">
      <header className="cm-section-head">
        <div>
          <h2>
            {copy.title}
            <InfoHint>{copy.subtitle}</InfoHint>
          </h2>
        </div>
        {selectedBuild !== undefined && (
          <label className="cm-build-picker">
            <span>{copy.selectLabel}</span>
            <select
              ref={buildSelect}
              onChange={(event) => setSearchParams({ build: event.target.value })}
              value={selectedBuild.id}
            >
              {builds.map((build) => (
                <option key={build.id} value={build.id}>
                  {buildOptionText(build, editorLabel)}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {selectedBuild === undefined ? (
        <div className="panel-message">
          <h3>{copy.noBuildsTitle}</h3>
          <p className="panel-message-copy">{copy.noBuildsCopy}</p>
        </div>
      ) : (
        <ContentMapReport
          buildId={selectedBuild.id}
          key={selectedBuild.id}
          projectId={projectId}
        />
      )}
    </section>
  )
}
