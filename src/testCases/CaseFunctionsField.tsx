import { useI18n } from '../i18n/useI18n'
import { GameFunctionChoice } from '../projects/GameFunctionChoice'
import type { GameFunction } from '../projects/gameFunctions'
import type { GameFunctionCatalogStatus } from '../projects/useGameFunctionCatalog'
import {
  changeSelectionKind,
  selectionKind,
  toggleChosenName,
  type CaseFunctions,
  type FunctionSelection,
} from './caseFunctions'

/**
 * 이 케이스에서 에이전트에게 허락할 cheat · behavior(ARTEL-1051).
 *
 * cheat 와 behavior 는 따로 고른다. 각각 전부 · 없음 · 직접 선택 셋 중 하나이고(run 시작과 같은 칸이다), 이름은 빌드의 catalog 에서
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
        status={status}
        value={value.cheats}
      />
      <SelectionRow
        entries={catalog?.behaviors ?? []}
        label={m.behaviors}
        onChange={(behaviors) => onChange({ ...value, behaviors })}
        status={status}
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
  status,
  value,
}: {
  entries: GameFunction[]
  label: string
  onChange: (next: FunctionSelection) => void
  status: GameFunctionCatalogStatus
  value: FunctionSelection
}) {
  const { t } = useI18n()
  const m = t.gameFunctions.caseFunctions
  const catalogNames = entries.map((entry) => entry.name)
  const chosenNames = Array.isArray(value) ? value : []
  // catalog 에 없는 고른 이름도 목록에 남긴다.
  const missingNames = chosenNames.filter((name) => !catalogNames.includes(name))

  return (
    <GameFunctionChoice
      chosen={chosenNames}
      emptyNote={status === 'ready' ? m.noneRegistered : status === 'loading' ? m.catalogLoading : m.catalogFailed}
      entries={[
        ...entries.map((entry) => ({ name: entry.name, description: entry.description })),
        ...missingNames.map((name) => ({ name, description: null, note: m.notInCatalog })),
      ]}
      footer={chosenNames.length === 0 && <p className="gf-note" role="status">{m.chosenNone}</p>}
      kind={selectionKind(value)}
      label={label}
      onKindChange={(kind) => onChange(changeSelectionKind(value, kind))}
      onToggle={(name) => onChange(toggleChosenName(value, name))}
    />
  )
}
