import { forwardRef, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { formatDateTime } from '../projects/formatters'
import type { GameBuild } from '../projects/gameTypes'

/**
 * 빌드 고르기(ARTEL-1172). 단순 드롭다운은 버전 문자열 한 줄뿐이라 같은 `1.0` 이 여럿이면 무엇이 무엇인지 몰랐고,
 * 빌드가 늘면 긴 목록을 위아래로 훑어야 했다. 지금 빌드를 버튼에 보이고, 누르면 찾기 · 새 것이 위 · 라벨 · 만든 날 ·
 * 에디터 표시가 붙은 목록이 뜬다.
 *
 * `ref` 는 버튼이다 — agent 의 `contentMap.build` field 가 강조할 자리.
 */
export const BuildSwitcher = forwardRef<HTMLButtonElement, {
  builds: readonly GameBuild[]
  selected: GameBuild
  onSelect: (buildId: string) => void
}>(function BuildSwitcher({ builds, selected, onSelect }, ref) {
  const { t } = useI18n()
  const copy = t.contentMap.buildSwitcher
  const editorLabel = t.projects.builds.editorLabel
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const panelId = useId()
  const root = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)

  const ordered = useMemo(() => [...builds].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [builds])
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return ordered
    return ordered.filter((build) => {
      const text = [build.version, build.label ?? '', build.isEditor ? editorLabel : '', build.id].join(' ').toLowerCase()
      return words.every((word) => text.includes(word))
    })
  }, [ordered, query, editorLabel])

  // 바깥을 누르면 닫는다. Esc 는 패널의 onKeyDown 이 닫는다.
  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (root.current !== null && !root.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    search.current?.focus()
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function pick(buildId: string) {
    setOpen(false)
    setQuery('')
    if (buildId !== selected.id) onSelect(buildId)
  }

  const label = selected.label?.trim() ?? ''

  return (
    <div className="cm-build-switcher" ref={root}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="cm-build-current"
        onClick={() => setOpen((current) => !current)}
        ref={ref}
        type="button"
      >
        <span className="cm-build-current-caption">{copy.caption}</span>
        <span className="cm-build-version mono">{selected.version}</span>
        {selected.isEditor && <span className="cm-build-badge">{editorLabel}</span>}
        {label.length > 0 && <span className="cm-build-label">{label}</span>}
        <span className="cm-build-count">{copy.count(builds.length)}</span>
        <span aria-hidden="true" className="cm-build-caret">
          ▾
        </span>
      </button>

      {open && (
        <div
          aria-label={copy.title}
          className="cm-build-panel"
          id={panelId}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            event.stopPropagation()
            setOpen(false)
          }}
          role="dialog"
        >
          <input
            aria-label={copy.search}
            className="field-input cm-build-search"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && shown.length > 0) pick(shown[0].id)
            }}
            placeholder={copy.searchPlaceholder}
            ref={search}
            type="search"
            value={query}
          />
          {shown.length === 0 ? (
            <p className="cm-build-empty">{copy.noMatch}</p>
          ) : (
            <ul className="cm-build-list">
              {shown.map((build, index) => {
                const current = build.id === selected.id
                const buildLabel = build.label?.trim() ?? ''
                return (
                  <li key={build.id}>
                    <button
                      aria-current={current ? 'true' : undefined}
                      className={`cm-build-option${current ? ' is-current' : ''}`}
                      onClick={() => pick(build.id)}
                      type="button"
                    >
                      <span className="cm-build-option-head">
                        <span className="cm-build-version mono">{build.version}</span>
                        {build.isEditor && <span className="cm-build-badge">{editorLabel}</span>}
                        {index === 0 && query.length === 0 && <span className="cm-build-badge cm-build-badge--new">{copy.newest}</span>}
                        {current && <span className="cm-build-badge cm-build-badge--current">{copy.current}</span>}
                      </span>
                      <span className="cm-build-option-meta">
                        {buildLabel.length > 0 && <span className="cm-build-label">{buildLabel}</span>}
                        <span>{copy.createdAt(formatDateTime(build.createdAt))}</span>
                        <span className="mono">#{build.id}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
})
