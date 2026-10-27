import { useId } from 'react'
import { useI18n } from '../../i18n/useI18n'
import {
  EMPTY_ARCH_SELECTION,
  QA_ARCH_AXES,
  QA_ARCH_LABEL_MAX_LENGTH,
  QA_ENGINES,
  archEngine,
  changedKnobCount,
  suggestArchLabel,
  withEngine,
  withKnob,
  type QaEngine,
  type QaArchAxis,
  type QaArchKnobKey,
  type QaArchSelection,
} from '../qaArch'

/**
 * 실행 설정 패널의 "고급 설정"(ARTEL-1091) — agent 구조 knob 과 label.
 *
 * 상위 패널의 고급 설정 안에 표시한다. knob을 바꾸면 label 입력이 나타난다.
 *
 * `readsImages` 가 false 면 vision 이 필요한 값은 option 을 잠근다. 이미 고른 값은 여기서 지우지
 * 않는다 — 보낼 때 `withoutVisionKnobs` 가 걷어 내므로, 모델을 되돌리면 고른 값이 그대로 산다.
 * 그래서 `selection` 은 걷어 낸 뒤의 값을 받는다. 화면이 보내는 것과 같은 것을 보여 주기 위해서다.
 *
 * 첫 줄은 엔진(ARTEL-1119)이다. `planner_executer` 를 고르면 그 아래 축 전체를 `fieldset disabled` 로
 * 잠근다. 아래 knob 은 모두 `agent` 엔진의 것이라 그 엔진은 읽지 않고, 요청에도 실리지 않는다. 값은
 * 지우지 않는다 — vision 잠금과 같은 이유로, 기본 엔진으로 돌아가면 고른 값이 그대로 산다.
 */
export function ArchSettings({
  selection,
  onChange,
  readsImages,
}: {
  selection: QaArchSelection
  onChange: (next: QaArchSelection) => void
  readsImages: boolean
}) {
  const { t } = useI18n()
  const advanced = t.qa.panel.advanced
  const labelId = useId()
  const engineId = useId()
  const changed = changedKnobCount(selection)
  const engine = archEngine(selection)
  const engineLocked = engine === 'planner_executer'

  return (
    <div className="qa-advanced">
      <p className="qa-advanced-hint">{advanced.hint}</p>
      {/* 엔진은 "서버 기본값" 칸이 없다. 서버 기본이 `agent` 이고, 그것을 "기본" 으로 보여 준다. 요청에는 `planner_executer` 일 때만 실린다. */}
      <div className="qa-advanced-grid">
        <label className="qa-advanced-field" htmlFor={engineId}>
          <code translate="no">engine</code>
          <select
            id={engineId}
            onChange={(event) => onChange(withEngine(selection, event.target.value as QaEngine))}
            value={engine}
          >
            {QA_ENGINES.map((value) => (
              <option key={value} value={value}>
                {advanced.engines[value]}
              </option>
            ))}
          </select>
          <small>{advanced.engineHint}</small>
        </label>
      </div>
      {/* 버전 불일치 안내와 같은 모양. amber 글자만으로는 cream 배경에서 대비가 모자라 `!` 표식을 붙인다. */}
      {engineLocked && (
        <p className="qa-version-mismatch qa-advanced-locked" role="status">
          <span aria-hidden="true">!</span>
          <span className="qa-version-mismatch-text">{advanced.engineLocked}</span>
        </p>
      )}
      {!readsImages && !engineLocked && (
        <p className="qa-version-mismatch qa-advanced-locked" role="status">
          <span aria-hidden="true">!</span>
          <span className="qa-version-mismatch-text">{advanced.visionLocked}</span>
        </p>
      )}
      <fieldset className="qa-advanced-fieldset" disabled={engineLocked}>
        <div className="qa-advanced-grid">
          {QA_ARCH_AXES.map((axis) => (
            <ArchAxisField
              axis={axis}
              key={axis.key}
              onChange={(key, value) => onChange(withKnob(selection, key, value))}
              readsImages={readsImages}
              selection={selection}
            />
          ))}
          {changed > 0 && (
            <label className="qa-advanced-field qa-advanced-label" htmlFor={labelId}>
              <span>{advanced.labelLabel}</span>
              <input
                id={labelId}
                maxLength={QA_ARCH_LABEL_MAX_LENGTH}
                onChange={(event) => onChange({ ...selection, label: event.target.value })}
                placeholder={suggestArchLabel(selection)}
                type="text"
                value={selection.label}
              />
              <small>{advanced.labelHint}</small>
            </label>
          )}
        </div>
        {changed > 0 && (
          <div className="qa-advanced-actions">
            <button
              className="button button--secondary button--compact"
              onClick={() => onChange(EMPTY_ARCH_SELECTION)}
              type="button"
            >
              {advanced.reset}
            </button>
          </div>
        )}
      </fieldset>
    </div>
  )
}

/**
 * agent 구조 축 하나. 첫 option 은 늘 "서버 기본값" 이고, 그때는 요청에 그 키가 실리지 않는다.
 * toggle 도 checkbox 가 아니라 세 값(기본값·켬·끔) select 다 — checkbox 는 "서버가 정한다" 를
 * 표현할 자리가 없다.
 */
function ArchAxisField({
  axis,
  onChange,
  readsImages,
  selection,
}: {
  axis: QaArchAxis
  onChange: (key: QaArchKnobKey, value: QaArchSelection[QaArchKnobKey]) => void
  readsImages: boolean
  selection: QaArchSelection
}) {
  const { t } = useI18n()
  const controlId = useId()
  const current = selection[axis.key]
  const advanced = t.qa.panel.advanced

  return (
    <label className="qa-advanced-field" htmlFor={controlId}>
      <code translate="no">{axis.key}</code>
      {axis.kind === 'choice' && (
        <select
          id={controlId}
          onChange={(event) =>
            onChange(
              axis.key,
              event.target.value === '' ? undefined : (event.target.value as QaArchSelection[typeof axis.key]),
            )
          }
          value={typeof current === 'string' ? current : ''}
        >
          <option value="">{advanced.serverDefault}</option>
          {axis.values.map((value) => (
            <option
              disabled={!readsImages && (axis.visionOnlyValues?.includes(value) ?? false)}
              key={value}
              value={value}
            >
              {value}
            </option>
          ))}
        </select>
      )}
      {axis.kind === 'toggle' && (
        <select
          id={controlId}
          onChange={(event) =>
            onChange(axis.key, event.target.value === '' ? undefined : event.target.value === 'true')
          }
          value={typeof current === 'boolean' ? String(current) : ''}
        >
          <option value="">{advanced.serverDefault}</option>
          <option value="true">{advanced.on}</option>
          <option value="false">{advanced.off}</option>
        </select>
      )}
      {axis.kind === 'number' && (
        <input
          id={controlId}
          max={axis.max}
          min={axis.min}
          onChange={(event) =>
            onChange(axis.key, event.target.value === '' ? undefined : Number(event.target.value))
          }
          placeholder={advanced.serverDefault}
          type="number"
          value={typeof current === 'number' ? current : ''}
        />
      )}
      <small>{advanced.axes[axis.key]}</small>
    </label>
  )
}
