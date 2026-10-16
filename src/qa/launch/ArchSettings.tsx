import { useId } from 'react'
import { useI18n } from '../../i18n/useI18n'
import {
  EMPTY_ARCH_SELECTION,
  QA_ARCH_AXES,
  QA_ARCH_LABEL_MAX_LENGTH,
  changedKnobCount,
  suggestArchLabel,
  withKnob,
  type QaArchAxis,
  type QaArchKnobKey,
  type QaArchSelection,
} from '../qaArch'

/**
 * 실행 설정 패널의 "고급 설정"(ARTEL-1091) — agent 구조 knob 과 label.
 *
 * 접힌 `details` 다. 기본 run 은 아무것도 고르지 않으므로, 펼치지 않은 사람에게는 제목 한 줄만
 * 보인다. knob 을 바꾸면 제목 옆에 바뀐 개수가 붙고 label 입력이 나타난다.
 *
 * `readsImages` 가 false 면 vision 이 필요한 값은 option 을 잠근다. 이미 고른 값은 여기서 지우지
 * 않는다 — 보낼 때 `withoutVisionKnobs` 가 걷어 내므로, 모델을 되돌리면 고른 값이 그대로 산다.
 * 그래서 `selection` 은 걷어 낸 뒤의 값을 받는다. 화면이 보내는 것과 같은 것을 보여 주기 위해서다.
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
  const changed = changedKnobCount(selection)

  return (
    <details className="qa-advanced">
      <summary>
        {advanced.title}
        {changed > 0 && <span className="qa-advanced-count">{advanced.changed(changed)}</span>}
      </summary>
      <p className="qa-advanced-hint">{advanced.hint}</p>
      {/* 버전 불일치 안내와 같은 모양. amber 글자만으로는 cream 배경에서 대비가 모자라 `!` 표식을 붙인다. */}
      {!readsImages && (
        <p className="qa-version-mismatch qa-advanced-locked" role="status">
          <span aria-hidden="true">!</span>
          <span className="qa-version-mismatch-text">{advanced.visionLocked}</span>
        </p>
      )}
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
    </details>
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
