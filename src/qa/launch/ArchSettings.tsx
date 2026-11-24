import { useId } from 'react'
import { useI18n } from '../../i18n/useI18n'
import {
  EMPTY_ARCH_SELECTION,
  archEngine,
  choiceUnavailable,
  withEngine,
  withKnob,
  type QaArchAxis,
  type QaArchSelection,
} from '../qaArch'

/** 엔진이나 모델을 되돌렸을 때 선택을 복원하도록, 표시할 값만 걸러낸다. */
export function ArchSettings({
  selection,
  axes,
  onChange,
  readsImages,
}: {
  selection: QaArchSelection
  axes: readonly QaArchAxis[]
  onChange: (next: QaArchSelection) => void
  readsImages: boolean
}) {
  const { t } = useI18n()
  const advanced = t.qa.panel.advanced
  const engine = archEngine(selection)
  const changed = Object.keys(selection).some((key) => key !== 'engine')
  const engineLocked = axes.length > 0 && axes.every((axis) => !axis.engines.includes(engine))

  return (
    <div className="qa-advanced">
      <p className="qa-advanced-hint">{advanced.hint}</p>
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
          {axes.map((axis) => (
            <ArchAxisField
              axis={axis}
              key={axis.key}
              onChange={(key, value) => onChange(withKnob(selection, key, value))}
              readsImages={readsImages}
              selection={selection}
            />
          ))}
        </div>
        {changed && (
          <div className="qa-advanced-actions">
            <button
              className="button button--secondary button--compact"
              onClick={() => onChange(withEngine(EMPTY_ARCH_SELECTION, engine))}
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
  onChange: (key: string, value: QaArchSelection[string]) => void
  readsImages: boolean
  selection: QaArchSelection
}) {
  const { t, locale } = useI18n()
  const disabled = !axis.engines.includes(archEngine(selection))
  const controlId = useId()
  const saved = selection[axis.key]
  const current = axis.kind === 'choice' && typeof saved === 'string' && choiceUnavailable(axis, saved, selection, readsImages)
    ? undefined : saved
  const advanced = t.qa.panel.advanced

  return (
    <label className="qa-advanced-field" htmlFor={controlId}>
      <code translate="no">{axis.key}</code>
      {axis.kind === 'choice' && (
        <select
          disabled={disabled}
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
              disabled={choiceUnavailable(axis, value, selection, readsImages)}
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
          disabled={disabled}
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
          disabled={disabled}
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
      <small>{axis.description[locale]}</small>
    </label>
  )
}
