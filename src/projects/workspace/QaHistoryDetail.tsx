import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import { QaFunctionOptionsSummary } from '../../qa/QaFunctionOptionsSummary'
import { elapsedSeconds, getQaTryDetail, type QaTryDetail } from '../../qa/qaTryDetailApi'
import type { QaTryVerdicts } from '../../qa/qaVerdictApi'
import { plainText, stepRows, tallyRows } from '../../qa/verdicts/verdictModel'
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
export function QaHistoryDetail({
  qaTryId,
  label,
  collapsible = false,
  verdicts,
  verdictsHref,
}: {
  qaTryId: string
  /**
   * 이 시나리오 실행의 판정(ARTEL-1135). 주면 결과 아래에 판정 근거 묶음이 선다. 판정은 시나리오 단위로 보는 것이라
   * 시나리오마다 이 자리에 둔다. `undefined` 면 아직 모르거나 근거를 안 보이는 화면이다.
   */
  verdicts?: QaTryVerdicts
  /** 판정 근거 페이지에서 이 시나리오로 거른 주소. 줄을 누르면 거기에 `try` · `step` 을 붙여 그 판정을 연다. */
  verdictsHref?: string
  /** 제목 위에 붙는 작은 표지(QA 히스토리의 "시나리오 1"). */
  label?: ReactNode
  /**
   * 제목 줄을 눌러 접고 펼친다(ARTEL-1100). 접으면 표지와 시나리오 제목만 남는다 — 시나리오가 여럿인
   * 실행에서 원하는 것만 펼쳐 보려는 것이다.
   */
  collapsible?: boolean
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(true)
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

  const heading = (
    <>
      {label !== undefined && <span className="run-detail-tag">{label}</span>}
      <span className="run-detail-name">{detail.scenarioTitle || PLACEHOLDER}</span>
      {open && (
        <span className="run-detail-model mono" translate="no">
          {runSettings(detail)}
        </span>
      )}
    </>
  )

  if (collapsible && !open) {
    return (
      <div className="run-detail run-detail--collapsed">
        <button aria-expanded={false} className="run-detail-scenario run-detail-toggle" onClick={() => setOpen(true)} type="button">
          <Chevron open={false} />
          <span className="run-detail-heading">{heading}</span>
        </button>
      </div>
    )
  }

  return (
    <div className="run-detail">
      <div>
        {collapsible ? (
          <button aria-expanded className="run-detail-scenario run-detail-toggle" onClick={() => setOpen(false)} type="button">
            <Chevron open />
            <span className="run-detail-heading">{heading}</span>
          </button>
        ) : (
          <div className="run-detail-scenario">{heading}</div>
        )}

        <RunDetailResult detail={detail} />
        {verdicts !== undefined && verdictsHref !== undefined && (
          <RunDetailVerdicts href={verdictsHref} scenario={verdicts} />
        )}
        <RunDetailCost detail={detail} />
        <QaFunctionOptionsSummary options={detail.functionOptions} />
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

  // 실패한 run 도 판정을 남긴다(스텝 · 케이스). 남겼으면 수를 보이고, 남기지 못했을 때만 문장으로 둔다 —
  // 취소와 같은 문장으로 묶으면 "취소" 라고 거짓말을 하게 된다(ARTEL-1100).
  if (detail.status === 'CANCELLED' || (detail.status === 'FAILED' && detail.stepsTotal === null)) {
    return (
      <section className="run-detail-group">
        <SectionTitle kind="result">{t.qa.history.detail.resultGroup}</SectionTitle>
        <p className="run-detail-note">
          {detail.status === 'CANCELLED' ? t.qa.history.detail.cancelled : t.qa.history.detail.failedNoResult}
        </p>
      </section>
    )
  }

  if (detail.stepsTotal === null) {
    return (
      <section className="run-detail-group">
        <SectionTitle kind="result">{t.qa.history.detail.resultGroup}</SectionTitle>
        <p className="run-detail-note">{t.qa.history.detail.running}</p>
      </section>
    )
  }

  return (
    <section className="run-detail-group">
      <SectionTitle kind="result">{t.qa.history.detail.resultGroup}</SectionTitle>
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

const FLAGGED_SHOWN = 3

/**
 * 이 시나리오의 스텝별 판정(ARTEL-1135): 스텝마다 한 칸짜리 띠, 이슈가 난 스텝과 그 뒤 실패 수, 먼저 볼 실패 몇 개.
 * 자세한 근거는 판정 근거 페이지에 있다 — 줄이나 버튼을 누르면 그 시나리오 · 스텝으로 열린다.
 */
function RunDetailVerdicts({ href, scenario }: { href: string; scenario: QaTryVerdicts }) {
  const { t } = useI18n()
  const copy = t.qa.verdicts
  const rows = stepRows(scenario)
  const tally = tallyRows(rows)
  if (tally.judged === 0) return null
  const issueRow = rows.find((row) => row.issues.length > 0)
  const failedAfter = issueRow === undefined ? 0 : rows.filter((row) => row.step > issueRow.step && row.state === 'failed').length
  const flagged = rows.filter((row) => row.verifying && row.state === 'failed')

  return (
    <section className="run-detail-group">
      <SectionTitle kind="evidence">{copy.entry.title}</SectionTitle>
      <div className="qh-steps">
        <div className="qh-steps-head">
          <span className="qh-muted mono">{copy.entry.tally(tally.passed, tally.failed)}</span>
        </div>
        <div aria-label={copy.navigator} className="qh-steps-strip" role="img">
          {rows.map((row) => (
            <span
              className={`qh-steps-cell qh-steps-cell--${row.verifying || row.state === 'failed' ? row.state : 'action'}${row.issues.length > 0 ? ' has-issue' : ''}`}
              key={row.step}
              title={`${row.step}. ${plainText(row.title)}`}
            />
          ))}
        </div>
        {issueRow !== undefined && <span className="qh-steps-issue">{copy.entry.issueLine(issueRow.step, failedAfter)}</span>}
        {flagged.length > 0 && (
          <ul className="qh-steps-list">
            {flagged.slice(0, FLAGGED_SHOWN).map((row) => (
              <li key={row.step}>
                <Link to={`${href}&step=${row.step}`}>
                  <span aria-hidden="true" className="qh-steps-x">✕</span>
                  <span className="qh-steps-text"><span className="qh-muted mono">{row.step}</span> {plainText(row.title)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link className="button button--secondary button--compact qh-steps-open" to={href}>{copy.entry.open}</Link>
      </div>
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
      <SectionTitle kind="cost">{t.qa.history.detail.costGroup}</SectionTitle>
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
              {/* 막대는 뺐다(ARTEL-1100). 길이가 캐시 적중률이라 어느 실행이든 97% 안팎으로 같았고,
                  사용량이 다섯 배 달라도 같은 막대로 그려져 비교하는 것처럼 읽혔다. */}
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
        <SectionTitle kind="tools">{t.qa.history.detail.toolCalls}</SectionTitle>
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

function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" className={`run-detail-chevron${open ? ' is-open' : ''}`} fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="14">
      <path d="M9 6l6 6l-6 6" />
    </svg>
  )
}

/**
 * 구역 제목(ARTEL-1100). 결과 · 비용 · 도구 호출이 같은 회색 글자로만 갈려 한 덩어리로 읽혀서,
 * 구역마다 색 타일 아이콘(Tabler: `checklist` · `coin` · `tool`)을 붙인다.
 */
const SECTION_ICONS = {
  result: 'M9.615 20h-2.615a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8 M14 19l2 2l4 -4 M9 8h4 M9 12h2',
  cost: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M14.8 9a2 2 0 0 0 -1.8 -1h-2a2 2 0 1 0 0 4h2a2 2 0 1 1 0 4h-2a2 2 0 0 1 -1.8 -1 M12 7v10',
  tools: 'M7 10h3v-3l-3.5 -3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1 -3 3l-6 -6a6 6 0 0 1 -8 -8l3.5 3.5',
  evidence: 'M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0 M21 21l-6 -6 M7 10l2 2l4 -4',
} as const

function SectionTitle({ kind, children }: { kind: keyof typeof SECTION_ICONS; children: ReactNode }) {
  return (
    <h3 className={`run-detail-label run-detail-label--${kind}`}>
      <span aria-hidden="true" className="run-detail-label-icon">
        <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="13">
          <path d={SECTION_ICONS[kind]} />
        </svg>
      </span>
      {children}
    </h3>
  )
}
