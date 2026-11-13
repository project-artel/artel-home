import { Button } from '../../../design-system/primitives/Button'
import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Dialog } from '../../../design-system/primitives/Dialog'
import { useI18n } from '../../../i18n/useI18n'
import { useTestCaseLabel } from '../../../testCases/testCaseIdentifiers'
import { CHANGE_KINDS, type ChangeKind, type ChangedCase } from './dashboardModel'

const TONE: Record<ChangeKind, string> = { BROKE: 'critical', STILL_FAILING: 'critical', FIXED: 'success', ADDED: 'muted', DROPPED: 'muted' }

/**
 * 이전 버전과 비교의 "바뀐 Test Case" 표(ARTEL-1387). 새로 깨짐 · 그대로 실패 · 고쳐짐 · 새 · 빠짐 순서로 줄을 세우고,
 * 위 단추로 한 갈래만 볼 수 있다. 줄을 누르면 라이브러리에서 그 Test Case 를 연다 — 빠진 Test Case 는 이전 버전에서.
 */
export function ChangedCasesDialog({
  changed,
  previous,
  current,
  libraryHref,
  onClose,
}: {
  changed: readonly ChangedCase[]
  previous: string
  current: string
  libraryHref: (change: ChangedCase) => string
  onClose: () => void
}) {
  const { t } = useI18n()
  const m = t.dashboard.changes
  const titleId = useId()
  const label = useTestCaseLabel()
  const [kind, setKind] = useState<ChangeKind | null>(null)
  const counts = useMemo(() => new Map(CHANGE_KINDS.map((one) => [one, changed.filter((change) => change.kind === one).length])), [changed])
  const shown = kind === null ? changed : changed.filter((change) => change.kind === kind)
  const status = (value: string | null) => (value === null ? m.none : (m.status[value] ?? value))

  return (
    <Dialog labelledBy={titleId} onClose={onClose} title={m.title(previous, current)}>
      <div className="db-changes-dialog">
        <div aria-label={m.colKind} className="db-periods" role="group">
          <button aria-pressed={kind === null} onClick={() => setKind(null)} type="button">
            {t.dashboard.picker.all} {changed.length}
          </button>
          {CHANGE_KINDS.filter((one) => (counts.get(one) ?? 0) > 0).map((one) => (
            <button aria-pressed={kind === one} key={one} onClick={() => setKind(one)} type="button">
              {m.kind[one]} {counts.get(one)}
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <p className="db-quiet">{m.empty}</p>
        ) : (
          <div className="db-changes-scroll">
            <table className="db-cmp-table db-changes-table">
              <thead>
                <tr>
                  <th scope="col">{m.colCase}</th>
                  <th scope="col">{m.colScene}</th>
                  <th scope="col">{m.colBefore}</th>
                  <th scope="col">{m.colNow}</th>
                  <th scope="col">{m.colKind}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((change) => (
                  <tr key={`${change.kind}-${change.testCase.id}`}>
                    <th scope="row">
                      <Link className="db-changes-case" title={m.open} to={libraryHref(change)}>
                        <span className="db-mono db-muted">{label(change.testCase.id)}</span>
                        <span className="db-ellipsis">{change.testCase.step}</span>
                      </Link>
                    </th>
                    <td className="db-ellipsis">{change.testCase.scene}</td>
                    <td>{status(change.before)}</td>
                    <td>{status(change.now)}</td>
                    <td>
                      <span className={`db-verdict db-verdict--${TONE[change.kind]}`}>{m.kind[change.kind]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="dialog-actions">
          <Button variant="secondary" onClick={onClose} type="button">
            {m.close}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
