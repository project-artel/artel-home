import { useId } from 'react'
import { useI18n } from '../i18n/useI18n'
import type { GameFunction } from '../projects/gameFunctions'
import type { GameFunctionCatalogStatus } from '../projects/useGameFunctionCatalog'
import {
  changeSelectionKind,
  selectionKind,
  toggleChosenName,
  type CaseFunctions,
  type FunctionSelection,
  type SelectionKind,
} from './caseFunctions'

const KINDS: SelectionKind[] = ['all', 'none', 'chosen']

/**
 * 이 케이스에서 에이전트에게 허락할 cheat · behavior(ARTEL-1051).
 *
 * cheat 와 behavior 는 따로 고른다. 각각 전부 · 없음 · 이름 고르기 셋 중 하나이고, 이름은 빌드의 catalog 에서
 * 온다. 고른 이름이 지금 catalog 에 없으면(다른 빌드에서 골랐거나 함수가 사라짐) 지우지 않고 "이 빌드에 없음"
 * 으로 남겨 두어, 저장하면서 말없이 사라지는 일이 없게 한다.
 */
export function CaseFunctionsField({
  catalog,
  disabled,
  onChange,
  status,
  value,
  version,
}: {
  catalog: { cheats: GameFunction[]; behaviors: GameFunction[] } | null
  disabled: boolean
  onChange: (next: CaseFunctions) => void
  status: GameFunctionCatalogStatus
  value: CaseFunctions
  /** 이름을 읽어 온 빌드의 버전. 알 수 없으면 null. */
  version: string | null
}) {
  const { t } = useI18n()
  const m = t.gameFunctions.caseFunctions

  return (
    <fieldset className="gf-case" disabled={disabled}>
      <legend className="tce-label">{m.title}</legend>
      <p className="field-hint">{m.hint}</p>
      {status === 'loading' && <p className="gf-note" role="status">{m.catalogLoading}</p>}
      {status === 'error' && <p className="gf-note" role="alert">{m.catalogFailed}</p>}
      <SelectionRow
        entries={catalog?.cheats ?? []}
        label={m.cheats}
        onChange={(cheats) => onChange({ ...value, cheats })}
        ready={status === 'ready'}
        value={value.cheats}
      />
      <SelectionRow
        entries={catalog?.behaviors ?? []}
        label={m.behaviors}
        onChange={(behaviors) => onChange({ ...value, behaviors })}
        ready={status === 'ready'}
        value={value.behaviors}
      />
      {version !== null && status === 'ready' && <p className="field-hint">{m.namesFrom(version)}</p>}
    </fieldset>
  )
}

function SelectionRow({
  entries,
  label,
  onChange,
  ready,
  value,
}: {
  entries: GameFunction[]
  label: string
  onChange: (next: FunctionSelection) => void
  ready: boolean
  value: FunctionSelection
}) {
  const { t } = useI18n()
  const m = t.gameFunctions.caseFunctions
  const groupName = useId()
  const kind = selectionKind(value)
  const catalogNames = entries.map((entry) => entry.name)
  const chosenNames = Array.isArray(value) ? value : []
  // catalog 에 없는 고른 이름도 목록에 남긴다.
  const missingNames = chosenNames.filter((name) => !catalogNames.includes(name))
  const labels: Record<SelectionKind, string> = { all: m.all, none: m.none, chosen: m.chosen }

  return (
    <div className="gf-case-row">
      <span className="gf-case-label" id={`${groupName}-label`}>{label}</span>
      <div className="tce-seg" role="radiogroup" aria-labelledby={`${groupName}-label`}>
        {KINDS.map((candidate) => (
          <button
            aria-checked={kind === candidate}
            className={'tce-seg-btn' + (kind === candidate ? ' on' : '')}
            key={candidate}
            onClick={() => onChange(changeSelectionKind(value, candidate))}
            role="radio"
            type="button"
          >
            {labels[candidate]}
          </button>
        ))}
      </div>

      {kind === 'chosen' && (
        <>
          {ready && catalogNames.length === 0 && missingNames.length === 0 && (
            <p className="gf-note">{m.noneRegistered}</p>
          )}
          <ul className="gf-select-list">
            {catalogNames.map((name) => (
              <li key={name}>
                <label>
                  <input
                    checked={chosenNames.includes(name)}
                    onChange={() => onChange(toggleChosenName(value, name))}
                    type="checkbox"
                  />
                  <span className="mono" translate="no">{name}</span>
                </label>
              </li>
            ))}
            {missingNames.map((name) => (
              <li key={name}>
                <label>
                  <input checked onChange={() => onChange(toggleChosenName(value, name))} type="checkbox" />
                  <span className="mono" translate="no">{name}</span>
                  <span className="gf-chip">{m.notInCatalog}</span>
                </label>
              </li>
            ))}
          </ul>
          {chosenNames.length === 0 && <p className="gf-note" role="status">{m.chosenNone}</p>}
        </>
      )}
    </div>
  )
}
