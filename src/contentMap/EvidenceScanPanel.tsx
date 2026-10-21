import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { InfoHint } from '../design-system/primitives/InfoHint'
import { ProgressRing } from '../design-system/primitives/ProgressRing'
import { usePolling } from '../live/usePolling'
import { useProjectChange } from '../live/useProjectChange'
import { apiErrorMessage } from '../projects/apiErrorMessage'
import { formatDateTime, formatTime } from '../projects/formatters'
import { listGameInstances } from '../projects/gameApi'
import type { GameInstance } from '../projects/gameTypes'
import { ProjectApiError } from '../projects/projectApi'
import { useActionBinding } from '../projectAgent/bindings'
import {
  CONTENT_MAP_OVERWRITE_ACTION,
  CONTENT_MAP_SCAN_ACTION,
  CONTENT_MAP_SCAN_AND_GENERATE_ACTION,
} from '../projectAgent/specs/contentMap'
import {
  documentIngestState,
  scanElapsedSeconds,
  SCAN_PHASES,
  type ContentMapStreamState,
  type LastScan,
} from './contentMapTypes'
import type { ContentMapEventsState } from './useContentMapEvents'
import { readCarryOver } from './carryOverChoice'
import { testCaseLibraryPath, type GenerationBlock } from './contentMapTestCases'
import { generateContentMapTestCases } from './generateContentMapTestCases'
import { requestEvidenceScan } from './requestEvidenceScan'
import { scanPercent } from './scanProgress'
import { StudioIcon } from '../testScenarios/studioIcons'

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
  | { phase: 'running'; withTestCases: boolean }
  | { phase: 'requested' }
  /** 서버가 409 `scan_in_progress` 로 거절했다(ARTEL-1178). 실패가 아니다 — 남이 시킨 스캔의 진행을 보인다. */
  | { phase: 'alreadyRunning' }
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
  generationBlock,
  summary,
  defaultOpen,
}: {
  projectId: string
  buildId: string
  /** 페이지의 새로고침 횟수. 바뀌면 붙어 있는 게임도 다시 확인한다. */
  refreshToken: number
  /** `.../content-map/events` 구독 상태. 스캔 상태와 문서 적재 진행이 여기서 나온다. */
  events: ContentMapEventsState
  /** 이 빌드의 지도가 아직 TC 를 만들 수 없는 이유. agent 의 TC 덮어쓰기 action 이 막힘 이유로 쓴다. */
  generationBlock: GenerationBlock | null
  /** 근거 줄 왼쪽에 서는 빌드의 수 한 줄. 지도가 없으면 없다. */
  summary?: ReactNode
  /** 자세히(스캔 상태 · 문서 적재)를 처음부터 펼칠지. 지도가 아직 없을 때처럼 이 패널이 할 일의 전부일 때 켠다. */
  defaultOpen: boolean
}) {
  const { t } = useI18n()
  const copy = t.contentMap.scan
  const layoutCopy = t.contentMap.layout
  const [open, setOpen] = useState(defaultOpen)
  const inFlight = useRef(false)
  const [coolingDown, setCoolingDown] = useState(false)
  const detailsId = useId()
  const [instances, setInstances] = useState<InstancesState>({ status: 'loading' })
  const [selectedInstanceId, setSelectedInstanceId] = useState('')
  // 스캔 결과는 그것을 만든 새로고침 회차에 묶어 둔다. 새로고침하고 나면
  // 직전 회차의 "스캔을 요청했습니다" 는 더 이상 지금의 사실이 아니라서,
  // 그대로 두면 그 안내가 이후 모든 새로고침에 계속 붙어 있는다. 회차가
  // 다르면 렌더에서 idle 로 읽는다 — 이펙트에서 되돌리면 렌더가 한 번 더 돈다.
  const [scanRun, setScanRun] = useState<ScanRun>({ token: refreshToken, scan: IDLE_SCAN })
  const scan = scanRun.token === refreshToken ? scanRun.scan : IDLE_SCAN
  const instanceSelectId = useId()
  const [instancesRevision, setInstancesRevision] = useState(0)
  const instancesProject = useRef<string | null>(null)
  const instancesRequest = useRef<AbortController | null>(null)
  const invalidateInstances = () => setInstancesRevision((revision) => revision + 1)
  useProjectChange(projectId, 'GAME_INSTANCES', invalidateInstances)
  // SSE 재연결뿐 아니라 조회 실패와 누락된 알림도 복구하도록 주기적 재확인을 유지한다.
  usePolling(() => {
    if (instancesRequest.current === null) invalidateInstances()
  })

  useEffect(() => {
    const controller = new AbortController()
    instancesRequest.current = controller

    listGameInstances(projectId, controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) return
        instancesProject.current = projectId
        setInstances({
          status: 'ready',
          instances: loaded,
          checkedAt: new Date().toISOString(),
        })
      })
      .catch(() => {
        if (controller.signal.aborted) return
        const sameProject = instancesProject.current === projectId
        setInstances((previous) => sameProject && previous.status === 'ready'
          ? previous
          : { status: 'error', checkedAt: new Date().toISOString() })
      })
      .finally(() => {
        if (instancesRequest.current === controller) instancesRequest.current = null
      })

    return () => controller.abort()
  }, [projectId, refreshToken, instancesRevision])

  const connected =
    instances.status === 'ready' ? instances.instances.filter((game) => game.connected) : []
  // 고른 게임이 그 사이에 끊겼을 수 있다. 그때 고른 id 를 그대로 쓰면 셀렉트가
  // 어느 옵션과도 맞지 않아 빈칸으로 보이고, 버튼은 이미 없는 게임에 스캔을
  // 시킨다. 목록에 남아 있을 때만 유효한 선택으로 친다.
  const instanceId = connected.some((game) => game.id === selectedInstanceId)
    ? selectedInstanceId
    : connected[0]?.id ?? ''

  const blocked = describeBlock(instances, connected.length)
  // 게임이 아직 스캔하는 중이면 다시 누를 수 없다(ARTEL-1172). 요청이 받아들여진 뒤 버튼이 다시 켜져, 스캔이 도는 동안
  // 같은 빌드에 두 번째 스캔이 들어갔다.
  const scanInProgress = events.scan?.state === 'REQUESTED'
  const disabled = blocked !== null || scan.phase === 'running' || scanInProgress || coolingDown || instanceId === ''
  // 아직 확인 중이면 시각이 없다. 그때 blocked 는 반드시 'loading' 이므로 빈
  // 문자열이 문장 안으로 들어갈 일은 없다.
  const checkedAtLabel = instances.status === 'loading' ? '' : formatDateTime(instances.checkedAt)

  // noneConnected 만 "언제 기준인지" 를 함께 말해야 해서 copy.disabled 를
  // 이유로 그냥 색인할 수 없다.
  function blockedCopy(reason: BlockReason): string {
    if (reason === 'noneConnected') return copy.disabled.noneConnected(checkedAtLabel)
    return copy.disabled[reason]
  }

  /** 버튼과 agent 가 함께 쓴다. 실패 문구를 돌려줘 agent 가 오류로 전할 수 있게 한다. */
  async function start(withTestCases: boolean): Promise<{ failure: string | null }> {
    if (instanceId === '') return { failure: null }
    // 누르는 즉시 잠근다(ARTEL-1172). `disabled` 는 상태라 다음 그리기 전까지 버튼이 살아 있어, 빠르게 두 번 누르면 요청이
    // 두 건 나갔다. ref 는 같은 틱 안에서 바로 보인다. 끝나도 잠깐(SCAN_COOLDOWN_MS) 더 막는다 — 스캔 상태 SSE 가
    // `REQUESTED` 를 알려 오기 전의 틈에 다시 누르는 것을 막는다.
    if (inFlight.current) return { failure: null }
    inFlight.current = true
    setScanRun({ token: refreshToken, scan: { phase: 'running', withTestCases } })

    try {
      // 이어 넣기는 라이브러리 모달에서 마지막으로 고른 값을 따른다(ARTEL-1041).
      await requestEvidenceScan({
        projectId,
        gameBuildId: buildId,
        generateTestCases: withTestCases,
        carryOver: readCarryOver(),
      })
      setScanRun({ token: refreshToken, scan: { phase: 'requested' } })
      return { failure: null }
    } catch (error: unknown) {
      if (error instanceof ProjectApiError && error.code === SCAN_IN_PROGRESS) {
        setScanRun({ token: refreshToken, scan: { phase: 'alreadyRunning' } })
        return { failure: copy.alreadyRunning }
      }
      const message = error instanceof ProjectApiError ? apiErrorMessage(error, t) : copy.failed
      setScanRun({ token: refreshToken, scan: { phase: 'failed', message } })
      return { failure: message }
    } finally {
      setCoolingDown(true)
      window.setTimeout(() => {
        inFlight.current = false
        setCoolingDown(false)
      }, SCAN_COOLDOWN_MS)
    }
  }

  const scanButton = useRef<HTMLButtonElement>(null)
  const scanWithTestCasesButton = useRef<HTMLButtonElement>(null)

  // 두 스캔 버튼이 비활성일 때 보이는 이유를 그대로 돌려준다.
  function scanBlockedReason(): string | null {
    if (blocked !== null) return blockedCopy(blocked)
    if (scan.phase === 'running' || coolingDown) return copy.running
    if (scanInProgress) return t.contentMap.scanStatus.requested
    if (instanceId === '') return copy.noInstanceOption
    return null
  }

  async function runScan(withTestCases: boolean) {
    const outcome = await start(withTestCases)
    if (outcome.failure !== null) throw new Error(outcome.failure)
    return { queued: true, buildId }
  }

  useActionBinding(CONTENT_MAP_SCAN_ACTION, {
    target: () => scanButton.current,
    blocked: scanBlockedReason,
    run: () => runScan(false),
  })
  useActionBinding(CONTENT_MAP_SCAN_AND_GENERATE_ACTION, {
    target: () => scanWithTestCasesButton.current,
    blocked: scanBlockedReason,
    run: () => runScan(true),
  })
  // TC 를 덮어쓰는 버튼은 이 페이지에 없고 케이스 라이브러리의 생성 대화상자에 있다. 같은 호출을
  // 쓰고, 강조는 가장 가까운 "스캔하고 TC 생성" 버튼에 한다.
  useActionBinding(CONTENT_MAP_OVERWRITE_ACTION, {
    target: () => scanWithTestCasesButton.current,
    blocked: () => {
      if (generationBlock === 'notUploaded') return t.contentMap.empty.neverUploadedCopy
      if (generationBlock === 'noDocuments') return t.contentMap.empty.noDocumentsCopy
      if (generationBlock === 'notIngested') return t.contentMap.empty.notIngestedCopy
      return null
    },
    run: async () => {
      const created = await generateContentMapTestCases(projectId, buildId, readCarryOver(), true)
      return { buildId, ...created }
    },
  })

  return (
    <section className="cm-scan" aria-labelledby="cm-scan-title">
      {/*
        한 줄로 접힌 근거(ARTEL-1172). 게임 select 와 두 버튼은 늘 보인다 — agent 의 scan action 이 이 버튼을
        target 으로 잡고, 접혀서 사라지면 agent 가 가리킬 곳이 없다. 접히는 것은 스캔 상태 · 문서 적재의 자세한
        내용뿐이고, 그 요점은 접혀 있어도 이 줄의 `ScanBrief` 가 말한다.
      */}
      <div className="cm-scan-bar">
        <h2 className="cm-scan-title" id="cm-scan-title">
          {copy.title}
          <InfoHint>{copy.copy}</InfoHint>
        </h2>
        {summary}
        <ScanBrief announce={!open} events={events} />

        <div className="cm-scan-actions">
          <SdkStatus connected={connected} instances={instances} />
          {/* 고를 것이 있을 때만(ARTEL-1185). 한 대면 상태 줄이 그 이름을 말한다. */}
          {connected.length >= 2 && (
            <>
              <label className="visually-hidden" htmlFor={instanceSelectId}>
                {copy.instanceLabel}
              </label>
              <select
                className="field-input cm-scan-instance"
                disabled={scan.phase === 'running'}
                id={instanceSelectId}
                onChange={(event) => setSelectedInstanceId(event.target.value)}
                title={copy.instanceLabel}
                value={instanceId}
              >
                {connected.map((game) => (
                  <option key={game.id} value={game.id}>
                    {game.name}
                  </option>
                ))}
              </select>
            </>
          )}

          <button
            className="button button--primary button--compact"
            disabled={disabled}
            onClick={() => void start(false)}
            ref={scanButton}
            type="button"
          >
            {scan.phase === 'running' && !scan.withTestCases ? copy.running : copy.action}
          </button>
          {/* 스캔이 끝나 지도가 다 읽히면 서버가 그 빌드의 TC 도 만든다(ARTEL-1041). */}
          <button
            className="button button--secondary button--compact"
            disabled={disabled}
            onClick={() => void start(true)}
            ref={scanWithTestCasesButton}
            type="button"
          >
            {scan.phase === 'running' && scan.withTestCases ? copy.running : copy.actionWithTestCases}
          </button>
          <button
            aria-controls={detailsId}
            aria-expanded={open}
            className="button button--secondary button--compact cm-scan-toggle"
            onClick={() => setOpen((current) => !current)}
            type="button"
          >
            {open ? layoutCopy.detailsClose : layoutCopy.detailsOpen}
          </button>
        </div>
      </div>

      {/* 왜 못 누르는지. 버튼이 회색이라는 사실만으로는 아무것도 알려 주지
          않으므로, 이유와 다음에 할 일이 항상 함께 있다 — 접혀 있어도. */}
      {/* 확인 중·확인 실패는 상태 줄에 표시하고, 게임이 안 붙은 경우에만 다음 행동을 안내한다. */}
      {blocked !== null && blocked !== 'loading' && blocked !== 'loadFailed' && (
        <p className="cm-scan-blocked">
          {blocked === 'noneConnected' ? copy.sdk.offNote : blockedCopy(blocked)}
        </p>
      )}

      {scan.phase === 'requested' && (
        <p className="cm-outcome cm-outcome--notice">{copy.requested}</p>
      )}

      {/* 남이 시킨 스캔이 끝나면 버튼이 다시 켜지므로 안내도 함께 내린다. */}
      {scan.phase === 'alreadyRunning' && events.scan?.state === 'REQUESTED' && (
        <AlreadyRunning scan={events.scan} />
      )}

      {scan.phase === 'failed' && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>
          <span>{scan.message}</span>
        </div>
      )}

      {/* 접혀도 남긴다(`hidden`). 지우면 경과 초 · 문서 목록 상태가 펼 때마다 처음부터 다시 선다. */}
      <div className="cm-scan-details" hidden={!open} id={detailsId}>
        <section className="cm-scan-detail">
          <h3>{layoutCopy.detailScan}</h3>
          <ScanStatusPanel events={events} projectId={projectId} />
        </section>
        <section className="cm-scan-detail">
          <h3>{layoutCopy.detailIngest}</h3>
          <IngestStatus events={events} />
        </section>
        {/* 목록이 언제 기준인지. 게임이 하나 보이더라도 그것은 마지막으로
            확인한 시점의 사실일 뿐이라는 것을 같이 말한다. */}
        {instances.status !== 'loading' && (
          <section className="cm-scan-detail">
            <h3>{layoutCopy.detailInstances}</h3>
            <p className="cm-scan-copy">{copy.checkedAt(checkedAtLabel)}</p>
          </section>
        )}
      </div>

      {/* 요청이 받아들여졌다는 사실만 알린다. 실패는 바로 위 role="alert" 가
          이미 읽어 주므로 여기서 또 알리면 두 번 말하게 된다. */}
      <p aria-live="polite" className="visually-hidden">
        {scan.phase === 'requested' ? copy.requested : scan.phase === 'alreadyRunning' ? copy.alreadyRunning : ''}
      </p>
    </section>
  )
}

