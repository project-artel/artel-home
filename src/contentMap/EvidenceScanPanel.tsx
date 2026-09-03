import { useEffect, useId, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { apiErrorMessage } from '../projects/apiErrorMessage'
import { formatDateTime } from '../projects/formatters'
import { listGameInstances } from '../projects/gameApi'
import type { GameInstance } from '../projects/gameTypes'
import { ProjectApiError } from '../projects/projectApi'
import {
  documentIngestState,
  scanElapsedSeconds,
  type ContentMapStreamState,
  type LastScan,
} from './contentMapTypes'
import type { ContentMapEventsState } from './useContentMapEvents'
import { requestEvidenceScan } from './requestEvidenceScan'

/**
 * 근거를 다시 모으게 시키는 자리.
 *
 * 사람은 파일을 고르지 않는다. 스캔은 실행 중인 게임 안에서 돌고, SDK 가
 * 스스로 근거 문서를 올리고, 서버가 그것을 적재한다. 그래서 이 패널에 있는
 * 것은 버튼 하나와, 그 버튼을 누를 수 없을 때 왜 누를 수 없는지다.
 *
 * 비활성 이유를 네 가지로 나눠 말하는 이유는 사용자가 할 일이 각각 다르기
 * 때문이다 — 기다린다, 다시 불러온다, SDK 를 깐다, 게임을 켠다. "스캔할 수
 * 없습니다" 한 줄은 그 넷을 전부 지운다.
 */

type ScanState =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'requested' }
  | { phase: 'failed'; message: string }

const IDLE_SCAN: ScanState = { phase: 'idle' }

/** 어느 새로고침 회차에서 나온 스캔 결과인지. */
type ScanRun = { token: number; scan: ScanState }

/**
 * 붙어 있는 게임 목록의 상태.
 *
 * `checkedAt` 은 목록을 확인한 시각이다. `game.connected` 는 그때 한 번 읽은
 * 값일 뿐 계속 지켜보는 신호가 아니므로, 화면에는 "지금 붙어 있다" 가 아니라
 * "언제 기준으로 붙어 있었다" 로만 말할 수 있다.
 */
type InstancesState =
  | { status: 'loading' }
  | { status: 'ready'; instances: GameInstance[]; checkedAt: string }
  | { status: 'error'; checkedAt: string }

