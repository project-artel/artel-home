import { useId, useMemo, useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { EdgeScrollbar } from '../design-system/primitives/EdgeScrollbar'
import { useI18n } from '../i18n/useI18n'
import type { TestCase } from '../testCases/testCaseTypes'
import { StudioIcon } from './studioIcons'

/**
 * 스텝에 붙일 TC 하나를 고른다(ARTEL-1115).
 *
 * 고를 수 있는 것은 편집기가 넘긴 TC 뿐이다 — 런이 빌드 버전을 따르면 그 버전에 든 TC 만 온다. 서버는 스텝의
 * `case_id` 를 검사하지 않고 저장하지만, QA 는 런 버전에 없는 TC 의 연결을 지운다. 그래서 다른 버전의 TC 는
 * 처음부터 보이지 않게 한다.
 *
 * 씬 · 내용 · 사전조건 · 기대 결과로 찾는다. 줄을 누르면 바로 연결하고 닫는다.
 */
export function CaseLinkDialog({
  cases,
  currentCaseId,
  scope,
  onPick,
  onClose,
}: {
  cases: ReadonlyMap<string, TestCase>
  currentCaseId: number | null
  /** 머리 아래에 적는 범위 — "1.1-e2e 버전의 TC" 처럼. */
  scope: string
  onPick: (caseId: number) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const b = t.scenarios.stepsEditor.board
  const statusLabel = t.scenarios.composition.status
  const titleId = useId()
  const [query, setQuery] = useState('')
  const [scroller, setScroller] = useState<HTMLUListElement | null>(null)

  const needle = query.replace(/`/g, '').trim().toLowerCase()
  const rows = useMemo(() => {
    const all = [...cases.values()].sort(
      (left, right) => (left.scene ?? '').localeCompare(right.scene ?? '') || Number(left.id) - Number(right.id),
    )
    if (needle === '') return all
    return all.filter((testCase) =>
      // 명세 글은 이름을 백틱으로 감싼다(`` `Canvas/Stage` 이(가) ``). 화면에는 백틱이 안 보이니 찾을 때도 뺀다.
      [testCase.scene, testCase.step, testCase.precondition, testCase.expectedValue]
        .some((part) => typeof part === 'string' && part.replace(/`/g, '').toLowerCase().includes(needle)),
    )
  }, [cases, needle])

  return (
    <Dialog labelledBy={titleId} onClose={onClose} title={b.pickTitle}>
      {/* 창은 body 로 뜬다. 판정 점 · 씬 칩이 편집기와 같게, 스튜디오 범위 이름을 함께 단다. */}
      <div className="scenario-studio studio-portal case-link">
        <p className="case-link-scope">{scope}</p>
        <label className="case-link-find">
          <StudioIcon name="search" size={15} />
          <span className="visually-hidden">{b.pickSearch}</span>
          <input
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            placeholder={b.pickSearch}
            type="search"
            value={query}
          />
          <span className="case-link-count">{b.matches(rows.length)}</span>
        </label>
        <div className="case-link-frame">
          {rows.length === 0 ? (
            <p className="case-link-empty">{b.pickEmpty}</p>
          ) : (
            <ul className="case-link-list" ref={setScroller}>
              {rows.map((testCase) => {
                const current = currentCaseId !== null && String(currentCaseId) === testCase.id
                return (
                  <li key={testCase.id}>
                    <button
                      aria-current={current || undefined}
                      className={`case-link-row${current ? ' is-current' : ''}`}
                      onClick={() => onPick(Number(testCase.id))}
                      type="button"
                    >
                      <span className="case-link-scene">{testCase.scene ?? '—'}</span>
                      <span className="case-link-step">{testCase.step.replace(/`/g, '')}</span>
                      <span className="case-link-verdict">
                        <span aria-hidden="true" className={`se-dot se-dot--${testCase.verificationStatus}`} />
                        {statusLabel[testCase.verificationStatus] ?? testCase.verificationStatus}
                      </span>
                      {current && <span className="case-link-current">{b.pickCurrent}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <EdgeScrollbar label={b.pickTitle} scroller={scroller} side="right" />
        </div>
      </div>
    </Dialog>
  )
}
