import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { LABEL_NODE_LIMIT } from '../knowledge/knowledgeLayout'
import { useKnowledgeGraph } from '../knowledge/useKnowledgeGraph'
import { formatDateTime } from '../projects/formatters'
import { CanvasViewportControls } from './CanvasViewportControls'
import { ContentMapInspector } from './ContentMapInspector'
import { CaptureHeader, ContentMapSummary } from './ContentMapSummary'
import type { ContentMapSelection, ContentMapView } from './contentMapTypes'
import { EvidenceScanPanel } from './EvidenceScanPanel'
import { indexScreenMap } from './screenInspection'
import { ScreenMapCanvas } from './ScreenMapCanvas'
import { ScreenMapLegend } from './ScreenMapLegend'
import { buildScreenMap, layoutScreenMap } from './screenMapLayout'
import { useCanvasViewport } from './useCanvasViewport'
import { useContentMap } from './useContentMap'

/**
 * 옛 주소를 지금의 콘텐츠 맵으로 넘긴다.
 *
 * `/projects/:projectId/game-builds/:buildId/content-map` 은 한때 이 화면 자체였고, 빌드
 * 패널의 링크와 사람들이 밖에 붙여 둔 주소가 아직 그곳을 가리킨다. 콘텐츠 맵이 작업공간의
 * 섹션 하나로 합쳐졌으므로 여기서는 빌드 id 만 `?build=` 로 옮겨 싣고 넘긴다.
 *
 * `replace` 인 이유는 이 주소가 목적지가 아니라 통로이기 때문이다. 히스토리에 남기면
 * 뒤로 가기가 리다이렉트를 다시 밟아 앞으로 튕긴다.
 */
export function ContentMapRedirect() {
  const { projectId = '', buildId = '' } = useParams()
  return (
    <Navigate
      replace
      to={`/projects/${encodeURIComponent(projectId)}/content-map?build=${encodeURIComponent(buildId)}`}
    />
  )
}

/**
 * 한 빌드의 콘텐츠 맵.
 *
 * ## 다섯 상태를 응답 어디에서 읽는가
 *
 * - **loading** — 이 `projectId:buildId` 의 스냅샷이 아직 없다.
 * - **error** — GET 이 실패했고 되돌아갈 스냅샷도 없다.
 * - **empty** — 세 갈래다. `contentMap === null` 이면 한 번도 올린 적 없음,
 *   `ingestedAt === null` 이면 올렸지만 아직 안 읽음, 둘 다 아닌데
 *   `scenes` 가 비었으면 읽었는데 씬이 없었음. 사용자가 할 일이 각각 달라서
 *   합치지 않는다.
 * - **degraded** — 맵은 있는데 `pendingDocuments` 가 비어 있지 않다. 보이는
 *   것이 완성본이 아니라는 뜻이고, 그 사실은 그림이 떠 있는 동안 계속 떠
 *   있어야 한다.
 * - **disconnected** — 브라우저가 오프라인이거나, 스냅샷이 있는 채로
 *   새로고침이 실패했다. 마지막으로 읽은 맵은 남기되 읽은 시각을 붙인다 —
 *   마지막 프레임을 라이브인 척하지 않는다는 규칙 그대로다.
 */
