import { useId, useMemo, useState } from 'react'
import { Dialog } from '../../design-system/primitives/Dialog'
import { useI18n } from '../../i18n/useI18n'
import type { TestRun } from '../../testRuns/testRunApi'
import { SearchIcon } from '../qaModelIcons'
import type { QuickStart } from './qaLaunchApi'

export type PaletteAction = 'new-run' | 'install' | 'consoles'

type Item =
  | { kind: 'start'; key: string; title: string; sub: string; start: QuickStart }
  | { kind: 'run'; key: string; title: string; sub: string; run: TestRun }
  | { kind: 'action'; key: string; title: string; sub: string; action: PaletteAction }

/**
 * ⌘K 찾기(ARTEL-1084) — 최근 조합 · 테스트 런 · 동작을 키보드로 고른다. 모달은 서비스의 `Dialog` 를
 * 쓴다(포커스 가두기 · Escape · 돌아갈 포커스).
 *
 * ↑↓ 로 고르고 ↵ 로 연다. 이 창의 일은 "고르기" 까지다 — 실행은 고른 뒤 실행 버튼(또는 ⌘↵)이 한다.
 * 고르자마자 돌리면 잘못 누른 한 번이 게임 하나를 몇 분 붙잡는다.
 */
export function CommandPalette({
  runs,
  starts,
  onClose,
  onPickRun,
  onPickStart,
  onAction,
  modelLabel,
}: {
  /** 모델 id 를 사람이 읽는 이름으로. 목록에 없는 모델이면 id 그대로. */
  modelLabel: (modelId: string | null) => string
  runs: TestRun[]
  starts: QuickStart[]
  onClose: () => void
  onPickRun: (runId: string) => void
  onPickStart: (start: QuickStart) => void
  onAction: (action: PaletteAction) => void
}) {
  const { t } = useI18n()
  const l = t.qa.launch
  const titleId = useId()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const match = (text: string) => needle.length === 0 || text.toLowerCase().includes(needle)
    const startItems: Item[] = starts
      .filter((start) => match(start.run.testRunName ?? ''))
      .map((start) => ({
        kind: 'start',
        key: `s-${start.run.id}`,
        title: [start.run.testRunName, start.run.gameInstanceName, modelLabel(start.run.model)].filter(Boolean).join(' · '),
        sub: l.quickStartTimes(start.times),
        start,
      }))
    const runItems: Item[] = runs
      .filter((run) => match(run.name))
      .slice(0, 8)
      .map((run) => ({
        kind: 'run',
        key: `r-${run.id}`,
        title: run.name,
        sub: [run.gameBuild?.label ?? run.gameBuild?.version ?? l.noVersion, l.runMeta(run.scenarioCount)].filter(Boolean).join(' · '),
        run,
      }))
    const actionItems: Item[] = ([
      ['new-run', l.actionNewRun],
      ['install', l.actionInstall],
      ['consoles', l.actionConsoles],
    ] as const)
      .filter(([, title]) => match(title))
      .map(([action, title]) => ({ kind: 'action', key: `a-${action}`, title, sub: '', action }))
    return [
      { label: l.paletteRecent, items: startItems },
      { label: l.paletteRuns, items: runItems },
      { label: l.paletteActions, items: actionItems },
    ].filter((group) => group.items.length > 0)
  }, [query, runs, starts, l, modelLabel])
  const flat = groups.flatMap((group) => group.items)
  const current = Math.min(active, Math.max(flat.length - 1, 0))

  function choose(item: Item) {
    if (item.kind === 'start') onPickStart(item.start)
    else if (item.kind === 'run') onPickRun(item.run.id)
    else onAction(item.action)
  }

  return (
    <Dialog labelledBy={titleId} onClose={onClose} title={l.find}>
      <div className="ql-palette">
        <label className="ql-search ql-search--big">
          <SearchIcon size={17} />
          <span className="visually-hidden">{l.findHint}</span>
          <input
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActive((index) => Math.min(index + 1, flat.length - 1))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActive((index) => Math.max(index - 1, 0))
              } else if (event.key === 'Enter' && flat[current] !== undefined) {
                event.preventDefault()
                choose(flat[current])
              }
            }}
            placeholder={l.findHint}
            type="search"
            value={query}
          />
        </label>
        <div className="ql-palette-list" role="listbox" aria-label={l.find}>
          {flat.length === 0 && <p className="ql-empty">{l.paletteEmpty}</p>}
          {groups.map((group) => (
            <div key={group.label} role="group" aria-label={group.label}>
              <span className="ql-palette-group">{group.label}</span>
              {group.items.map((item) => {
                const index = flat.indexOf(item)
                return (
                  <button
                    aria-selected={index === current}
                    className={'ql-palette-item' + (index === current ? ' is-active' : '')}
                    key={item.key}
                    onClick={() => choose(item)}
                    onMouseEnter={() => setActive(index)}
                    role="option"
                    type="button"
                  >
                    <span className="ql-palette-title">{item.title}</span>
                    {item.sub.length > 0 && <span className="ql-palette-sub">{item.sub}</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        <p className="ql-palette-keys">{l.paletteKeys}</p>
      </div>
    </Dialog>
  )
}