export function EvidenceScanPanel({
  projectId,
  buildId,
  refreshToken,
  events,
}: {
  projectId: string
  buildId: string
  /** 페이지의 새로고침 횟수. 바뀌면 붙어 있는 게임도 다시 확인한다. */
  refreshToken: number
  /** `.../content-map/events` 구독 상태. 스캔 상태와 문서 적재 진행이 여기서 나온다. */
  events: ContentMapEventsState
}) {
  const { t } = useI18n()
  const copy = t.contentMap.scan
  const [instances, setInstances] = useState<InstancesState>({ status: 'loading' })
  const [selectedInstanceId, setSelectedInstanceId] = useState('')
  // 스캔 결과는 그것을 만든 새로고침 회차에 묶어 둔다. 새로고침하고 나면
  // 직전 회차의 "스캔을 요청했습니다" 는 더 이상 지금의 사실이 아니라서,
  // 그대로 두면 그 안내가 이후 모든 새로고침에 계속 붙어 있는다. 회차가
  // 다르면 렌더에서 idle 로 읽는다 — 이펙트에서 되돌리면 렌더가 한 번 더 돈다.
  const [scanRun, setScanRun] = useState<ScanRun>({ token: refreshToken, scan: IDLE_SCAN })
  const scan = scanRun.token === refreshToken ? scanRun.scan : IDLE_SCAN
  const instanceSelectId = useId()

  useEffect(() => {
    const controller = new AbortController()

    listGameInstances(projectId, controller.signal)
      .then((loaded) =>
        setInstances({
          status: 'ready',
          instances: loaded,
          checkedAt: new Date().toISOString(),
        }),
      )
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setInstances({ status: 'error', checkedAt: new Date().toISOString() })
      })

    return () => controller.abort()
  }, [projectId, refreshToken])

  const connected =
    instances.status === 'ready' ? instances.instances.filter((game) => game.connected) : []
  // 고른 게임이 그 사이에 끊겼을 수 있다. 그때 고른 id 를 그대로 쓰면 셀렉트가
  // 어느 옵션과도 맞지 않아 빈칸으로 보이고, 버튼은 이미 없는 게임에 스캔을
  // 시킨다. 목록에 남아 있을 때만 유효한 선택으로 친다.
  const instanceId = connected.some((game) => game.id === selectedInstanceId)
    ? selectedInstanceId
    : connected[0]?.id ?? ''

  const blocked = describeBlock(instances, connected.length)
  const disabled = blocked !== null || scan.phase === 'running' || instanceId === ''
  // 아직 확인 중이면 시각이 없다. 그때 blocked 는 반드시 'loading' 이므로 빈
  // 문자열이 문장 안으로 들어갈 일은 없다.
  const checkedAtLabel = instances.status === 'loading' ? '' : formatDateTime(instances.checkedAt)

  // noneConnected 만 "언제 기준인지" 를 함께 말해야 해서 copy.disabled 를
  // 이유로 그냥 색인할 수 없다.
  function blockedCopy(reason: BlockReason): string {
    if (reason === 'noneConnected') return copy.disabled.noneConnected(checkedAtLabel)
    return copy.disabled[reason]
  }

  async function start() {
    if (instanceId === '') return
    setScanRun({ token: refreshToken, scan: { phase: 'running' } })

    try {
      await requestEvidenceScan({ projectId, gameBuildId: buildId })
      setScanRun({ token: refreshToken, scan: { phase: 'requested' } })
    } catch (error: unknown) {
      setScanRun({
        token: refreshToken,
        scan: {
          phase: 'failed',
          message: error instanceof ProjectApiError ? apiErrorMessage(error, t) : copy.failed,
        },
      })
    }
  }

  return (
    <section className="panel cm-scan" aria-labelledby="cm-scan-title">
      <header className="panel-header">
        <h2 id="cm-scan-title">{copy.title}</h2>
      </header>

      <p className="cm-scan-copy">{copy.copy}</p>

      <div className="cm-scan-actions">
        <div className="field cm-scan-field">
          <label className="field-label" htmlFor={instanceSelectId}>
            {copy.instanceLabel}
          </label>
          <select
            className="field-input"
            disabled={connected.length === 0 || scan.phase === 'running'}
            id={instanceSelectId}
            onChange={(event) => setSelectedInstanceId(event.target.value)}
            value={instanceId}
          >
            {connected.length === 0 ? (
              <option value="">{copy.noInstanceOption}</option>
            ) : (
              connected.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.name}
                </option>
              ))
            )}
          </select>
        </div>

        <button
          className="button button--primary"
          disabled={disabled}
          onClick={() => void start()}
          type="button"
        >
          {scan.phase === 'running' ? copy.running : copy.action}
        </button>
      </div>

      {/* 목록이 언제 기준인지. 게임이 하나 보이더라도 그것은 마지막으로
          확인한 시점의 사실일 뿐이라는 것을 같이 말한다. */}
      {instances.status !== 'loading' && (
        <p className="cm-scan-copy">{copy.checkedAt(checkedAtLabel)}</p>
      )}

      {/* 왜 못 누르는지. 버튼이 회색이라는 사실만으로는 아무것도 알려 주지
          않으므로, 이유와 다음에 할 일이 항상 함께 있다. */}
      {blocked !== null && <p className="cm-scan-blocked">{blockedCopy(blocked)}</p>}

      {scan.phase === 'requested' && (
        <p className="cm-outcome cm-outcome--notice">{copy.requested}</p>
      )}

      {scan.phase === 'failed' && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>
          <span>{scan.message}</span>
        </div>
      )}

      <ScanStatusPanel events={events} />
      <IngestStatus events={events} />

      {/* 요청이 받아들여졌다는 사실만 알린다. 실패는 바로 위 role="alert" 가
          이미 읽어 주므로 여기서 또 알리면 두 번 말하게 된다. */}
      <p aria-live="polite" className="visually-hidden">
        {scan.phase === 'requested' ? copy.requested : ''}
      </p>
    </section>
  )
}

