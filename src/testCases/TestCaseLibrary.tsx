import { useMemo, useState } from 'react'
import { ConfirmActionDialog } from '../design-system/primitives/ConfirmActionDialog'
import type { Messages } from '../i18n/messages'
import { useI18n } from '../i18n/useI18n'
import { formatDate } from '../projects/formatters'
import type { GameBuild } from '../projects/gameTypes'
import { ProjectApiError } from '../projects/projectApi'
import { SceneChip } from './SceneChip'
import { SpecGradeChip } from './SpecGradeChip'
import { deleteTestCase } from './testCaseApi'
import { TestCaseEditor } from './TestCaseEditor'
import {
  countScenes,
  describeVerifiedBuild,
  hasActiveFilters,
  NO_FILTERS,
  selectTestCases,
  tallyTestCases,
  type TestCaseFilters,
  type TestCaseSort,
  type TestCaseTally,
} from './testCaseLibrary'
import { VERIFICATION_STATUSES, type TestCase, type VerificationStatus } from './testCaseTypes'
import { useTestCaseLibrary } from './useTestCaseLibrary'

/** `vdot` 와 결과 pill 이 상태마다 쓰는 CSS 접미사. 대문자 상태값을 클래스에 그대로 넣지 않는다. */
const STATUS_CLASS: Record<VerificationStatus, string> = {
  VERIFIED: 'verified',
  DRAFT: 'draft',
  BROKEN: 'broken',
}

/**
 * 프로젝트의 재사용 테스트 케이스를 한자리에 모아 보고 고치는 화면.
 *
 * 기본 정렬이 "실패 먼저" 인 것이 이 화면의 입장이다. 케이스는 수백 건이 되고 그중 사람이
 * 볼 일이 있는 것은 깨진 것과 아직 확인 못 한 것뿐이라, 통과한 케이스를 위에 두면 스크롤이
 * 곧 그 화면의 사용법이 된다.
 *
 * 결과 칸이 보여 주는 값은 케이스에 기록된 `verificationStatus` 와 `lastVerifiedBuildId` 다.
 * QA 런이 스텝마다 내린 판정은 `qa_try_score` 안에만 있고 케이스 단위로 내주는 endpoint 가
 * 아직 없어서, 여기서는 그것을 흉내 내지 않고 기록된 검증 상태를 그대로 적는다.
 */