export function ContentMapReport({
  buildId,
  projectId,
}: {
  buildId: string
  projectId: string
}) {
  const { t } = useI18n()
  const copy = t.contentMap
  const { view, status, fetchedAt, online, reload, reloadToken } = useContentMap(projectId, buildId)
  const refreshing = status === 'loading'

  // 첫 로드에만 화면을 비운다. 새로고침 중에는 직전 스냅샷이 그대로 남고
  // `aria-busy` 만 붙는다 — 살아 있는 갱신이 레이아웃을 흔들지 않는다.
  if (refreshing && view === null) {
    return (
      <section aria-busy="true" className="page content-map">
        <p className="panel-empty">{copy.states.loading}</p>
      </section>
    )
  }

  // 되돌아갈 스냅샷이 없는 실패. 화면에 놓을 것이 아무것도 없으므로 재시도만
  // 남는다. 스냅샷이 있는 실패는 아래에서 disconnected 로 다룬다.
  if (status === 'error' && view === null) {
    return (
      <section className="page content-map">
        <div className="panel-message" role="alert">
          <p className="panel-message-copy">{copy.states.loadFailed}</p>
          <button className="button button--secondary" onClick={reload} type="button">
            {copy.states.retry}
          </button>
        </div>
      </section>
    )
  }

  if (view === null) return null

  const readAt = fetchedAt === 0 ? '' : formatDateTime(new Date(fetchedAt).toISOString())

  return (
    <section aria-busy={refreshing || undefined} className="page content-map">
      <header className="cm-page-head">
        <div>
          <Link className="back-link" to={`/projects/${encodeURIComponent(projectId)}/qa`}>
            {copy.page.back}
          </Link>
          <p className="cm-eyebrow mono">{copy.page.eyebrow(buildId)}</p>
          <h1>{copy.page.title}</h1>
          <p className="section-intro">{copy.page.subtitle}</p>
        </div>
        <div className="cm-page-actions">
          {readAt.length > 0 && <p className="cm-read-at">{copy.page.readAt(readAt)}</p>}
          <button
            className="button button--secondary"
            disabled={refreshing}
            onClick={reload}
            type="button"
          >
            {refreshing ? copy.states.loading : copy.page.refresh}
          </button>
        </div>
      </header>

      {/* 끊긴 상태. 아래 내용은 그대로 두되 지금의 사실인 척하지 않는다. */}
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

      {/* 저하 상태. 알림이 아니라 상시 조건이므로, 설명하는 그림이 떠 있는
          동안 함께 떠 있는다. */}
      {view.pendingDocuments.length > 0 && (
        <div className="cm-banner cm-banner--degraded" role="status">
          <p className="cm-banner-title">{copy.pending.title(view.pendingDocuments.length)}</p>
          <p className="cm-banner-copy">{copy.pending.copy}</p>
        </div>
      )}

      <EvidenceScanPanel
        buildId={buildId}
        projectId={projectId}
        refreshToken={reloadToken}
        view={view}
      />

      <ContentMapBody projectId={projectId} view={view} />
    </section>
  )
}

/** 업로드 패널 아래에 무엇을 그릴지. 세 가지 빈 상태가 여기서 갈린다. */
function ContentMapBody({ projectId, view }: { projectId: string; view: ContentMapView }) {
  const { t } = useI18n()
  const copy = t.contentMap

  // 한 번도 근거가 들어온 적 없다. 스캔 패널이 바로 위에 있으므로 여기서는
  // 왜 비어 있는지만 말한다.
  if (view.contentMap === null) {
    return (
      <section className="panel">
        <div className="panel-message">
          <h2>{copy.empty.neverUploadedTitle}</h2>
          <p className="panel-message-copy">{copy.empty.neverUploadedCopy}</p>
        </div>
      </section>
    )
  }

  // 근거는 들어왔지만 아직 적재되지 않았다. 로딩이 아니라 서버가 아직 하지
  // 않은 일이고, 위 패널의 밀린 문서 목록이 그 근거다.
  if (view.contentMap.ingestedAt === null) {
    return (
      <>
        <CaptureHeader view={view} />
        <section className="panel">
          <div className="panel-message">
            <h2>{copy.empty.notIngestedTitle}</h2>
            <p className="panel-message-copy">{copy.empty.notIngestedCopy}</p>
          </div>
        </section>
      </>
    )
  }

  // 읽혔는데 씬이 없다. 위와 결정적으로 다른 사실이라 문구도 다르다 —
  // 이것은 문서의 내용이지 기다리면 채워질 자리가 아니다.
  if (view.scenes.length === 0) {
    return (
      <>
        <CaptureHeader view={view} />
        <section className="panel">
          <div className="panel-message">
            <h2>{copy.empty.noScenesTitle}</h2>
            <p className="panel-message-copy">{copy.empty.noScenesCopy}</p>
          </div>
        </section>
      </>
    )
  }

  return (
    <>
      <ContentMapSummary view={view} />
      <SceneGraphView projectId={projectId} view={view} />
      <CaptureHeader view={view} />
    </>
  )
}

/**
 * 한 빌드의 지도, 캔버스 하나로.
 *
 * ## 왜 씬 그래프와 화면 지도가 한 캔버스인가
 *
 * 둘은 같은 것의 두 배율이다. `buildScreenMap` 은 `buildSceneGraph` 를 그대로 감싸므로
 * 컨테이너 id 는 씬 노드 id 와 같은 값이고, 씬 간선도 같은 간선이다. 화면이 0 개인 빌드에서
 * 이 그림은 예전 씬 그래프와 똑같이 생겼다 — 컨테이너 안이 비어 있을 뿐이다.
 *
 * 그래서 둘을 따로 두면 얻는 것이 없고 잃는 것이 분명하다. 같은 질문에 답하는 화면이 둘이면
 * 어느 쪽이 참인지 아무도 모르고, `screen_capability` 에 대해 편 논증이 그대로 적용된다.
 * 링크가 어디를 가리키느냐에 따라 사용자가 화면을 볼 수도, 못 볼 수도 있는 상태가 특히 나쁘다 —
 * 화면이 안 보이는 쪽에 도착한 사람은 그것을 "아직 기록이 없다"로 읽는다.
 */