/** 왜 스캔을 시작할 수 없는지. null 이면 막는 것이 없다. */
type BlockReason = 'loading' | 'loadFailed' | 'noInstances' | 'noneConnected'

function describeBlock(instances: InstancesState, connectedCount: number): BlockReason | null {
  if (instances.status === 'loading') return 'loading'
  if (instances.status === 'error') return 'loadFailed'
  if (instances.instances.length === 0) return 'noInstances'
  if (connectedCount === 0) return 'noneConnected'
  return null
}

/** 스캔 상태 label 이 밟는 세 갈래에 맞춰 상태 점 색을 고른다. */
function scanDotModifier(state: LastScan['state']): 'requested' | 'succeeded' | 'failed' {
  if (state === 'REQUESTED') return 'requested'
  if (state === 'SUCCEEDED') return 'succeeded'
  return 'failed'
}

/**
 * 이 stream 이 마지막으로 알려 준 것과 무관하게, 연결 자체가 지금 어떤지.
 * `t.qa.run.stream*` 과 같은 어휘를 이 트랙 안에서 따로 쓴다.
 */
function streamStateLabel(
  copy: ReturnType<typeof useI18n>['t']['contentMap']['scanStatus'],
  streamState: ContentMapStreamState,
): string {
  if (streamState === 'connecting') return copy.streamConnecting
  if (streamState === 'degraded') return copy.streamDegraded
  if (streamState === 'offline') return copy.streamOffline
  return copy.streamLive
}

/**
 * 초마다 갱신되는 현재 시각. `active` 가 꺼지면(스캔이 `REQUESTED` 를 벗어나면)
 * 타이머를 멈춘다 — `testRuns/RunChat.tsx` 의 `useElapsedSeconds` 와 같은
 * 모양이지만, 그 파일을 import 하지 않고 이 트랙 안에 따로 둔다.
 */
function useTickingNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active])
  return now
}

/**
 * 스캔 상태: `REQUESTED`·`SUCCEEDED`·`FAILED` 와 경과 시간뿐이다. **진행률
 * 막대를 두지 않는다** — `ScanState` 에 중간 진행이라는 개념 자체가 없다.
 *
 * `scan === null` 은 "이 서버가 이 빌드의 스캔을 모른다"는 사실이고,
 * `contract-contentmap.md` 가 못 박은 대로 영원한 진행 중으로 그리지 않는다.
 */
function ScanStatusPanel({ events }: { events: ContentMapEventsState }) {
  const { t } = useI18n()
  const copy = t.contentMap.scanStatus
  const now = useTickingNow(events.scan?.state === 'REQUESTED')

  // 첫 snapshot 을 아직 못 받았다 — connecting 이지 "스캔이 없다"가 아니다.
  if (events.scan === undefined) {
    return (
      <p aria-live="polite" className="cm-scan-connection mono">
        {streamStateLabel(copy, events.streamState)}
      </p>
    )
  }

  if (events.scan === null) {
    return (
      <div className="cm-outcome cm-outcome--notice" role="status">
        <p>{copy.unknownTitle}</p>
        <p>{copy.unknownCopy}</p>
        <p className="cm-scan-connection mono">{streamStateLabel(copy, events.streamState)}</p>
      </div>
    )
  }

  const scan = events.scan
  const elapsed = scanElapsedSeconds(scan, now)
  const stateLabel =
    scan.state === 'REQUESTED'
      ? copy.requested
      : scan.state === 'SUCCEEDED'
        ? copy.succeeded
        : copy.failed

  return (
    <div aria-live="polite" className="cm-scan-status" role="status">
      <p>
        <span
          aria-hidden="true"
          className={`cm-status-dot cm-status-dot--scan-${scanDotModifier(scan.state)}`}
        />
        <span>{stateLabel}</span>
        <span> {copy.onInstance(scan.gameInstanceName)}</span>
        <span className="mono"> {copy.elapsed(elapsed)}</span>
      </p>
      {scan.state === 'FAILED' && scan.error !== null && (
        <p className="cm-pending-error">{scan.error}</p>
      )}
      <p className="cm-scan-connection mono">{streamStateLabel(copy, events.streamState)}</p>
    </div>
  )
}

