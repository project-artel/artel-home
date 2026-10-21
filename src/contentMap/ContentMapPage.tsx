import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { EdgeScrollbar } from '../design-system/primitives/EdgeScrollbar'
import { InfoHint } from '../design-system/primitives/InfoHint'
import { LABEL_NODE_LIMIT } from '../knowledge/knowledgeLayout'
import { useKnowledgeGraph } from '../knowledge/useKnowledgeGraph'
import { formatDateTime } from '../projects/formatters'
import { gameBuildDetailHref } from '../projects/workspace/sections'
import { CanvasViewportControls } from './CanvasViewportControls'
import { ContentMapInspector } from './ContentMapInspector'
import { describeGenerationBlock } from './contentMapTestCases'
import { ContentMapTree } from './ContentMapTree.tsx'
import { CaptureHeader, ContentMapSummary, SummaryCounts } from './ContentMapSummary'
import type { ContentMapSelection, ContentMapView } from './contentMapTypes'
import { EvidenceScanPanel } from './EvidenceScanPanel'
import { indexScreenMap } from './screenInspection'
import { ScreenMapCanvas } from './ScreenMapCanvas'
import { ScreenMapLegend } from './ScreenMapLegend'
import { buildScreenMap, layoutScreenMap } from './screenMapLayout'
import { useCanvasViewport } from './useCanvasViewport'
import { useContentMap } from './useContentMap'
import { useContentMapEvents } from './useContentMapEvents'

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
 * - **empty** — 네 갈래다. `contentMap === null` 이면 한 번도 올린 적 없음,
 *   `ingestedAt === null` 이면서 `pendingDocuments` 도 비었으면 올라온 문서가 없음,
 *   `ingestedAt === null` 인데 `pendingDocuments` 가 있으면 올렸지만 아직 안 읽음, 그 밖에
 *   `scenes` 가 비었으면 읽었는데 씬이 없었음. 사용자가 할 일이 각각 달라서
 *   합치지 않는다.
 * - **degraded** — 맵은 있는데 아직 적재되지 않은 문서가 있다. `useContentMapEvents`
 *   가 스냅샷을 준 뒤로는 그 수를 쓰고, 그 전에만 GET 의 `pendingDocuments.length`
 *   로 대신한다(ARTEL-764) — 두 수를 동시에 보이면 새로고침 시점과 SSE 시점이
 *   어긋날 때 같은 사실을 다르게 말하게 된다. 보이는 것이 완성본이 아니라는
 *   뜻이고, 그 사실은 그림이 떠 있는 동안 계속 떠 있어야 한다.
 * - **disconnected** — 브라우저가 오프라인이거나, 스냅샷이 있는 채로
 *   새로고침이 실패했다. 마지막으로 읽은 맵은 남기되 읽은 시각을 붙인다 —
 *   마지막 프레임을 라이브인 척하지 않는다는 규칙 그대로다.
 */