/**
 * 접힌 근거 줄의 요점: 스캔 상태 한 마디, 문서 적재 수, 실시간 연결(ARTEL-1172). 자세한 것은 펼침 안의
 * `ScanStatusPanel` · `IngestStatus` 가 그대로 말한다. 여기는 그것들이 접혀 있을 때 놓치면 안 되는 것만 —
 * 스캔이 실패했다, 문서가 밀렸다, 연결이 끊겼다.
 */
function ScanBrief({ events, announce }: { events: ContentMapEventsState; announce: boolean }) {
  const { t } = useI18n()
  const copy = t.contentMap.scanStatus
  const pendingCopy = t.contentMap.pending
  const now = useTickingNow(events.scan?.state === 'REQUESTED')
  const scan = events.scan
  const ingest = events.ingest

  return (
    // 펼쳐져 있으면 펼침 안의 상태 줄이 같은 것을 읽어 준다. 둘 다 live 면 한 번 바뀔 때 두 번 들린다.
    <p aria-live={announce ? 'polite' : 'off'} className="cm-scan-brief">
      {scan === null && <span className="cm-brief cm-brief--warning">{copy.unknownTitle}</span>}
      {scan !== null && scan !== undefined && scan.state === 'REQUESTED' && scanPercent(scan) !== null && (
        <ScanProgressBrief now={now} scan={scan} />
      )}
      {scan !== null && scan !== undefined && (scan.state !== 'REQUESTED' || scanPercent(scan) === null) && (
        <span className={`cm-brief cm-brief--${scanDotModifier(scan.state)}`}>
          <span aria-hidden="true" className={`cm-status-dot cm-status-dot--scan-${scanDotModifier(scan.state)}`} />
          {scan.state === 'REQUESTED'
            ? `${copy.requested} ${copy.elapsed(scanElapsedSeconds(scan, now))}`
            : scan.state === 'SUCCEEDED'
              ? copy.succeeded
              : copy.failed}
        </span>
      )}
      {ingest !== undefined && ingest.receivedDocuments > 0 && (
        <span className={`cm-brief mono${ingest.failedDocuments > 0 ? ' cm-brief--failed' : ''}`}>
          {pendingCopy.progressTitle(ingest.ingestedDocuments, ingest.receivedDocuments)}
          {ingest.failedDocuments > 0 && ` · ${pendingCopy.failedCount(ingest.failedDocuments)}`}
        </span>
      )}
      <span className={`cm-brief cm-brief--stream cm-brief--stream-${events.streamState}`}>
        <span aria-hidden="true" className="cm-stream-dot" />
        {streamStateLabel(copy, events.streamState)}
      </span>
    </p>
  )
}