/**
 * 문서 적재 진행. **여기는 진행률 막대가 있다** — 분모(받은 문서 수)와
 * 분자(적재된 문서 수)가 둘 다 있는 것은 스캔이 아니라 이 진행뿐이다.
 *
 * 첫 snapshot 을 아직 못 받았으면(`events.ingest === undefined`) 아무것도
 * 그리지 않는다. 그 사이의 빈 자리는 `ContentMapPage` 상단 배너가 GET 스냅샷
 * 기준으로 이미 채운다 — 여기서 같은 사실을 GET 값으로 다시 그리면 SSE 가
 * 붙은 뒤에 두 수가 순간적으로 어긋나 보일 수 있다.
 *
 * 목록에는 아직 적재되지 않은 문서와 실패한 문서만 한 행씩 올린다. 이미
 * 적재된 문서까지 전부 행으로 그리면(빌드에 수백 개가 쌓일 수 있다) 정작
 * 봐야 할 두 상태가 그 밑에 묻힌다 — "적재됨" 이라는 사실은 위 진행률
 * 숫자가 이미 말하고 있다.
 */
function IngestStatus({ events }: { events: ContentMapEventsState }) {
  const { t } = useI18n()
  const copy = t.contentMap.pending

  if (events.ingest === undefined) return null

  const { receivedDocuments, ingestedDocuments, failedDocuments } = events.ingest

  if (receivedDocuments === 0) {
    return <p className="cm-scan-copy">{copy.noDocuments}</p>
  }

  const attention = [...events.documents.values()]
    .filter((document) => documentIngestState(document) !== 'ingested')
    .sort((left, right) => left.receivedAt.localeCompare(right.receivedAt))

  return (
    <div className="cm-pending">
      <p className="cm-pending-title">{copy.progressTitle(ingestedDocuments, receivedDocuments)}</p>
      <div
        aria-label={copy.progressLabel(ingestedDocuments, receivedDocuments)}
        aria-valuemax={receivedDocuments}
        aria-valuemin={0}
        aria-valuenow={ingestedDocuments}
        className="progress-track"
        role="progressbar"
      >
        <span
          className="progress-fill cm-ingest-fill"
          style={{ width: `${(ingestedDocuments / receivedDocuments) * 100}%` }}
        />
      </div>
      {failedDocuments > 0 && <p className="cm-ingest-failed-count">{copy.failedCount(failedDocuments)}</p>}

      {attention.length > 0 && (
        <ul className="cm-pending-list">
          {attention.map((document) => {
            const state = documentIngestState(document)
            return (
              <li key={document.documentId}>
                <span aria-hidden="true" className={`cm-status-dot cm-status-dot--doc-${state}`} />
                <span className="mono">{copy.documentLabel(document.documentId)}</span>
                <span className="cm-pending-state">
                  {state === 'failed' ? copy.documentFailed : copy.documentPending}
                </span>
                <span className="cm-pending-state">
                  {copy.receivedAt(formatDateTime(document.receivedAt))}
                </span>
                {document.ingestError !== null && (
                  <span className="cm-pending-error">{document.ingestError}</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