export function ContentMapReport({
  buildId,
  projectId,
  about,
  buildPicker,
}: {
  buildId: string
  projectId: string
  /** 섹션이 무엇을 그리는지 한 문장. 머리 줄 InfoHint 에 이 화면의 설명과 함께 선다. */
  about: string
  /** 머리 줄 오른쪽에 서는 빌드 select. 섹션이 만든다(agent field binding 이 거기 있다). */
  buildPicker: ReactNode
}) {
  const { t } = useI18n()
  const copy = t.contentMap
  const { view, status, fetchedAt, online, reload, reloadToken } = useContentMap(projectId, buildId)
  // 화면이 마운트된 동안 계속 붙어 있는다. GET 의 로딩/에러 상태와 독립이다 —
  // 스캔과 문서 적재는 이 빌드를 볼 수 있는 한 언제든 움직일 수 있다.
  const events = useContentMapEvents(projectId, buildId)
  const refreshing = status === 'loading'

  // 머리 줄. 첫 로드 · 실패 화면에도 선다 — 빌드 select 가 여기 있어서, 빠지면 불러오는 동안 빌드를 바꿀 수 없다.
  // 제목은 작업공간 머리의 `화면 지도` 하나다(ARTEL-1172). 예전 H1 `콘텐츠 맵` 이 같은 화면에 두 번째 제목을 세웠다 —
  // 그 설명은 이 줄의 InfoHint 로 옮겼다. 돌아가는 곳은 이 빌드의 상세다(예전 링크는 이름과 달리 QA 실행으로 갔다).
  const meta = (readAt: string) => (
    <header className="cm-page-meta">
      <Link className="back-link" to={gameBuildDetailHref(projectId, buildId)}>
        {copy.page.back}
      </Link>
      <span className="cm-eyebrow mono">{copy.page.eyebrow(buildId)}</span>
      {readAt.length > 0 && <span className="cm-read-at">{copy.page.readAt(readAt)}</span>}
      <InfoHint>
        <span className="cm-about">{about}</span>
        <span className="cm-about">{copy.page.subtitle}</span>
      </InfoHint>
      <span className="cm-page-tools">{buildPicker}</span>
    </header>
  )

  // 첫 로드에만 화면을 비운다. 새로고침 중에는 직전 스냅샷이 그대로 남고
  // `aria-busy` 만 붙는다 — 살아 있는 갱신이 레이아웃을 흔들지 않는다.
  if (refreshing && view === null) {
    return (
      <section aria-busy="true" className="page content-map">
        {meta('')}
        <p className="panel-empty">{copy.states.loading}</p>
      </section>
    )
  }

  // 되돌아갈 스냅샷이 없는 실패. 화면에 놓을 것이 아무것도 없으므로 재시도만
  // 남는다. 스냅샷이 있는 실패는 아래에서 disconnected 로 다룬다.
  if (status === 'error' && view === null) {
    return (
      <section className="page content-map">
        {meta('')}
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
  // 아직 적재되지 않은 문서 수. SSE 가 스냅샷을 준 뒤로는 그 값이 산다 — GET
  // 의 `pendingDocuments` 와 SSE 의 `ingest` 가 같은 사실을 동시에 말하면
  // 새로고침 시점과 SSE 시점이 어긋날 때 두 수가 서로 다르게 보일 수 있다.
  // 연결 전(`events.ingest === undefined`)에만 GET 값을 쓴다.
  const notYetIngestedCount =
    events.ingest !== undefined
      ? events.ingest.receivedDocuments - events.ingest.ingestedDocuments - events.ingest.failedDocuments
      : view.pendingDocuments.length

  return (
    <section aria-busy={refreshing || undefined} className="page content-map">
      {meta(readAt)}

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
      {notYetIngestedCount > 0 && (
        <div className="cm-banner cm-banner--degraded" role="status">
          <p className="cm-banner-title">{copy.pending.title(notYetIngestedCount)}</p>
          <p className="cm-banner-copy">{copy.pending.copy}</p>
        </div>
      )}

      <EvidenceScanPanel
        buildId={buildId}
        // 지도를 그릴 수 없으면 이 패널이 화면의 전부다 — 처음부터 펼친다.
        defaultOpen={view.contentMap === null || view.contentMap.ingestedAt === null || view.scenes.length === 0}
        events={events}
        generationBlock={describeGenerationBlock(view)}
        projectId={projectId}
        refreshToken={reloadToken}
        summary={view.scenes.length > 0 ? <SummaryCounts view={view} /> : undefined}
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
    // 적재되지 않은 문서가 하나도 없으면 "올라왔지만 안 읽혔다" 는 거짓이다. 올라온 문서 자체가 없다.
    const hasUploadedDocument = describeGenerationBlock(view) !== 'noDocuments'
    return (
      <>
        <CaptureHeader view={view} />
        <section className="panel">
          <div className="panel-message">
            <h2>{hasUploadedDocument ? copy.empty.notIngestedTitle : copy.empty.noDocumentsTitle}</h2>
            <p className="panel-message-copy">
              {hasUploadedDocument ? copy.empty.notIngestedCopy : copy.empty.noDocumentsCopy}
            </p>
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

  return <SceneGraphView projectId={projectId} view={view} />
}

/**
 * 한 빌드의 지도, pane 셋으로.
 *
 * ```text
 * ┌──────────┬───────────────────────────┬─────────────┐
 * │   tree   │          canvas           │  inspector  │
 * │          │        (pan/zoom)         │   detail    │
 * └──────────┴───────────────────────────┴─────────────┘
 * ```
 *
 * 왼쪽은 고르는 곳이고 오른쪽은 고른 것이 뜨는 곳이다. 이 둘이 한 세로줄에 겹쳐 있으면 —
 * 예전 배치가 그랬다 — 목록에서 한 줄을 고를 때마다 답이 스크롤 위쪽에서 바뀌고, 1023px 아래에서는
 * 패널 전체가 캔버스 아래로 내려가 화면 밖에 있었다. 그러면 클릭 한 번에 그림만 반짝이고, 사용자는
 * 아무 일도 일어나지 않았다고 읽는다.
 *
 * tree 가 왼쪽인 이유는 그것이 접근성 경로이기 때문이다. 캔버스는 `aria-hidden` 에 포인터 전용이라
 * 키보드와 스크린 리더가 이 지도에 들어오는 문은 tree 하나뿐이고, 문은 뒤가 아니라 앞에 있어야 한다.
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
  // 화면이 많아 접힌 씬 중 펼친 것(ARTEL-1172). 접기 칸을 누르거나, 접혀 안 보이는 화면을 tree 에서 고르면 펼친다.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  // 화면 전이를 전부 그릴지. 처음엔 끈다 — 고른 것에 닿는 것만 그린다(ARTEL-1172).
  const [showScreenLinks, setShowScreenLinks] = useState(false)
  const layout = useMemo(() => layoutScreenMap(model, expanded), [model, expanded])
  const toggleScreens = useCallback((containerId: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (!next.delete(containerId)) next.add(containerId)
      return next
    })
  }, [])
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

  /*
   * 상세는 오른쪽에서 밀려 들어오는 넓은 패널이다(ARTEL-1172). 무엇을 고르면 열리고, 아무것도 안 고른 채로는
   * `이 빌드` 버튼으로 개요를 연다. 고정 세 번째 칸이던 때는 360px 에 갇혀 지도를 좁히고 글이 빽빽했다.
   * 패널이 지도를 덮지 않는 왼쪽은 그대로 눌러 다른 씬을 고를 수 있다 — 막는 막(scrim)을 두지 않는 이유다.
   */
  const [overviewOpen, setOverviewOpen] = useState(false)
  // 서랍의 스크롤 칸(`.cm-inspector`)에 서비스 막대를 단다. 서랍이 열릴 때마다 새 노드라 ref 콜백으로 받는다.
  const [drawerScroller, setDrawerScroller] = useState<HTMLElement | null>(null)
  const drawerRef = useCallback((node: HTMLElement | null) => {
    setDrawerScroller(node?.querySelector<HTMLElement>('.cm-inspector') ?? null)
  }, [])
  // 고른 화면이 접혀 안 보이면 그 씬을 펼친다 — tree 에서 고른 화면이 지도에 없으면 무엇을 골랐는지 안 보인다.
  const selectAndReveal = useCallback(
    (next: ContentMapSelection | null) => {
      setSelection(next)
      if (next?.kind !== 'screen') return
      const owner = layout.containers.find(
        (container) => container.toggle !== null && !container.screens.some((placed) => placed.screen.id === next.id) &&
          model.containers.some((candidate) => candidate.id === container.id && candidate.screens.some((screen) => screen.id === next.id)),
      )
      if (owner !== undefined) setExpanded((current) => new Set(current).add(owner.id))
    },
    [layout.containers, model.containers],
  )
  const drawerOpen = selection !== null || overviewOpen
  const close = useCallback(() => {
    setSelection(null)
    setOverviewOpen(false)
  }, [])
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen, close])

  return (
    <div className="cm-workspace">
      <aside className="panel cm-tree-pane">
        <ContentMapTree
          index={index}
          model={model}
          onSelect={selectAndReveal}
          selection={selection}
        />
      </aside>

      <section aria-labelledby="cm-graph-title" className="panel cm-canvas-panel">
        <header className="cm-canvas-head">
          <h2 id="cm-graph-title">
            {copy.title}
            <InfoHint>{t.contentMap.viewport.hint}</InfoHint>
          </h2>
          <p className="cm-canvas-note">
            {screenCopy.counts(
              model.containers.length,
              model.screenCount,
              model.screenTransitions.length,
            )}
          </p>
          <button
            aria-expanded={overviewOpen && selection === null}
            className="button button--secondary button--compact cm-overview-button"
            onClick={() => {
              setSelection(null)
              setOverviewOpen((current) => !(current && selection === null))
            }}
            type="button"
          >
            {t.contentMap.layout.overviewTitle}
          </button>
          {model.screenTransitions.length > 0 && (
            <button
              aria-pressed={showScreenLinks}
              className="button button--secondary button--compact cm-links-button"
              onClick={() => setShowScreenLinks((current) => !current)}
              title={t.contentMap.layout.screenLinksHint}
              type="button"
            >
              {showScreenLinks
                ? t.contentMap.layout.hideScreenLinks
                : t.contentMap.layout.showScreenLinks(model.screenTransitions.length)}
            </button>
          )}
          <CanvasViewportControls viewport={viewport} />
        </header>

        {/*
          지도가 화면의 몸통이다(ARTEL-1172). 안내는 그림을 아래로 밀지 않게 그림 위 왼쪽에 얹는다 — 예전에는 안내
          상자 둘이 쌓여 그림이 칸 아래쪽 300px 로 밀렸다.
        */}
        <div className="cm-canvas-frame">
          <ScreenMapCanvas
            layout={layout}
            onSelect={selectAndReveal}
            onToggleScreens={toggleScreens}
            showScreenLinks={showScreenLinks}
            selection={selection}
            viewport={viewport}
          />

          {(model.sceneEdges.length === 0 || model.screenCount === 0) && (
            <div className="cm-canvas-notices">
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
            </div>
          )}
        </div>

        <footer className="cm-canvas-foot">
          {model.unmappedScenes > 0 && (
            <p className="cm-canvas-note">{copy.unmappedNote(model.unmappedScenes)}</p>
          )}
          {model.containers.length > LABEL_NODE_LIMIT && (
            <p className="cm-canvas-note">{copy.labelNote}</p>
          )}
          {/* `details` 라 접혀도 DOM 에 남는다 — 범례는 `aria-hidden` 캔버스의 어휘를 글로 적는 유일한 곳이다. */}
          <details className="cm-legend-toggle">
            <summary>{t.contentMap.layout.legendOpen}</summary>
            <ScreenMapLegend model={model} />
          </details>
        </footer>
      </section>

      {drawerOpen && (
        <aside aria-label={t.contentMap.inspector.title} className="cm-drawer" ref={drawerRef}>
          <button aria-label={t.contentMap.layout.closeDetail} className="cm-drawer-close" onClick={close} type="button">
            ×
          </button>
          <EdgeScrollbar label={t.contentMap.inspector.title} scroller={drawerScroller} side="right" />
          <ContentMapInspector
            gaps={view.gaps}
            index={index}
            knowledge={{ status: knowledgeStatus, nodes: knowledgeGraph?.nodes ?? [] }}
            model={model}
            onClear={close}
            onSelect={selectAndReveal}
            overview={
              <section aria-labelledby="cm-overview-title" className="cm-overview">
                <h3 id="cm-overview-title">{t.contentMap.layout.overviewTitle}</h3>
                <ContentMapSummary view={view} />
                <CaptureHeader view={view} />
              </section>
            }
            selection={selection}
          />
        </aside>
      )}
    </div>
  )
}
