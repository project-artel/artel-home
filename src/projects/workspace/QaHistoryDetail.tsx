import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { elapsedSeconds, getQaTryDetail, type QaTryDetail } from '../../qa/qaTryDetailApi'
import { formatCost } from '../../usage/format'
import { formatElapsedSeconds, PLACEHOLDER } from '../formatters'

type LoadStatus = 'loading' | 'ready' | 'gone' | 'error'

const counts = new Intl.NumberFormat()

/**
 * 펼쳐진 행 안쪽. 열릴 때 한 번 부르고 끝이다.
 *
 * **결과와 비용을 한 격자에 안 섞는다.** 이 화면이 먼저 답할 것은 "통과했나" 이고 "얼마였나" 는
 * 그 다음인데, 한 줄에 늘어놓으면 둘이 같은 무게로 읽힌다.
 *
 * 취소된 run 과 도는 중인 run 은 결과 자리에 수를 안 낸다. 앞쪽은 `stepsTotal` 이 없어 어떤
 * 분모도 지어낸 것이 되고, 뒤쪽은 여기 선 수가 열었을 때의 것이라 그대로 멈춰 있다.
 */
export function QaHistoryDetail({ qaTryId }: { qaTryId: string }) {
  const { t } = useI18n()
  const [detail, setDetail] = useState<QaTryDetail | null>(null)
  const [status, setStatus] = useState<LoadStatus>('loading')

  useEffect(() => {
    const controller = new AbortController()

    getQaTryDetail(qaTryId, controller.signal)
      .then((result) => {
        if (result === null) {
          setStatus('gone')
          return
        }
        setDetail(result)
        setStatus('ready')
      })
      .catch(() => {
        // 접힐 때 언마운트되며 취소된 요청이다. 상태를 쓰면 사라진 패널에 쓰는 것이 된다.
        if (controller.signal.aborted) return
        setStatus('error')
      })

    return () => controller.abort()
  }, [qaTryId])

  if (status === 'loading') {
    return <p className="panel-empty panel-empty--inset">{t.qa.history.detail.loading}</p>
  }

  if (status === 'gone') {
    return <p className="panel-empty panel-empty--inset">{t.qa.history.detail.gone}</p>
  }

  if (status === 'error' || detail === null) {
    return (
      <p className="inline-error inline-error--inset" role="alert">
        <span aria-hidden="true">!</span>
        {t.qa.history.detail.loadFailed}
      </p>
    )
  }

  return (
    <div className="run-detail">
      <div>
        <div className="run-detail-scenario">
          <div className="run-detail-name">{detail.scenarioTitle || PLACEHOLDER}</div>
          <div className="run-detail-model mono" translate="no">
            {runSettings(detail)}
          </div>
        </div>

        <RunDetailResult detail={detail} />
        <RunDetailCost detail={detail} />
      </div>

      <RunDetailTools detail={detail} />
    </div>
  )
}

/** `model · prompt v16 · high`. 없는 축은 조용히 빠진다. */
function runSettings(detail: QaTryDetail): string {
  const parts = [detail.model, detail.promptVersion, detail.reasoningEffort].filter(
    (part): part is string => part !== null && part !== '',
  )
  return parts.length === 0 ? PLACEHOLDER : parts.join(' · ')
}

/**
 * 이 run 이 게임에 대해 알아낸 것.
 *
 * 취소·진행 중일 때 수를 안 내는 것은 자리를 아끼려는 것이 아니다. 판정이 없다는 것 자체가
 * 그 run 의 답이고, 옆에 이슈 수라도 세워 두면 그것이 결과처럼 읽힌다.
 */
function RunDetailResult({ detail }: { detail: QaTryDetail }) {
  const { t } = useI18n()

  if (detail.status === 'CANCELLED' || detail.status === 'FAILED') {
    return (
      <section className="run-detail-group">
        <h3 className="run-detail-label">{t.qa.history.detail.resultGroup}</h3>
        <p className="run-detail-note">{t.qa.history.detail.cancelled}</p>
      </section>
    )
  }

  if (detail.stepsTotal === null) {
    return (
      <section className="run-detail-group">
        <h3 className="run-detail-label">{t.qa.history.detail.resultGroup}</h3>
        <p className="run-detail-note">{t.qa.history.detail.running}</p>
      </section>
    )
  }

  return (
    <section className="run-detail-group">
      <h3 className="run-detail-label">{t.qa.history.detail.resultGroup}</h3>
      <dl className="run-detail-facts">
        <Fact label={t.qa.history.detail.steps}>
          {counts.format(detail.stepsPassed ?? 0)}
          <span className="run-detail-denominator"> / {counts.format(detail.stepsTotal)}</span>
        </Fact>
        <Fact label={t.qa.history.detail.issues} quiet={detail.issues === 0} alert={detail.issues > 0}>
          {counts.format(detail.issues)}
        </Fact>
        <Fact label={t.qa.history.detail.feedback} quiet={detail.feedback === 0}>
          {counts.format(detail.feedback)}
        </Fact>
      </dl>
    </section>
  )
}