export function TestCaseLibrary({
  builds,
  projectId,
}: {
  builds: GameBuild[]
  projectId: string
}) {
  const { t } = useI18n()
  const m = t.testCases

  const library = useTestCaseLibrary(projectId)
  const [filters, setFilters] = useState<TestCaseFilters>(NO_FILTERS)
  const [sort, setSort] = useState<TestCaseSort>('FAILING_FIRST')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<TestCase | null>(null)
  // 편집기는 고른 케이스가 바뀔 때마다 다시 마운트되므로, 안내 문구를 그 안에 두면
  // 새 케이스를 추가한 직후 그 문구가 마운트와 함께 사라져 screen reader 에 닿지 않는다.
  const [announcement, setAnnouncement] = useState('')

  const shown = useMemo(
    () => selectTestCases(library.cases, filters, sort),
    [library.cases, filters, sort],
  )
  const scenes = useMemo(() => countScenes(library.cases), [library.cases])
  const tally = useMemo(() => tallyTestCases(library.cases), [library.cases])

  const selected = library.cases.find((testCase) => testCase.id === selectedId) ?? null

  function startCreating() {
    setSelectedId(null)
    setCreating(true)
  }

  function select(testCase: TestCase) {
    setCreating(false)
    setSelectedId(testCase.id)
  }

  if (library.status === 'loading') {
    return (
      <div className="section-single">
        <section className="panel" aria-busy="true">
          <p className="panel-empty">{m.section.loading}</p>
        </section>
      </div>
    )
  }

  if (library.status === 'failed') {
    return (
      <div className="section-single">
        <section className="panel">
          <div className="panel-message" role="alert">
            <p>{m.section.loadFailed}</p>
            <button className="button button--secondary" onClick={library.reload} type="button">
              {m.section.retry}
            </button>
          </div>
        </section>
      </div>
    )
  }

  const filtered = hasActiveFilters(filters)

  return (
    <div className="tcl">
      <section className="panel tcl-list-panel" aria-label={m.section.title}>
        <header className="panel-header panel-header--split">
          <h2>{m.section.title}</h2>
          <button
            className="button button--primary button--compact"
            onClick={startCreating}
            type="button"
          >
            {m.section.newCase}
          </button>
        </header>
        <p className="section-intro">{m.section.subtitle}</p>

        <div className="tcl-filters">
          <label className="tcl-filter tcl-filter--grow">
            <span className="field-label">{m.filters.search}</span>
            <input
              className="field-input"
              onChange={(event) => setFilters({ ...filters, query: event.target.value })}
              placeholder={m.filters.searchPlaceholder}
              type="search"
              value={filters.query}
            />
          </label>

          <label className="tcl-filter">
            <span className="field-label">{m.filters.scene}</span>
            <select
              className="field-input"
              onChange={(event) => setFilters({ ...filters, scene: event.target.value })}
              value={filters.scene}
            >
              <option value="">{m.filters.allScenes}</option>
              {scenes.map(({ count, scene }) => (
                <option key={scene} value={scene}>{m.filters.sceneOption(scene, count)}</option>
              ))}
            </select>
          </label>

          <label className="tcl-filter">
            <span className="field-label">{m.filters.sort}</span>
            <select
              className="field-input"
              onChange={(event) => setSort(event.target.value as TestCaseSort)}
              value={sort}
            >
              <option value="FAILING_FIRST">{m.filters.sortFailingFirst}</option>
              <option value="NEWEST">{m.filters.sortNewest}</option>
            </select>
          </label>
        </div>

        <div className="tcl-status-row">
          <span className="field-label">{m.filters.status}</span>
          <div className="tcl-chips">
            <button
              className={filters.status === 'ALL' ? 'fchip on' : 'fchip'}
              onClick={() => setFilters({ ...filters, status: 'ALL' })}
              type="button"
            >
              {m.filters.allStatuses} {tally.total}
            </button>
            {VERIFICATION_STATUSES.map((status) => (
              <button
                className={filters.status === status ? 'fchip on' : 'fchip'}
                key={status}
                onClick={() => setFilters({ ...filters, status })}
                type="button"
              >
                <span className={`vdot vdot--${STATUS_CLASS[status]}`} />
                {m.outcome[status]} {countOf(tally, status)}
              </button>
            ))}
          </div>
          <span className="tcl-shown">{m.section.shownOf(shown.length, tally.total)}</span>
        </div>

        {shown.length === 0 ? (
          <div className="panel-empty-block">
            <p className="panel-empty">{filtered ? m.section.emptyFiltered : m.section.empty}</p>
            {filtered && (
              <button
                className="button button--secondary button--compact"
                onClick={() => setFilters(NO_FILTERS)}
                type="button"
              >
                {m.section.clearFilters}
              </button>
            )}
          </div>
        ) : (
          <ul className="tcl-rows">
            {shown.map((testCase) => (
              <li key={testCase.id}>
                <button
                  aria-current={testCase.id === selectedId ? true : undefined}
                  className={
                    testCase.id === selectedId ? 'tcl-row tcl-row--selected' : 'tcl-row'
                  }
                  onClick={() => select(testCase)}
                  title={m.row.open}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className={`vdot vdot--${STATUS_CLASS[testCase.verificationStatus]}`}
                  />
                  <span className="tcl-row-main">
                    <span className="tcl-row-title">
                      {testCase.step.length > 0 ? testCase.step : m.row.untitled}
                    </span>
                    <span className="tcl-row-meta">
                      <SceneChip scene={testCase.scene} />
                      <SpecGradeChip status={testCase.status} quietWhenSettled />
                      <span className="tcl-row-expected">
                        {testCase.expectedValue.length > 0
                          ? testCase.expectedValue
                          : m.row.noExpectedValue}
                      </span>
                    </span>
                  </span>
                  <span className="tcl-row-outcome">
                    <span
                      className={`tcl-outcome tcl-outcome--${STATUS_CLASS[testCase.verificationStatus]}`}
                    >
                      {m.outcome[testCase.verificationStatus]}
                    </span>
                    <span className="tcl-row-build">{buildNote(testCase, builds, m)}</span>
                    <span className="tcl-row-added">{m.outcome.addedAt(formatDate(testCase.createdAt))}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="panel tcl-editor-panel" aria-label={m.editor.editTitle}>
        {creating || selected !== null ? (
          <TestCaseEditor
            key={selected?.id ?? 'new'}
            onCreated={(created) => {
              library.applyCreated(created)
              setCreating(false)
              setSelectedId(created.id)
              setAnnouncement(m.editor.created)
            }}
            onDelete={() => setDeleting(selected)}
            onDone={() => {
              setCreating(false)
              setSelectedId(null)
            }}
            onSaved={(saved) => {
              library.applySaved(saved)
              setAnnouncement(m.editor.saved)
            }}
            projectId={projectId}
            testCase={selected}
          />
        ) : (
          <p className="panel-empty">{m.editor.idle}</p>
        )}
      </aside>

      <p aria-live="polite" className="visually-hidden" role="status">{announcement}</p>

      {deleting !== null && (
        <ConfirmActionDialog
          body={
            <>
              <strong>
                {deleting.step.length > 0 ? deleting.step : m.delete.untitledName}
              </strong>
              {m.delete.copySuffix}
            </>
          }
          cancelLabel={m.delete.cancel}
          confirmLabel={m.delete.confirm}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteTestCase(projectId, deleting.id)
            library.removeCase(deleting.id)
            setSelectedId(null)
            setDeleting(null)
          }}
          pendingLabel={m.delete.pending}
          title={m.delete.title}
          toFailureMessage={(error) =>
            error instanceof ProjectApiError && error.isNotFound
              ? m.delete.gone
              : m.delete.failed
          }
        />
      )}
    </div>
  )
}

function countOf(tally: TestCaseTally, status: VerificationStatus): number {
  if (status === 'VERIFIED') return tally.verified
  if (status === 'BROKEN') return tally.broken
  return tally.draft
}

/**
 * 결과 아래 한 줄. 어떤 build 에서 그렇게 판정했는지가 결과 자체만큼 중요하다 — 두 버전 전
 * build 에서 실패한 케이스와 어제 build 에서 실패한 케이스는 같은 "실패" 가 아니다.
 */
function buildNote(
  testCase: TestCase,
  builds: GameBuild[],
  m: Messages['testCases'],
): string {
  const build = describeVerifiedBuild(testCase.lastVerifiedBuildId, builds)
  if (build !== null) return m.outcome.onBuild(build)
  return testCase.lastVerifiedBuildId !== null ? m.outcome.buildGone : m.outcome.neverRun
}
