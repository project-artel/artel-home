import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { formatDateTime } from '../projects/formatters'
import { useWorkspace } from '../projects/workspace/workspaceContext'
import type { ContentMapSelection, ContentMapView } from './contentMapTypes'
import { ScreenMapCanvas } from './ScreenMapCanvas'
import { ScreenMapLegend } from './ScreenMapLegend'
import { buildScreenMap, layoutScreenMap } from './screenMapLayout'
import { useContentMap } from './useContentMap'

/**
 * 프로젝트 작업공간의 화면 지도 섹션.
 *
 * 빌드 하나를 골라 그 빌드의 씬과 화면을 중첩 다이어그램으로 본다. 고른 빌드는 `?build=` 에
 * 남는다 — 성능 섹션과 같은 관용구이고, 그래야 이 그림의 주소를 그대로 붙여 넣어 남에게
 * 보여 줄 수 있다.
 *
 * ## 왜 화면이 하나 더 늘었는가
 *
 * `/game-builds/:buildId/content-map` 에 이미 콘텐츠 맵 화면이 있다. 같은 응답을 읽지만 답하는
 * 질문이 다르다.
 *
 * | | 무엇을 그리나 | 질문 |
 * |---|---|---|
 * | 씬 그래프(기존) | `edges` | 이 게임의 구조가 어떻게 생겼나 |
 * | 화면 지도(여기) | `scenes[].screens` + `screenTransitions` | 실제로 어떻게 흘렀나 |
 *
 * 씬 하나에 화면이 여럿이라는 사실은 평면 그래프에 자리가 없다. 그것을 접으면 `Canvas/continue`
 * 가 켜진 화면과 꺼진 화면이 한 점이 되고, "continue 를 누른다"는 테스트 케이스가 절반은
 * 실패한다.
 */