/**
 * 도는 스캔의 진행 한 줄(ARTEL-1179): 작은 도넛 · 단계 · % · 지금 여는 씬 · 경과. 접혀 있어도 얼마나 남았는지 보인다.
 */
function ScanProgressBrief({ scan, now }: { scan: LastScan; now: number }) {
  const { t } = useI18n()
  const copy = t.contentMap.scanStatus
  const percent = scanPercent(scan) ?? 0
  const phase = copy.phases[scan.phase ?? 'SCANNING']
  const scene = scan.phase === 'SCANNING' ? scan.progress?.scene ?? null : null

  return (
    <span className="cm-brief cm-brief--progress">
      <ProgressRing label={copy.progressLabel(phase, percent)} percent={percent} size={18} />
      <span>{phase}</span>
      <span className="mono cm-brief-percent">{percent}%</span>
      {scene !== null && (
        <span className="mono cm-brief-scene" title={scene}>
          {scene}
        </span>
      )}
      <span className="mono cm-brief-elapsed">{copy.elapsed(scanElapsedSeconds(scan, now))}</span>
    </span>
  )
}

/**
 * 펼침 안의 진행(ARTEL-1179): 큰 도넛과 단계 줄. 지금 단계가 강조되고, 지난 단계는 흐리게, 남은 단계는 그대로 둔다.
 * TC 를 함께 만들지 않는 스캔에는 TC 생성 단계가 없다.
 */
