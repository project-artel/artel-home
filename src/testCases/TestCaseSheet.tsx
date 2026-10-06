import { useEffect, useRef } from 'react'
import type { Messages } from '../i18n/messages'
import { useI18n } from '../i18n/useI18n'
import { formatDate } from '../projects/formatters'
import type { GameBuild } from '../projects/gameTypes'
import { SceneChip } from './SceneChip'
import { SpecGradeChip } from './SpecGradeChip'
import { TestCaseEditor } from './TestCaseEditor'
import { describeVerifiedBuild } from './testCaseLibrary'
import type { TestCase } from './testCaseTypes'

/**
 * The right-hand sheet that shows one TC and edits it.
 *
 * Lifted out of the TC library (ARTEL-940) so the authoring chat can open the very
 * same view when someone clicks a TC chip — a second, smaller card would show less
 * and drift from this one. `testCase` null means a new case is being written.
 */
export function TestCaseSheet({
  builds = [],
  knownScenes = [],
  projectId,
  testCase,
  onClose,
  onCreated = () => {},
  onDelete,
  onSaved,
}: {
  builds?: GameBuild[]
  knownScenes?: string[]
  projectId: string
  testCase: TestCase | null
  onClose: () => void
  onCreated?: (created: TestCase) => void
  onDelete: () => void
  onSaved: (saved: TestCase) => void
}) {
  const { t } = useI18n()
  const m = t.testCases
  const sheetRef = useRef<HTMLElement | null>(null)

  // 시트가 열리면 초점을 안으로 옮긴다. 열어 놓고 초점이 뒤 표에 남아 있으면 키보드로
  // 시트에 닿을 방법이 없고, `Escape` 도 표가 먼저 받는다.
  useEffect(() => {
    const box = sheetRef.current
    // 입력칸을 먼저 찾는다. DOM 순서로만 고르면 닫기 버튼이 먼저 잡히는데, 시트를 연 이유는
    // 닫으려는 것이 아니라 고치려는 것이다.
    const first = box?.querySelector<HTMLElement>('textarea, input') ?? box?.querySelector<HTMLElement>('button')
    first?.focus()
  }, [])

  return (
    <>
      <div className="tcl-scrim" onClick={onClose} />
      <aside
        aria-label={m.editor.editTitle}
        aria-modal="true"
        className="tcl-sheet"
        onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}
        ref={sheetRef}
        role="dialog"
      >
        <header className="tcl-sheet-head">
          <div className="tcl-sheet-tags">
            {testCase !== null && (
              <>
                <span className={`vpill ${testCase.verificationStatus}`}>
                  <span className={`vdot ${testCase.verificationStatus}`} />
                  {m.outcome[testCase.verificationStatus]}
                </span>
                <SceneChip scene={testCase.scene} />
                <SpecGradeChip status={testCase.status} />
              </>
            )}
          </div>
          <button
            className="tcl-sheet-close"
            onClick={onClose}
            title={m.row.close}
            type="button"
          >✕</button>
        </header>
        {testCase !== null && (
          <p className="tcl-sheet-meta">
            {buildNote(testCase, builds, m)} · {m.outcome.addedAt(formatDate(testCase.createdAt))}
          </p>
        )}
        <TestCaseEditor
          key={testCase?.id ?? 'new'}
          knownScenes={knownScenes}
          onCreated={onCreated}
          onDelete={onDelete}
          onDone={onClose}
          onSaved={onSaved}
          projectId={projectId}
          testCase={testCase}
        />
      </aside>
    </>
  )
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
