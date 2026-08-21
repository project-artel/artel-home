import { useEffect, useId, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { apiErrorMessage } from '../projects/apiErrorMessage'
import { formatDateTime } from '../projects/formatters'
import { listGameInstances } from '../projects/gameApi'
import type { GameInstance } from '../projects/gameTypes'
import { ProjectApiError } from '../projects/projectApi'
import type { ContentMapView } from './contentMapTypes'
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
  view,
}: {
  projectId: string
  buildId: string
  /** 페이지의 새로고침 횟수. 바뀌면 붙어 있는 게임도 다시 확인한다. */
  refreshToken: number
  view: ContentMapView
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
      await requestEvidenceScan({ projectId, gameBuildId: buildId, gameInstanceId: instanceId })
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

      {view.pendingDocuments.length > 0 && <PendingDocuments view={view} />}

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

/**
 * 서버가 받았지만 아직 적재하지 않은 근거 문서.
 *
 * 여기에는 버튼이 없다. 적재는 서버가 스스로 하는 일이고, 이 목록은 지금
 * 보이는 맵이 완성본이 아니라는 사실의 근거일 뿐이다. 실패한 문서는 서버가
 * 쓴 문장을 그대로 달고 나온다 — 이 클라이언트는 그것을 다시 쓰지 않는다.
 */
function PendingDocuments({ view }: { view: ContentMapView }) {
  const { t } = useI18n()
  const copy = t.contentMap.pending

  // role="status" 를 달지 않는다. 페이지 상단의 저하 배너가 같은 두 문장을
  // 이미 읽어 주므로, 여기에도 달면 스크린 리더가 같은 말을 두 번 알린다.
  return (
    <div className="cm-pending">
      <p className="cm-pending-title">{copy.title(view.pendingDocuments.length)}</p>
      <p className="cm-pending-copy">{copy.copy}</p>
      <ul className="cm-pending-list">
        {view.pendingDocuments.map((document) => (
          <li key={document.documentId}>
            <span className="mono">{copy.documentLabel(document.documentId)}</span>
            <span className="cm-pending-state">
              {document.ingestFailedAt === null
                ? copy.waiting
                : copy.failedAt(formatDateTime(document.ingestFailedAt))}
            </span>
            <span className="cm-pending-state">
              {copy.receivedAt(formatDateTime(document.receivedAt))}
            </span>
            {document.ingestError !== null && (
              <span className="cm-pending-error">{document.ingestError}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
