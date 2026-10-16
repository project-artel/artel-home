import { useI18n } from '../../i18n/useI18n'
import { EMPTY_MARK, adminFormat } from '../shared/format'
import type { QaRunStatus, QaRunUsage } from './llmUsageTypes'
import { isPartiallyPriced, totalTokens } from './usage'
import { InfoHint } from '../../design-system/primitives/InfoHint'

const STATUS_TONES: Record<QaRunStatus, string> = {
  STARTING: 'active',
  RUNNING: 'active',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
}

/** 점은 보조 표시이고 뜻은 글자가 진다. 색만으로 상태를 말하지 않는다(DESIGN.md). */
function Status({ status }: { status: QaRunStatus }) {
  const { t } = useI18n()
  return (
    <span className="status">
      <span className={`status__dot status__dot--${STATUS_TONES[status]}`} aria-hidden="true" />
      {t.adminUsage.runs.statuses[status]}
    </span>
  )
}

function Value({ value }: { value: string | null }) {
  return value === null ? (
    <span className="muted">{EMPTY_MARK}</span>
  ) : (
    <span className="mono">{value}</span>
  )
}

/**
 * QA 실행 한 건씩의 토큰과 비용.
 *
 * 위의 축별 표와 기간 기준이 다르다 — 여기는 `qa_try.started_at`, 축별 표는 `llm_usage.called_at`
 * 이다. 런에 귀속시키는 목록이라 그 런이 **시작된** 구간에 들어가야 하고, 자정을 넘겨 도는 런의
 * 호출이 다음 날로 새면 런 하나가 두 날에 걸친다. 그래서 이 표의 합은 위 총계와 다를 수 있고,
 * 제목 옆에 그 사실을 적어 둔다.
 *
 * 호출 0건인 런을 지우지 않는다 — 지우면 "아직 배치가 안 왔다"와 "그런 런이 없다"가 같은 화면이
 * 된다. agent는 사용량을 모아 보내고 실패한 배치를 재시도하지 않으므로 0은 유실일 수도 있다.
 */
export function QaRunCosts({ runs }: { runs: QaRunUsage[] }) {
  const { t, locale } = useI18n()
  const strings = t.adminUsage
  const format = adminFormat(locale)
  return (
    <section aria-labelledby="usage-qa-runs">
      <div className="section__head">
        <h2 className="section__title" id="usage-qa-runs">
          {strings.runs.title}
          <InfoHint>{strings.runs.note}</InfoHint>
        </h2>
      </div>

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">{strings.runs.start}</th>
              <th scope="col">{strings.runs.status}</th>
              <th scope="col">{strings.runs.model}</th>
              <th scope="col">{strings.runs.reasoning}</th>
              <th scope="col" className="num">
                {strings.table.tokens}
              </th>
              <th scope="col" className="num">
                {strings.table.input}
              </th>
              <th scope="col" className="num">
                {strings.table.output}
              </th>
              <th scope="col" className="num">
                {strings.table.cost}
              </th>
              <th scope="col" className="num">
                {strings.table.calls}
              </th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const tokens = totalTokens(run.totals)
              return (
                <tr key={run.qaTryId}>
                  <td className="mono">{format.timestamp(run.startedAt)}</td>
                  <td>
                    <Status status={run.status} />
                  </td>
                  <td>
                    <Value value={run.model} />
                  </td>
                  <td>
                    <Value value={run.reasoningEffort} />
                  </td>
                  <td className="num" title={format.count(tokens)}>
                    {format.tokens(tokens)}
                  </td>
                  <td className="num" title={format.count(run.totals.inputTokens)}>
                    {format.tokens(run.totals.inputTokens)}
                  </td>
                  <td className="num" title={format.count(run.totals.outputTokens)}>
                    {format.tokens(run.totals.outputTokens)}
                  </td>
                  <td className="num">
                    {format.cost(run.totals.costUsd)}
                    {run.totals.costUsd !== null && isPartiallyPriced(run.totals) && (
                      <span
                        className="usage-partial"
                        title={strings.runs.partialCostHint(format.count(run.totals.pricedCalls))}
                      >
                        +
                      </span>
                    )}
                  </td>
                  <td className="num">
                    {run.totals.calls === 0 ? (
                      <span
                        className="muted"
                        title={strings.runs.zeroCallsHint}
                      >
                        0
                      </span>
                    ) : (
                      format.count(run.totals.calls)
                    )}
                  </td>
                </tr>
              )
            })}
            {runs.length === 0 && (
              <tr>
                <td colSpan={9} className="muted">{strings.runs.empty}                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
