import { EMPTY_MARK } from '../shared/format'
import type { QaTryStatus, QaTrySummary } from './qaStatsTypes'
import { useQa } from './useQa'
import { InfoHint } from '../../design-system/primitives/InfoHint'

const STATUS_TONES: Record<QaTryStatus, string> = {
  STARTING: 'active',
  RUNNING: 'active',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
}

/** 점은 보조 표시이고 뜻은 글자가 진다. 색만으로 상태를 말하지 않는다(DESIGN.md). */
function Status({ status }: { status: QaTryStatus }) {
  const { t } = useQa()
  return (
    <span className="status">
      <span className={`status__dot status__dot--${STATUS_TONES[status]}`} aria-hidden="true" />
      {t.recent.statuses[status]}
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
 * 최근 런. 집계에서 개별 런으로 돌아가는 길이다 — 어떤 조합이 나쁘게 나왔을 때 그 조합으로 돈
 * 런을 실제로 열어 봐야 이유가 나온다.
 */
export function RecentRuns({ runs }: { runs: QaTrySummary[] }) {
  const { t, fmt } = useQa()
  return (
    <section aria-labelledby="recent-title">
      <div className="section__head">
        <h2 className="section__title" id="recent-title">
          {t.recent.title}
          <InfoHint>{t.recent.note}</InfoHint>
        </h2>
      </div>

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">{t.recent.start}</th>
              <th scope="col">{t.recent.status}</th>
              <th scope="col">{t.recent.model}</th>
              <th scope="col">{t.recent.reasoning}</th>
              <th scope="col">{t.recent.prompt}</th>
              <th scope="col">{t.recent.architecture}</th>
              {/* 라벨 bump를 잊은 변경을 갈라내는 값이라 라벨과 나란히 둔다. */}
              <th scope="col">{t.recent.fingerprint}</th>
              <th scope="col" className="num">
                {t.recent.runId}
              </th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td className="mono">{fmt.timestamp(run.startedAt)}</td>
                <td>
                  <Status status={run.status} />
                </td>
                <td>
                  <Value value={run.model} />
                </td>
                <td>
                  <Value value={run.reasoningEffort} />
                </td>
                <td>
                  <Value value={run.promptVersion} />
                </td>
                <td>
                  <Value value={run.agentArch} />
                </td>
                <td>
                  <Value value={run.agentFingerprint} />
                </td>
                <td className="num mono">{run.id}</td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">
                  {t.recent.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
