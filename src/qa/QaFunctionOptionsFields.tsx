import { useId, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { buildOptionText, selectBuild } from '../projects/gameBuilds'
import { GameFunctionChoice } from '../projects/GameFunctionChoice'
import type { GameFunction } from '../projects/gameFunctions'
import type { GameBuild } from '../projects/gameTypes'
import { useGameFunctionCatalog } from '../projects/useGameFunctionCatalog'
import {
  allowedNames,
  changeRunChoiceKind,
  functionOptionsSummary,
  runChoiceKind,
  toggleChosenRunName,
  type QaFunctionAxis,
  type QaFunctionOptions,
} from './qaFunctionOptions'
import { ChevronDownIcon } from './qaModelIcons'

const ALLOWED_FIELD = { cheats: 'allowedCheats', behaviors: 'allowedBehaviors' } as const

/**
 * run 을 시작할 때 cheat 와 behavior 를 얼마나 허락할지 고르는 칸(ARTEL-1051). 실행 설정 패널의
 * "고급 설정" 안에 있고 기본은 접혀 있다. 접혀 있어도 한 줄 요약이 이 run 에서 무엇을 허락하는지 보인다.
 *
 * 목록은 빌드가 보고한 catalog 에서 온다. run 은 게임 인스턴스에 붙지 빌드에 붙지 않아서, 어느 빌드의
 * catalog 를 볼지는 사용자가 고르고 기본은 가장 새 빌드다. 빌드를 바꾸면 이름이 달라질 수 있으므로
 * 고른 목록은 "전부" 로 돌린다.
 *
 * catalog 를 못 읽어도 전부 · 없음은 그대로 고를 수 있다.
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
  const bodyId = useId()
  const [open, setOpen] = useState(false)
  const [pickedBuildId, setPickedBuildId] = useState<string | null>(null)
  const build = selectBuild(builds, pickedBuildId)
  const { catalog, status } = useGameFunctionCatalog(projectId, build?.id ?? null)
  const ready = status === 'ready' && catalog !== null
  const catalogNames: Record<QaFunctionAxis, string[]> | null = ready
    ? { cheats: catalog.cheats.map((entry) => entry.name), behaviors: catalog.behaviors.map((entry) => entry.name) }
    : null

  function pickBuild(buildId: string) {
    setPickedBuildId(buildId)
    onChange({ ...value, allowedCheats: null, allowedBehaviors: null })
  }

  function axisChoice(axis: QaFunctionAxis, label: string, entries: GameFunction[]) {
    const names = entries.map((entry) => entry.name)
    const allowed = value[ALLOWED_FIELD[axis]]
    const chosen = allowedNames(allowed, names)
    return (
      <GameFunctionChoice
        chosen={chosen}
        emptyNote={status === 'loading' ? m.catalogLoading : ready ? m.noneRegistered : m.catalogFailed}
        entries={entries.map((entry) => ({ name: entry.name, description: entry.description }))}
        footer={entries.length > 0 && chosen.length === 0 && <p className="gf-note" role="status">{m.nothingSelected}</p>}
        kind={runChoiceKind(value, axis)}
        label={label}
        onKindChange={(kind) => onChange(changeRunChoiceKind(value, axis, kind, names))}
        onToggle={(name) => onChange({ ...value, [ALLOWED_FIELD[axis]]: toggleChosenRunName(allowed, names, name) })}
      />
    )
  }

  return (
    <section className="gf-advanced">
      <button
        aria-controls={bodyId}
        aria-expanded={open}
        className="gf-advanced-toggle"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <ChevronDownIcon className={'ql-collapse-icon' + (open ? '' : ' is-collapsed')} size={16} />
        {m.advancedTitle}
      </button>
      {!open && <p className="gf-advanced-summary">{functionOptionsSummary(value, catalogNames, m.summary)}</p>}

      {open && (
        <fieldset className="gf-run" disabled={disabled} id={bodyId}>
          <legend className="gf-run-title">{m.title}</legend>
          <p className="gf-note">{m.hint}</p>

          {builds.length === 0 ? (
            <p className="gf-note">{m.noBuild}</p>
          ) : (
            <label className="gf-run-build" htmlFor={buildSelectId}>
              <span>{m.buildLabel}</span>
              <select id={buildSelectId} onChange={(event) => pickBuild(event.target.value)} value={build?.id ?? ''}>
                {builds.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>{buildOptionText(candidate, t.projects.builds.editorLabel)}</option>
                ))}
              </select>
            </label>
          )}

          {status === 'loading' && <p className="gf-note" role="status">{m.catalogLoading}</p>}
          {status === 'error' && <p className="gf-note" role="alert">{m.catalogFailed}</p>}
          {ready && catalog.cheats.length + catalog.behaviors.length === 0 && <p className="gf-note">{m.catalogEmpty}</p>}

          {axisChoice('cheats', m.cheats, catalog?.cheats ?? [])}
          {axisChoice('behaviors', m.behaviors, catalog?.behaviors ?? [])}
        </fieldset>
      )}
    </section>
  )
}
