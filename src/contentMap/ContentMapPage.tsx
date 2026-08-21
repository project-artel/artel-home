import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { LABEL_NODE_LIMIT } from '../knowledge/knowledgeLayout'
import { formatDateTime } from '../projects/formatters'
import { CaptureHeader, ContentMapSummary } from './ContentMapSummary'
import type { ContentMapView } from './contentMapTypes'
import { EvidenceScanPanel } from './EvidenceScanPanel'
import { SceneGraphCanvas } from './SceneGraphCanvas'
import { SceneGraphInspector } from './SceneGraphInspector'
import { SceneGraphLegend } from './SceneGraphLegend'
import { buildSceneGraph, incidenceByNode, layoutSceneGraph } from './sceneGraphLayout'
import { useContentMap } from './useContentMap'

/**
 * 한 빌드의 콘텐츠 맵.
 *
 * 레일 밖의 독립 화면이다. 성능 화면과 같은 이유로 — 빌드 하나에 대해 묻는
 * 질문이고, 그림이 화면 폭을 전부 쓴다.
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
export function ContentMapRoute() {
  const { projectId = '', buildId = '' } = useParams()
  return <ContentMapReport buildId={buildId} projectId={projectId} />
}

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

      <ContentMapBody view={view} />
    </section>
  )
}

/** 업로드 패널 아래에 무엇을 그릴지. 세 가지 빈 상태가 여기서 갈린다. */
function ContentMapBody({ view }: { view: ContentMapView }) {
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
      <SceneGraphView view={view} />
      <CaptureHeader view={view} />
    </>
  )
}

function SceneGraphView({ view }: { view: ContentMapView }) {
  const { t } = useI18n()
  const copy = t.contentMap.graph
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  // 배치가 비싼 부분이고 응답 말고는 아무것에도 기대지 않는다. 씬을 고르는
  // 것이 배치를 다시 계산하게 두면 안 된다.
  const model = useMemo(() => buildSceneGraph(view.scenes, view.edges), [view.edges, view.scenes])
  const layout = useMemo(() => layoutSceneGraph(model), [model])
  const incidence = useMemo(() => incidenceByNode(model), [model])

  return (
    <div className="cm-workspace">
      <section aria-labelledby="cm-graph-title" className="panel cm-canvas-panel">
        <header className="panel-header">
          <h2 id="cm-graph-title">{copy.title}</h2>
        </header>

        {/* 씬은 있는데 아무것도 잇지 않는다. 흩어진 점들을 보고 사용자가
            혼자 결론 내리게 두지 않는다. */}
        {model.edges.length === 0 && (
          <div className="cm-notice" role="status">
            <p className="cm-notice-title">{copy.noEdgesTitle}</p>
            <p className="cm-notice-copy">{copy.noEdgesCopy(view.scenes.length)}</p>
          </div>
        )}

        <div className="cm-canvas-frame">
          <SceneGraphCanvas
            layout={layout}
            onSelectNode={setSelectedNodeId}
            selectedNodeId={selectedNodeId}
          />
        </div>

        {model.unmappedScenes > 0 && (
          <p className="cm-canvas-note">{copy.unmappedNote(model.unmappedScenes)}</p>
        )}
        {model.nodes.length > LABEL_NODE_LIMIT && (
          <p className="cm-canvas-note">{copy.labelNote}</p>
        )}

        <SceneGraphLegend model={model} />
      </section>

      <aside className="panel cm-inspector-panel">
        <SceneGraphInspector
          incidence={incidence}
          nodes={model.nodes}
          onClear={() => setSelectedNodeId(null)}
          onSelectNode={setSelectedNodeId}
          selectedNodeId={selectedNodeId}
        />
      </aside>
    </div>
  )
}
