import { useI18n } from '../../i18n/useI18n'
import { adminFormat } from '../shared/format'
import type { LabelStep } from './expectedLabelsApi'
import { LABEL_STATES, countExpectedFailures, countLabelled, firstExpectedFailure } from './labels'

function stateKey(value: boolean | null): 'unset' | 'pass' | 'fail' {
  return value === null ? 'unset' : value ? 'pass' : 'fail'
}

/**
 * 스텝 목록과 3상태 라벨 컨트롤. 표시만 하고 상태는 들고 있지 않다 — 저장 여부를 아는 쪽이
 * 부모라, 여기서 상태를 나누면 "저장 안 됨"이 두 곳에서 각자 계산된다.
 *
 * **체크박스를 쓰지 않는 이유**: 체크박스는 두 상태뿐이라 "미지정"이 둘 중 하나와 같은 모습을
 * 갖게 된다. 그건 라벨 기본값을 `true`로 두는 것과 같은 실수를 UI로 옮긴 것이다. 세 선택지를
 * 그대로 드러내고 `aria-checked`로도 말한다.
 */
export function StepLabelList({ steps, onChange }: {
  steps: LabelStep[]
  onChange: (step: number, value: boolean | null) => void
}) {
  const { t, locale } = useI18n()
  const strings = t.adminLabels
  const format = adminFormat(locale)
  const failures = countExpectedFailures(steps)
  const labelled = countLabelled(steps)
  const firstFailure = firstExpectedFailure(steps)
  const cutoffMatters = firstFailure > 0 && firstFailure < steps.length

  if (steps.length === 0) return <p className="notice">{strings.noSteps}</p>

  return (
    <div className="labels">
      <ol className="labels__list">
        {steps.map((step) => (
          <li className="labels__row" key={step.step}>
            <span className="labels__no mono">{format.count(step.step)}</span>
            <span className="labels__action">
              {step.action === '' ? <span className="muted">{strings.emptyStep}</span> : step.action}
              {step.caseId !== null && <span className="labels__tc mono">{strings.testCaseBadge}</span>}
            </span>
            <span className="labels__states" role="radiogroup" aria-label={strings.stepVerdict(format.count(step.step))}>
              {LABEL_STATES.map((value) => {
                const key = stateKey(value)
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={step.expectedPassed === value}
                    title={strings.states[key]}
                    className={`labels__state labels__state--${key}${step.expectedPassed === value ? ' labels__state--on' : ''}`}
                    onClick={() => onChange(step.step, value)}
                  >
                    {strings.shortStates[key]}
                  </button>
                )
              })}
            </span>
          </li>
        ))}
      </ol>
      <footer className="labels__rollup">
        <span className={`labels__count${failures === 0 ? ' labels__count--none' : ''}`}>
          {strings.expectedFailures(format.count(failures))}
        </span>
        <span className="muted">{strings.gradedSteps(format.count(labelled), format.count(steps.length))}</span>
        {failures === 0 && <p className="labels__note">{strings.noFailuresNote}</p>}
        {cutoffMatters && <p className="labels__note">{strings.cutoffNote(format.count(firstFailure))}</p>}
      </footer>
    </div>
  )
}
