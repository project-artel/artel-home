import { SceneChip } from './SceneChip'
import { SpecGradeChip } from './SpecGradeChip'
import type { TestCase } from './testCaseTypes'

/**
 * One case in a list, the way the ⌘K palette draws it.
 *
 * Four channels and no more: the verification dot, the step text, the scene, and the
 * spec grade. Everything else a case knows — when it was added, which build last judged
 * it — belongs to the pane beside the list, not to every row. A row that carries six
 * facts is a row nobody scans.
 *
 * `selected` and `active` are different things and the dashboard needs both: `active` is
 * where the keyboard cursor sits and follows the pointer, `selected` is the case whose
 * editor is open. The palette only has `active`.
 */
export function CaseListRow({
  active,
  fallbackTitle,
  index,
  onClick,
  onMouseEnter,
  selected = false,
  statusLabel,
  testCase,
}: {
  active: boolean
  /** Shown when the case has no step text yet. */
  fallbackTitle: string
  /** Position in the shown list. Keyboard travel finds the row by it. */
  index: number
  onClick: () => void
  onMouseEnter?: () => void
  selected?: boolean
  /** Reads under the title — the palette puts the verification status here. */
  statusLabel: string
  testCase: TestCase
}) {
  return (
    <button
      aria-current={selected ? true : undefined}
      className={'cp-row' + (active ? ' active' : '') + (selected ? ' picked' : '')}
      data-index={index}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      type="button"
    >
      <span className={`vdot ${testCase.verificationStatus}`} />
      <span className="cp-main">
        <span className="cp-title">{testCase.step.length > 0 ? testCase.step : fallbackTitle}</span>
        <span className="cp-sub">{statusLabel}</span>
      </span>
      {/* Settled grades stay off the rows. A list where every row reads "확정" carries no
          information; the badge earns its space only on the cases that are not settled. */}
      <SpecGradeChip status={testCase.status} quietWhenSettled />
      <SceneChip scene={testCase.scene} />
    </button>
  )
}
