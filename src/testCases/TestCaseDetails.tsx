import { buildDisplayName } from '../projects/buildEnvironment'
import { useTestCaseLabel } from './testCaseIdentifiers'
import { useEffect, useId, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { formatDate } from '../projects/formatters'
import { SceneChip } from './SceneChip'
import { SpecGradeChip } from './SpecGradeChip'
import { getTestCase, getVerdictHistory, type CaseVerdictHistoryItem } from './testCaseApi'
import type { TestCase } from './testCaseTypes'

/** 상세 창과 호버 팝오버가 같은 버전의 전체 TC를 표시한다. */
export function TestCaseDetails({ projectId, caseId, gameBuildId = null }: {
  projectId: string
  caseId: string
  gameBuildId?: string | null
}) {
  const { t } = useI18n()
  const caseLabel = useTestCaseLabel()
  const m = t.scenarios.tcModal
  const titleId = useId()
  const statusLabel = t.scenarios.composition.status
  const [testCase, setTestCase] = useState<TestCase | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  // build 별 판정(ARTEL-995). 못 읽어도 카드는 그대로 보인다 — 이력은 덧붙이는 정보다.
  const [history, setHistory] = useState<CaseVerdictHistoryItem[]>([])

  useEffect(() => {
    const controller = new AbortController()
    getTestCase(projectId, String(caseId), controller.signal, { gameBuildId })
      .then((tc) => { if (!controller.signal.aborted) { setTestCase(tc); setState('ready') } })
      .catch((error) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return
        setState('error')
      })
    getVerdictHistory(projectId, String(caseId), controller.signal)
      .then((items) => { if (!controller.signal.aborted) setHistory(items) })
      .catch(() => {})
    return () => controller.abort()
  }, [projectId, caseId, gameBuildId])

  return <>
        {state === 'loading' && <p className="tc-modal-note">{m.loading}</p>}
        {state === 'error' && <p className="tc-modal-note">{m.error}</p>}
        {state === 'ready' && testCase !== null && (
          <div className="tc-modal-body">
            <h3 id={titleId} className="tc-modal-title">{testCase.step || m.untitled}</h3>
            <div className="tc-modal-tags">
              <span className="tc-id">{caseLabel(testCase.id)}</span>
              <SceneChip scene={testCase.scene} />
              <span className={`vpill ${testCase.verificationStatus}`}>
                <span className={`vdot ${testCase.verificationStatus}`} />{statusLabel[testCase.verificationStatus]}
              </span>
              {/* 명세 상태와 QA 검증 상태를 별도로 표시한다. */}
              <SpecGradeChip status={testCase.status} />
            </div>
            <p className="tc-modal-note">{t.testCases.outcome.addedAt(formatDate(testCase.createdAt))}</p>
            {testCase.origin !== undefined && <p className="tc-modal-note">{t.testCases.origin[testCase.origin]}</p>}
            <dl className="tc-modal-fields">
              {(['cheats', 'behaviors'] as const).map((axis) => {
                const selection = testCase.functions?.[axis] ?? 'all'
                return <div className="tc-field" key={axis}>
                  <dt className="tc-field-label">{t.gameFunctions.run[axis]}</dt>
                  <dd className="tc-field-val">{typeof selection === 'string' ? t.gameFunctions.choice[selection] : selection.join(', ') || t.gameFunctions.choice.none}</dd>
                </div>
              })}
              <div className="tc-field">
                <dt className="tc-field-label">{m.precondition}</dt>
                <dd className="tc-field-val">{testCase.precondition && testCase.precondition.length > 0 ? testCase.precondition : '—'}</dd>
              </div>
              <div className="tc-field">
                <dt className="tc-field-label">{m.expected}</dt>
                <dd className="tc-field-val">{testCase.expectedValue || '—'}</dd>
              </div>
              {testCase.evidenceGaps.length > 0 && (
                <div className="tc-field">
                  <dt className="tc-field-label">{m.evidenceGaps}</dt>
                  <dd className="tc-field-val">
                    <ul className="tc-gap-list">
                      {testCase.evidenceGaps.map((gap, index) => (
                        <li key={`${gap}-${index}`} className="tc-gap">{gap}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
              )}
              {/* 한 build의 이력도 버전 이름을 확인할 수 있도록 표시한다. */}
              {history.length > 0 && (
                <div className="tc-field">
                  <dt className="tc-field-label">{m.verdictHistory}</dt>
                  <dd className="tc-field-val">
                    <ul className="tc-gap-list">
                      {history.map((item) => {
                        const source = history.find((one) => one.gameBuildId === item.verdictCarriedFromBuildId)
                        return (
                          <li className="tc-gap" key={item.gameBuildId}>
                            <span className={`vdot ${item.verificationStatus}`} />{' '}
                            {historyName(item)}
                            {' · '}{statusLabel[item.verificationStatus]}
                            {item.verdictCarriedFromBuildId !== null &&
                              ` · ${m.carriedFrom(source === undefined ? null : historyName(source))}`}
                            {testCase.id === item.testCaseId && ` ${m.thisVersion}`}
                          </li>
                        )
                      })}
                    </ul>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}
  </>
}

function historyName(item: CaseVerdictHistoryItem): string {
  return buildDisplayName(item)
}