export function ContentMapSection() {
  const { builds, projectId } = useWorkspace()
  const { t } = useI18n()
  const copy = t.contentMap.section
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedBuildId = searchParams.get('build')
  const selectedBuild = builds.find((build) => build.id === requestedBuildId) ?? builds[0]

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
          <h2>{copy.title}</h2>
          <p className="section-intro">{copy.subtitle}</p>
        </div>
        {selectedBuild !== undefined && (
          <label className="cm-build-picker">
            <span>{copy.selectLabel}</span>
            <select
              onChange={(event) => setSearchParams({ build: event.target.value })}
              value={selectedBuild.id}
            >
              {builds.map((build) => (
                <option key={build.id} value={build.id}>
                  {build.label === null || build.label.length === 0
                    ? build.version
                    : `${build.version} · ${build.label}`}
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
        <ScreenMapReport
          buildId={selectedBuild.id}
          key={selectedBuild.id}
          projectId={projectId}
        />
      )}
    </section>
  )
}

/**
 * 한 빌드의 화면 지도.
 *
 * 다섯 상태를 `useContentMap` 이 이미 가르고 있으므로 여기서는 그것을 그대로 따른다 —
 * 첫 로드만 화면을 비우고, 새로고침 중에는 직전 스냅샷이 남고, 끊긴 동안에는 마지막으로 읽은
 * 시각을 붙인다. 마지막 프레임을 라이브인 척하지 않는다는 `DESIGN.md` 규칙 그대로다.
 */
function ScreenMapReport({ buildId, projectId }: { buildId: string; projectId: string }) {
  const { t } = useI18n()
  const copy = t.contentMap
  const { view, status, fetchedAt, online, reload } = useContentMap(projectId, buildId)
  const refreshing = status === 'loading'

  if (refreshing && view === null) {
    return (
      <div aria-busy="true" className="panel">
        <p className="panel-empty">{copy.states.loading}</p>
      </div>
    )
  }

  if (status === 'error' && view === null) {
    return (
      <div className="panel-message" role="alert">
        <p className="panel-message-copy">{copy.states.loadFailed}</p>
        <button className="button button--secondary" onClick={reload} type="button">
          {copy.states.retry}
        </button>
      </div>
    )
  }

  if (view === null) return null

  const readAt = fetchedAt === 0 ? '' : formatDateTime(new Date(fetchedAt).toISOString())

  return (
    <div aria-busy={refreshing || undefined} className="cm-section-body">
      <div className="cm-section-actions">
        {readAt.length > 0 && <p className="cm-read-at">{copy.page.readAt(readAt)}</p>}
        <Link
          className="cm-section-link"
          to={`/projects/${encodeURIComponent(projectId)}/game-builds/${encodeURIComponent(buildId)}/content-map`}
        >
          {copy.section.sceneGraphLink}
        </Link>
        <button
          className="button button--secondary"
          disabled={refreshing}
          onClick={reload}
          type="button"
        >
          {refreshing ? copy.states.loading : copy.page.refresh}
        </button>
      </div>

      {!online && (
        <div className="cm-banner cm-banner--disconnected" role="status">
          <p className="cm-banner-title">{copy.states.offlineTitle}</p>
          <p className="cm-banner-copy">{copy.states.offlineCopy(readAt)}</p>
        </div>
      )}
      {online && !refreshing && status === 'error' && (
        <div className="cm-banner cm-banner--disconnected" role="status">
          <p className="cm-banner-title">{copy.states.staleTitle}</p>
          <p className="cm-banner-copy">{copy.states.staleCopy(readAt)}</p>
        </div>
      )}

      <ScreenMapBody view={view} />
    </div>
  )
}

/** 그림을 그릴지, 왜 못 그리는지. 세 빈 상태가 여기서 갈린다. */
function ScreenMapBody({ view }: { view: ContentMapView }) {
  const { t } = useI18n()
  const copy = t.contentMap

  // 한 번도 근거가 들어온 적 없다. 스캔은 씬 그래프 화면이 시키므로 그쪽을 가리킨다.
  if (view.contentMap === null) {
    return (
      <div className="panel-message">
        <h3>{copy.empty.neverUploadedTitle}</h3>
        <p className="panel-message-copy">{copy.empty.neverUploadedCopy}</p>
      </div>
    )
  }

  if (view.contentMap.ingestedAt === null) {
    return (
      <div className="panel-message">
        <h3>{copy.empty.notIngestedTitle}</h3>
        <p className="panel-message-copy">{copy.empty.notIngestedCopy}</p>
      </div>
    )
  }

  if (view.scenes.length === 0) {
    return (
      <div className="panel-message">
        <h3>{copy.empty.noScenesTitle}</h3>
        <p className="panel-message-copy">{copy.empty.noScenesCopy}</p>
      </div>
    )
  }

  return <ScreenMapView view={view} />
}

function ScreenMapView({ view }: { view: ContentMapView }) {
  const { t } = useI18n()
  const copy = t.contentMap.screenMap
  /**
   * 지금 고른 것.
   *
   * 인스펙터는 ARTEL-598 이 만든다. 여기서는 상태만 들고 있고 패널은 그리지 않는다 — 선택이
   * 캔버스 안에만 있으면 인스펙터가 붙는 날 그 상태를 밖으로 끌어내는 일부터 해야 한다.
   */
  const [selection, setSelection] = useState<ContentMapSelection | null>(null)

  // 배치가 비싼 부분이고 응답 말고는 아무것에도 기대지 않는다. 무언가를 고르는 것이 배치를
  // 다시 계산하게 두면, 클릭 한 번마다 그림 전체가 다시 놓인다.
  const model = useMemo(
    () => buildScreenMap(view.scenes, view.edges, view.screenTransitions),
    [view.edges, view.scenes, view.screenTransitions],
  )
  const layout = useMemo(() => layoutScreenMap(model), [model])

  return (
    <section aria-labelledby="cm-screen-map-title" className="panel cm-canvas-panel">
      <header className="panel-header">
        <h3 id="cm-screen-map-title">{copy.title}</h3>
        <p className="cm-canvas-note">
          {copy.counts(model.containers.length, model.screenCount, model.screenTransitions.length)}
        </p>
      </header>

      {/* 씬은 있는데 화면이 하나도 없다. 오류가 아니라 아직 QA 런이 없다는 뜻이고, 그 말을
          그림 위에 적어 두지 않으면 빈 컨테이너들이 그리다 만 화면으로 읽힌다. */}
      {model.screenCount === 0 && (
        <div className="cm-notice" role="status">
          <p className="cm-notice-title">{copy.noScreensTitle}</p>
          <p className="cm-notice-copy">{copy.noScreensCopy(model.containers.length)}</p>
        </div>
      )}

      <div className="cm-canvas-frame">
        <ScreenMapCanvas layout={layout} onSelect={setSelection} selection={selection} />
      </div>

      {model.unmappedScenes > 0 && (
        <p className="cm-canvas-note">{t.contentMap.graph.unmappedNote(model.unmappedScenes)}</p>
      )}

      <ScreenMapLegend model={model} />
    </section>
  )
}
