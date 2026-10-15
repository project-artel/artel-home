import { useI18n } from '../i18n/useI18n'
import type { VerificationStatus } from '../testCases/testCaseTypes'
import type { ExecutionMode, ScenarioStep } from '../testScenarios/scenarioTypes'
import type { QaProgress } from './qaProgress'
import { QaRunUsagePanel } from './QaRunUsagePanel'
import { QaScenarioSteps } from './QaScenarioSteps'
import type { QaTry } from './qaTypes'
import { useScenarioSteps } from './useScenarioSteps'

/** What the rail knows about the focused scenario, from its log stream. */
export type FocusedScenarioDetail = {
  tryId: string
  active: boolean
  progress: QaProgress
  scenarioSteps: ScenarioStep[]
  executionMode: ExecutionMode
  onJump: (logId: string) => void
  /** 이 실행이 TC 상태로 저장한 판정(ARTEL-995). `case_id` → 저장된 상태. */
  caseVerdicts: ReadonlyMap<string, VerificationStatus>
}

export type QaScenarioRailProps = {
  projectId: string
  /** 판정 버전(ARTEL-1070). FREE 시나리오의 케이스를 QA 가 판정한 그 버전의 내용으로 보인다. */
  gameBuildId: string | null
  tries: QaTry[]
  activeTryId: string | null
  focusedTryId: string | null
  scenarioTitle: (entry: QaTry, index: number) => string
  isExpanded: (tryId: string) => boolean
  onToggle: (tryId: string) => void
  onFocus: (tryId: string) => void
}

/**
 * The run's scenarios down the left edge, each one expandable into its steps,
 * with the focused scenario's model usage pinned to the bottom.
 *
 * Usage sits here rather than beside the issues: it is what the run cost, not
 * what the run found, and the rail is where the run as a whole is described.
 */
export function QaScenarioRail({
  focused,
  ...rail
}: QaScenarioRailProps & { focused: FocusedScenarioDetail | null }) {
  const { t } = useI18n()
  return (
    <nav className="qa-console-rail" aria-label={t.qa.run.scenariosHeading}>
      <p className="qa-console-rail-head">{t.qa.run.scenariosHeading}</p>
      <ol className="qa-console-rail-list">
        {rail.tries.map((entry, index) => (
          <RailScenario
            key={entry.id}
            entry={entry}
            expanded={rail.isExpanded(entry.id)}
            focused={focused !== null && focused.tryId === entry.id ? focused : null}
            isActive={entry.id === rail.activeTryId}
            isFocused={entry.id === rail.focusedTryId}
            number={index + 1}
            projectId={rail.projectId}
            gameBuildId={rail.gameBuildId}
            onFocus={() => rail.onFocus(entry.id)}
            onToggle={() => rail.onToggle(entry.id)}
            title={rail.scenarioTitle(entry, index)}
          />
        ))}
      </ol>
      {focused !== null && (
        <div className="qa-console-rail-usage">
          {/* Keyed by the try so switching scenarios starts a fresh read. */}
          <QaRunUsagePanel key={focused.tryId} active={focused.active} qaTryId={focused.tryId} />
        </div>
      )}
    </nav>
  )
}

function RailScenario({
  entry,
  expanded,
  focused,
  isActive,
  isFocused,
  number,
  projectId,
  gameBuildId,
  onFocus,
  onToggle,
  title,
}: {
  entry: QaTry
  gameBuildId: string | null
  expanded: boolean
  focused: FocusedScenarioDetail | null
  isActive: boolean
  isFocused: boolean
  number: number
  projectId: string
  onFocus: () => void
  onToggle: () => void
  title: string
}) {
  const { t } = useI18n()
  const stepsId = `qa-rail-steps-${entry.id}`
  return (
    <li className={`qa-rail-entry${expanded ? ' qa-rail-entry--expanded' : ''}`}>
      <div className="qa-rail-row">
        <button
          aria-controls={stepsId}
          aria-expanded={expanded}
          aria-label={expanded ? t.qa.run.railCollapse(title) : t.qa.run.railExpand(title)}
          className="qa-rail-toggle"
          onClick={onToggle}
          type="button"
        >
          <span aria-hidden="true" className="qa-rail-chevron" />
        </button>
        <button
          aria-current={isFocused ? 'true' : undefined}
          className={`qa-rail-item${isFocused ? ' qa-rail-item--focused' : ''}${isActive ? ' qa-rail-item--active' : ''}`}
          onClick={onFocus}
          type="button"
        >
          <span className={`qa-rail-dot qa-rail-dot--${entry.status.toLowerCase()}`} aria-hidden="true" />
          <span className="qa-rail-no">{number}</span>
          <span className="qa-rail-title">{title}</span>
          <span className={`qa-run-status qa-run-status--${entry.status.toLowerCase()}`}>
            {t.qa.statusLabels[entry.status]}
          </span>
        </button>
      </div>
      {expanded && (
        <div id={stepsId}>
          {focused !== null ? (
            <QaScenarioSteps
              caseVerdicts={focused.caseVerdicts}
              onJump={focused.onJump}
              progress={focused.progress}
              executionMode={focused.executionMode}
              gameBuildId={gameBuildId}
              projectId={projectId}
              scenarioSteps={focused.scenarioSteps}
            />
          ) : (
            <UnfocusedScenarioSteps gameBuildId={gameBuildId} projectId={projectId} testScenarioId={entry.testScenarioId} />
          )}
        </div>
      )}
    </li>
  )
}

/** Reads the steps only once the scenario is expanded, so a long run is not N fetches up front. */
function UnfocusedScenarioSteps({
  gameBuildId,
  projectId,
  testScenarioId,
}: {
  gameBuildId: string | null
  projectId: string
  testScenarioId: string
}) {
  const { steps, executionMode } = useScenarioSteps(testScenarioId)
  return (
    <QaScenarioSteps
      executionMode={executionMode}
      gameBuildId={gameBuildId}
      progress={null}
      projectId={projectId}
      scenarioSteps={steps}
    />
  )
}