function SceneGraphView({ projectId, view }: { projectId: string; view: ContentMapView }) {
  const { t } = useI18n()
  const copy = t.contentMap.graph
  const screenCopy = t.contentMap.screenMap
  const [selection, setSelection] = useState<ContentMapSelection | null>(null)

  // 배치가 비싼 부분이고 응답 말고는 아무것에도 기대지 않는다. 씬을 고르는
  // 것이 배치를 다시 계산하게 두면 안 된다.
  const model = useMemo(
    () => buildScreenMap(view.scenes, view.edges, view.screenTransitions),
    [view.edges, view.scenes, view.screenTransitions],
  )
  const layout = useMemo(() => layoutScreenMap(model), [model])
  const viewport = useCanvasViewport(layout.viewBox)

  // 인스펙터가 고른 것 하나를 되짚는 색인. 배치와 같은 이유로 응답 말고는 아무것에도 기대지
  // 않는다 — 고르는 동작이 색인을 다시 만들게 두면 클릭 한 번마다 응답 전체를 다시 돈다.
  const index = useMemo(() => indexScreenMap(model), [model])

  /**
   * 화면에 묶인 지식.
   *
   * 콘텐츠 맵과 다른 조회에서 온다. 실패해도 그림은 그대로 그려지고 지식 절만 못 읽었다고
   * 말한다 — 못 읽은 것을 "묶인 지식이 없다"로 접으면 화면이 게임에 대해 거짓말을 한다.
   */
  const { graph: knowledgeGraph, status: knowledgeStatus } = useKnowledgeGraph(projectId)

  return (
    <div className="cm-workspace">
      <section aria-labelledby="cm-graph-title" className="panel cm-canvas-panel">
        <header className="panel-header">
          <h2 id="cm-graph-title">{copy.title}</h2>
          <p className="cm-canvas-note">
            {screenCopy.counts(
              model.containers.length,
              model.screenCount,
              model.screenTransitions.length,
            )}
          </p>
        </header>

        {/* 씬은 있는데 아무것도 잇지 않는다. 흩어진 점들을 보고 사용자가
            혼자 결론 내리게 두지 않는다. */}
        {model.sceneEdges.length === 0 && (
          <div className="cm-notice" role="status">
            <p className="cm-notice-title">{copy.noEdgesTitle}</p>
            <p className="cm-notice-copy">{copy.noEdgesCopy(view.scenes.length)}</p>
          </div>
        )}

        {/* 씬은 있는데 화면이 하나도 없다. 오류가 아니라 아직 QA 런이 없다는 뜻이고, 그 말을
            그림 위에 적어 두지 않으면 빈 컨테이너들이 그리다 만 화면으로 읽힌다. */}
        {model.screenCount === 0 && (
          <div className="cm-notice" role="status">
            <p className="cm-notice-title">{screenCopy.noScreensTitle}</p>
            <p className="cm-notice-copy">{screenCopy.noScreensCopy(model.containers.length)}</p>
          </div>
        )}

        <CanvasViewportControls viewport={viewport} />

        <div className="cm-canvas-frame">
          <ScreenMapCanvas
            layout={layout}
            onSelect={setSelection}
            selection={selection}
            viewport={viewport}
          />
        </div>

        <p className="cm-canvas-note">{t.contentMap.viewport.hint}</p>

        {model.unmappedScenes > 0 && (
          <p className="cm-canvas-note">{copy.unmappedNote(model.unmappedScenes)}</p>
        )}
        {model.containers.length > LABEL_NODE_LIMIT && (
          <p className="cm-canvas-note">{copy.labelNote}</p>
        )}

        <ScreenMapLegend model={model} />
      </section>

      <aside className="panel cm-inspector-panel">
        <ContentMapInspector
          gaps={view.gaps}
          index={index}
          knowledge={{ status: knowledgeStatus, nodes: knowledgeGraph?.nodes ?? [] }}
          model={model}
          onClear={() => setSelection(null)}
          onSelect={setSelection}
          selection={selection}
        />
      </aside>
    </div>
  )
}
