import { useId, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { buildOptionText, selectBuild } from '../projects/gameBuilds'
import type { GameFunction } from '../projects/gameFunctions'
import type { GameBuild } from '../projects/gameTypes'
import { useGameFunctionCatalog } from '../projects/useGameFunctionCatalog'
import {
  allowedNames,
  toggleAllowedName,
  type QaFunctionMode,
  type QaFunctionOptions,
} from './qaFunctionOptions'

/**
 * run 을 시작할 때 cheat 와 behavior 를 얼마나 허락할지 고르는 칸(ARTEL-1051).
 *
 * 목록은 빌드가 보고한 catalog 에서 온다. run 은 게임 인스턴스에 붙지 빌드에 붙지 않아서, 어느 빌드의
 * catalog 를 볼지는 사용자가 고르고 기본은 가장 새 빌드다. 빌드를 바꾸면 이름이 달라질 수 있으므로
 * 고른 목록은 "전부" 로 돌린다.
 *
 * catalog 를 못 읽어도 두 mode 는 그대로 쓸 수 있다. 이때 목록은 `null`(전부)로 두고 시작한다.
 */
export function QaFunctionOptionsFields({
  builds,
  disabled,
  onChange,
  projectId,
  value,
}: {
  builds: GameBuild[]
  disabled: boolean
  onChange: (next: QaFunctionOptions) => void
  projectId: string
  value: QaFunctionOptions
}) {
  const { t } = useI18n()
  const m = t.gameFunctions.run
  const buildSelectId = useId()
  const [pickedBuildId, setPickedBuildId] = useState<string | null>(null)
  const build = selectBuild(builds, pickedBuildId)
  const { catalog, status } = useGameFunctionCatalog(projectId, build?.id ?? null)

  function pickBuild(buildId: string) {
    setPickedBuildId(buildId)
    onChange({ ...value, allowedCheats: null, allowedBehaviors: null })
  }

  function setMode(kind: 'cheatMode' | 'behaviorMode', checked: boolean) {
    const mode: QaFunctionMode = checked ? 'on' : 'off'
    onChange({ ...value, [kind]: mode })
  }

  return (
    <fieldset className="gf-run" disabled={disabled}>
      <legend className="gf-run-title">{m.title}</legend>
      <p className="gf-note">{m.hint}</p>

      {builds.length === 0 ? (
        <p className="gf-note">{m.noBuild}</p>
      ) : (
        <label className="gf-run-build" htmlFor={buildSelectId}>
          <span>{m.buildLabel}</span>
          <select
            id={buildSelectId}
            onChange={(event) => pickBuild(event.target.value)}
            value={build?.id ?? ''}
          >
            {builds.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{buildOptionText(candidate, t.projects.builds.editorLabel)}</option>
            ))}
          </select>
        </label>
      )}

      {status === 'loading' && <p className="gf-note" role="status">{m.catalogLoading}</p>}
      {status === 'error' && <p className="gf-note" role="alert">{m.catalogFailed}</p>}
      {status === 'ready' && catalog !== null && catalog.cheats.length + catalog.behaviors.length === 0 && (
        <p className="gf-note">{m.catalogEmpty}</p>
      )}

      <FunctionPicker
        allowed={value.allowedCheats}
        catalogReady={status === 'ready' && catalog !== null}
        entries={catalog?.cheats ?? []}
        label={m.cheatsLabel}
        mode={value.cheatMode}
        modeLabel={m.cheatMode}
        onAllowedChange={(allowedCheats) => onChange({ ...value, allowedCheats })}
        onModeChange={(checked) => setMode('cheatMode', checked)}
      />
      <FunctionPicker
        allowed={value.allowedBehaviors}
        catalogReady={status === 'ready' && catalog !== null}
        entries={catalog?.behaviors ?? []}
        label={m.behaviorsLabel}
        mode={value.behaviorMode}
        modeLabel={m.behaviorMode}
        onAllowedChange={(allowedBehaviors) => onChange({ ...value, allowedBehaviors })}
        onModeChange={(checked) => setMode('behaviorMode', checked)}
      />
    </fieldset>
  )
}

function FunctionPicker({
  allowed,
  catalogReady,
  entries,
  label,
  mode,
  modeLabel,
  onAllowedChange,
  onModeChange,
}: {
  allowed: string[] | null
  catalogReady: boolean
  entries: GameFunction[]
  label: string
  mode: QaFunctionMode
  modeLabel: string
  onAllowedChange: (next: string[] | null) => void
  onModeChange: (checked: boolean) => void
}) {
  const { t } = useI18n()
  const m = t.gameFunctions.run
  const names = entries.map((entry) => entry.name)
  const selected = allowedNames(allowed, names)
  const summary =
    selected.length === names.length ? m.allSelected(names.length) : m.someSelected(selected.length, names.length)

  return (
    <div className="gf-picker">
      <label className="gf-toggle">
        <input
          checked={mode === 'on'}
          onChange={(event) => onModeChange(event.target.checked)}
          type="checkbox"
        />
        {modeLabel}
      </label>

      {mode === 'on' && catalogReady && (
        names.length === 0 ? (
          <p className="gf-note">{m.noneRegistered}</p>
        ) : (
          <details className="gf-select">
            <summary>
              <span>{label}</span>
              <span className="gf-select-count mono">{summary}</span>
            </summary>
            <div className="gf-select-body">
              <button
                className="button button--secondary button--compact"
                disabled={allowed === null}
                onClick={() => onAllowedChange(null)}
                type="button"
              >
                {m.selectAll}
              </button>
              <ul className="gf-select-list">
                {entries.map((entry) => (
                  <li key={entry.name}>
                    <label>
                      <input
                        checked={selected.includes(entry.name)}
                        onChange={() => onAllowedChange(toggleAllowedName(allowed, names, entry.name))}
                        type="checkbox"
                      />
                      <span className="mono" translate="no">{entry.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
              {selected.length === 0 && <p className="gf-note" role="status">{m.nothingSelected}</p>}
            </div>
          </details>
        )
      )}
    </div>
  )
}