function ScanProgressDetail({ scan }: { scan: LastScan }) {
  const { t } = useI18n()
  const copy = t.contentMap.scanStatus
  const percent = scanPercent(scan) ?? 0
  const current = scan.phase ?? 'SCANNING'
  const phases = SCAN_PHASES.filter((phase) => phase !== 'GENERATING_TEST_CASES' || scan.testCases !== null)
  const currentIndex = phases.indexOf(current)
  const progress = scan.progress

  return (
    <div className="cm-scan-progress">
      <ProgressRing label={copy.progressLabel(copy.phases[current], percent)} percent={percent} size={80} />
      <div className="cm-scan-progress-body">
        <ol className="cm-scan-phases">
          {phases.map((phase, index) => (
            <li
              aria-current={index === currentIndex ? 'step' : undefined}
              className={index < currentIndex ? 'is-done' : index === currentIndex ? 'is-current' : undefined}
              key={phase}
            >
              <span>{copy.phases[phase]}</span>
            </li>
          ))}
        </ol>
        {progress !== null && (
          <p className="cm-scan-progress-count mono">
            {current === 'SCANNING' ? copy.sceneCount(progress.done, progress.total) : copy.stepCount(progress.done, progress.total)}
          </p>
        )}
        {current === 'SCANNING' && progress?.scene != null && (
          <p className="cm-scan-progress-scene">
            <span>{copy.currentScene}</span> <code className="cm-code">{progress.scene}</code>
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * 409 `scan_in_progress` 안내(ARTEL-1179). 진행은 바로 옆 근거 줄과 펼침이 이미 보이므로 여기는 경고 아이콘과 두 줄뿐이다.
 */
function AlreadyRunning({ scan }: { scan: LastScan }) {
  const { t } = useI18n()
  const copy = t.contentMap.scan

  return (
    <div className="cm-already-running" role="status">
      <StudioIcon className="cm-already-running-icon" name="alert" size={18} />
      <div>
        <p className="cm-already-running-title">{copy.alreadyRunningTitle}</p>
        <p className="cm-already-running-detail">{copy.alreadyRunningDetail(scan.gameInstanceName)}</p>
      </div>
    </div>
  )
}

/**
 * SDK 연결 상태 한 줄(ARTEL-1185): 점 · 상태 · 언제 확인했는지. 목록은 몇 초마다 다시 읽는 스냅샷이라 "지금" 이 아니라
 * 확인한 시각을 함께 말한다.
 */
function SdkStatus({
  instances,
  connected,
}: {
  instances: InstancesState
  connected: readonly GameInstance[]
}) {
  const { t } = useI18n()
  const copy = t.contentMap.scan.sdk

  if (instances.status === 'loading') {
    return (
      <span className="cm-sdk cm-sdk--checking" role="status">
        <span aria-hidden="true" className="cm-sdk-dot" />
        <span className="cm-sdk-label">{copy.checking}</span>
      </span>
    )
  }

  const time = formatTime(instances.checkedAt)
  if (instances.status === 'error') {
    return (
      <span className="cm-sdk cm-sdk--failed" role="status">
        <span aria-hidden="true" className="cm-sdk-dot" />
        <span className="cm-sdk-label">{copy.failed}</span>
        <span className="cm-sdk-sub">{copy.failedAt(time)}</span>
      </span>
    )
  }

  if (connected.length === 0) {
    return (
      <span className="cm-sdk cm-sdk--off" role="status">
        <span aria-hidden="true" className="cm-sdk-dot" />
        <span className="cm-sdk-label">{copy.disconnected}</span>
        <span className="cm-sdk-sub">{copy.checkedAt(time)}</span>
      </span>
    )
  }

  return (
    <span className="cm-sdk cm-sdk--on" role="status">
      <span aria-hidden="true" className="cm-sdk-dot" />
      <span className="cm-sdk-label">{connected.length === 1 ? copy.connected : copy.connectedMany(connected.length)}</span>
      <span className="cm-sdk-sub">
        {connected.length === 1 ? copy.checkedOn(connected[0].name, time) : copy.checkedAt(time)}
      </span>
    </span>
  )
}

/** 스캔 요청이 끝난 뒤 같은 버튼을 다시 받기까지의 틈. */
const SCAN_COOLDOWN_MS = 2000

/** 같은 빌드에 스캔이 이미 돌고 있다는 서버 code(ARTEL-1178). */
const SCAN_IN_PROGRESS = 'scan_in_progress'

/** 왜 스캔을 시작할 수 없는지. null 이면 막는 것이 없다. */
type BlockReason = 'loading' | 'loadFailed' | 'noInstances' | 'noneConnected'

function describeBlock(instances: InstancesState, connectedCount: number): BlockReason | null {
  if (instances.status === 'loading') return 'loading'
  if (instances.status === 'error') return 'loadFailed'
  if (instances.instances.length === 0) return 'noInstances'
  if (connectedCount === 0) return 'noneConnected'
  return null
}

/**
 * 스캔 뒤 TC 생성 한 줄. 스캔이 실패해 TC 를 만들지 않았으면 `PENDING` 으로 남으므로, 그때는 "기다린다" 가 아니라
 * "만들지 않았다" 로 읽는다.
 */
function scanTestCasesLabel(
  copy: ReturnType<typeof useI18n>['t']['contentMap']['scanStatus']['testCases'],
  scanState: LastScan['state'],
  testCases: NonNullable<LastScan['testCases']>,
): string {
  if (testCases.state === 'GENERATED') return copy.generated(testCases.created ?? 0, testCases.carriedOver ?? 0)
  if (testCases.state === 'SKIPPED') return copy.skipped
  if (testCases.state === 'FAILED') return testCases.reason ?? copy.failed
  return scanState === 'REQUESTED' ? copy.pending : copy.notMade
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
 * 스캔 상태: `REQUESTED`·`SUCCEEDED`·`FAILED` 와 경과 시간. 도는 중이고 서버가 단계를 알려 주면 그 위에 도넛과 단계
 * 줄을 둔다(ARTEL-1179). 단계를 모르는 옛 서버면 지금처럼 경과 시간만이다.
 *
 * `scan === null` 은 "이 서버가 이 빌드의 스캔을 모른다"는 사실이고,
 * `contract-contentmap.md` 가 못 박은 대로 영원한 진행 중으로 그리지 않는다.
 */
function ScanStatusPanel({ events, projectId }: { events: ContentMapEventsState; projectId: string }) {
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
      {scan.state === 'REQUESTED' && scanPercent(scan) !== null && <ScanProgressDetail scan={scan} />}
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
      {scan.testCases !== null && (
        <p className={'cm-scan-tc' + (scan.testCases.state === 'FAILED' ? ' cm-scan-tc--failed' : '')}>
          <span>{scanTestCasesLabel(copy.testCases, scan.state, scan.testCases)}</span>
          {scan.testCases.state === 'GENERATED' && (
            <Link className="button button--secondary button--compact" to={testCaseLibraryPath(projectId, null)}>
              {copy.testCases.openLibrary}
            </Link>
          )}
        </p>
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
    <div className={`cm-pending${attention.length === 0 && failedDocuments === 0 ? ' is-complete' : ''}`}>
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