/**
 * 든 돈. 취소돼도 남는다 — 실제로 나간 돈이라 판정과 무관하다.
 *
 * 캐싱된 토큰은 입력 옆에 나란히 두지 않고 그 아래 막대로 "이 중" 이라고 말한다. 두 수를
 * 나란히 놓으면 더하고 싶어지는데, 더하면 같은 토큰을 두 번 센 수가 된다.
 */
function RunDetailCost({ detail }: { detail: QaTryDetail }) {
  const { t } = useI18n()
  const { usage } = detail
  const elapsed = elapsedSeconds(detail)
  const cachedPercent =
    usage.inputTokens === 0 ? 0 : Math.round((usage.cachedInputTokens / usage.inputTokens) * 100)

  return (
    <section className="run-detail-group">
      <h3 className="run-detail-label">{t.qa.history.detail.costGroup}</h3>
      <dl className="run-detail-facts">
        <Fact label={t.qa.history.detail.calls}>{counts.format(usage.calls)}</Fact>
        <Fact label={t.qa.history.detail.cost}>
          {formatCost(usage.costUsd, t.qa.history.detail.costUnknown)}
          {usage.costEstimated && <EstimatedChip />}
        </Fact>
        <Fact label={t.qa.history.detail.outputTokens}>{counts.format(usage.outputTokens)}</Fact>
        <Fact label={t.qa.history.detail.elapsed}>
          {elapsed === null ? PLACEHOLDER : formatElapsedSeconds(elapsed)}
        </Fact>

        <div className="run-detail-fact run-detail-fact--wide">
          <dt className="run-detail-fact-label">{t.qa.history.detail.inputTokens}</dt>
          <dd className="run-detail-fact-value mono">{counts.format(usage.inputTokens)}</dd>
          {usage.cachedInputTokens > 0 && (
            <div className="run-detail-nested">
              <div className="run-detail-nested-track">
                <div
                  className="run-detail-nested-fill"
                  style={{ inlineSize: `${Math.min(100, cachedPercent)}%` }}
                />
              </div>
              <div className="run-detail-nested-label">
                {t.qa.history.detail.cachedTokens(
                  counts.format(usage.cachedInputTokens),
                  cachedPercent,
                )}
              </div>
            </div>
          )}
        </div>
      </dl>
    </section>
  )
}

/**
 * 왜 추정인지는 한 줄로 안 적힌다. 칸 밑에 붙이면 매번 자리를 먹으면서 두 번째부터는 아무도
 * 안 읽으므로, 궁금한 사람이 가져다 댈 때만 편다.
 *
 * `tabIndex`가 붙은 것은 장식이 아니다 — 마우스로만 닿는 설명은 키보드 사용자에게 없는 것과
 * 같고, 이 칩이 붙은 금액은 청구액이 아니라는 것이 그 설명의 전부다.
 */
function EstimatedChip() {
  const { t } = useI18n()
  return (
    <span className="run-detail-chip" tabIndex={0}>
      {t.qa.history.detail.estimated}
      <span className="run-detail-tip" role="tooltip">
        {t.qa.history.detail.estimatedWhy}
      </span>
    </span>
  )
}

/**
 * 도구는 목록이 아니라 분포로 읽힌다. 이름만 늘어놓으면 19와 1이 같은 무게로 보인다.
 */
function RunDetailTools({ detail }: { detail: QaTryDetail }) {
  const { t } = useI18n()
  const total = detail.toolCalls.reduce((sum, call) => sum + call.calls, 0)
  const most = detail.toolCalls[0]?.calls ?? 0

  return (
    <section className="run-detail-tools">
      <div className="run-detail-tools-head">
        <h3 className="run-detail-label">{t.qa.history.detail.toolCalls}</h3>
        <span className="mono" translate="no">
          {counts.format(total)}
        </span>
      </div>

      {detail.toolCalls.length === 0 ? (
        <p className="run-detail-note">{t.qa.history.detail.noToolCalls}</p>
      ) : (
        <ul className="run-detail-tool-list">
          {detail.toolCalls.map((call) => (
            <li className="run-detail-tool" key={call.tool}>
              <span
                className="run-detail-tool-name"
                style={{ '--share': `${most === 0 ? 0 : (call.calls / most) * 100}%` } as React.CSSProperties}
              >
                <span className="mono" translate="no">
                  {call.tool}
                </span>
              </span>
              <span className="run-detail-tool-count mono">{counts.format(call.calls)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Fact({
  alert = false,
  children,
  label,
  quiet = false,
}: {
  alert?: boolean
  children: React.ReactNode
  label: string
  quiet?: boolean
}) {
  const tone = alert ? ' run-detail-fact-value--alert' : quiet ? ' run-detail-fact-value--quiet' : ''
  return (
    <div className="run-detail-fact">
      <dt className="run-detail-fact-label">{label}</dt>
      <dd className={`run-detail-fact-value mono${tone}`}>{children}</dd>
    </div>
  )
}
