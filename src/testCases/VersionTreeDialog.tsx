import { useId, useMemo, useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
import {
  arrangeVersions,
  hiddenVersions,
  versionName,
  type TestCaseVersionSummary,
  type VersionGroup,
} from './testCaseVersions'

/**
 * 버전을 하나 고르는 모달(ARTEL-1032). 라이브러리 왼쪽 목록과 같은 모양 — 묶음 아래 버전, 묶음 없는 버전, 맨 아래
 * 숨긴 버전 — 으로 펼쳐 고른다. 고르기 상자로는 묶음이 보이지 않아 `1.X` 와 `2.X` 의 같은 이름 버전을 가를 수 없다.
 *
 * [allowNone] 이면 맨 아래에 "버전 없음"(null)을 고를 수 있다. 줄은 radio 이고 ↑↓ 로 움직인다.
 */
export function VersionTreeDialog({
  allowNone = false,
  confirmLabel,
  groups,
  hint,
  initialId,
  onClose,
  onConfirm,
  title,
  versions,
}: {
  allowNone?: boolean
  confirmLabel: string
  groups: readonly VersionGroup[]
  hint?: string
  /** 처음 고른 버전. null 은 "버전 없음"이다. */
  initialId: string | null
  onClose: () => void
  onConfirm: (gameBuildId: string | null) => Promise<void> | void
  title: string
  versions: readonly TestCaseVersionSummary[]
}) {
  const { t } = useI18n()
  const m = t.testCases.versionTree
  const titleId = useId()
  const entries = useMemo(() => arrangeVersions(versions, groups), [versions, groups])
  const hidden = useMemo(() => hiddenVersions(versions), [versions])
  const [selected, setSelected] = useState<string | null>(initialId)
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  const [showHidden, setShowHidden] = useState(hidden.some((version) => version.gameBuildId === initialId))
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const option = (version: TestCaseVersionSummary) => (
    <li key={version.gameBuildId}>
      <button
        aria-checked={selected === version.gameBuildId}
        className={'vtree-option' + (selected === version.gameBuildId ? ' is-selected' : '') + (version.hidden ? ' is-hidden' : '')}
        onClick={() => setSelected(version.gameBuildId)}
        onDoubleClick={() => void confirm(version.gameBuildId)}
        role="radio"
        type="button"
      >
        <span aria-hidden="true" className="vtree-radio" />
        <span className="vtree-name">{versionName(version)}</span>
        {version.latest && <span className="tcl-version-latest">{t.testCases.versions.latest}</span>}
        <span className="vtree-count">{version.total}</span>
      </button>
    </li>
  )

  async function confirm(value: string | null) {
    setPending(true)
    setFailure(null)
    try {
      await onConfirm(value)
    } catch {
      setFailure(m.failed)
      setPending(false)
    }
  }

  /** ↑↓ 로 보이는 줄 사이를 움직이고 고른다. */
  function moveSelection(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="radio"]')]
    if (buttons.length === 0) return
    event.preventDefault()
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = buttons[Math.min(buttons.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))]
    next.focus()
    next.click()
  }

  return (
    <Dialog labelledBy={titleId} onClose={onClose} title={title}>
      <form
        className="form"
        onSubmit={(event) => {
          // body 로 뜬 dialog 라도 React 이벤트는 여는 쪽의 폼까지 올라간다. 여기서 멈춘다.
          event.preventDefault()
          event.stopPropagation()
          void confirm(selected)
        }}
      >
        {hint !== undefined && <p className="field-hint">{hint}</p>}
        <div aria-label={m.label} className="vtree" onKeyDown={moveSelection} role="radiogroup">
          <ul className="vtree-list">
            {entries.map((entry) => {
              if (entry.kind === 'version') return option(entry.version)
              const group = entry.group
              const isFolded = folded.has(group.id)
              return (
                <li key={`group:${group.id}`}>
                  <button
                    aria-expanded={!isFolded}
                    className="vtree-group"
                    onClick={() =>
                      setFolded((current) => {
                        const next = new Set(current)
                        if (next.has(group.id)) next.delete(group.id)
                        else next.add(group.id)
                        return next
                      })
                    }
                    type="button"
                  >
                    <Chevron open={!isFolded} />
                    <span className="vtree-name">{group.name}</span>
                    <span className="vtree-count">{entry.versions.length}</span>
                  </button>
                  {!isFolded && entry.versions.length > 0 && (
                    <ul className="vtree-list vtree-list--nested">{entry.versions.map(option)}</ul>
                  )}
                </li>
              )
            })}
            {allowNone && (
              <li>
                <button
                  aria-checked={selected === null}
                  className={'vtree-option vtree-option--none' + (selected === null ? ' is-selected' : '')}
                  onClick={() => setSelected(null)}
                  role="radio"
                  type="button"
                >
                  <span aria-hidden="true" className="vtree-radio" />
                  <span className="vtree-name">{t.testCases.versions.unversioned}</span>
                </button>
              </li>
            )}
          </ul>
          {hidden.length > 0 && (
            <>
              <button
                aria-expanded={showHidden}
                className="vtree-group vtree-group--hidden"
                onClick={() => setShowHidden((value) => !value)}
                type="button"
              >
                <Chevron open={showHidden} />
                <span className="vtree-name">{t.testCases.versions.hiddenVersions(hidden.length)}</span>
              </button>
              {showHidden && <ul className="vtree-list vtree-list--nested">{hidden.map(option)}</ul>}
            </>
          )}
        </div>
        {failure !== null && (
          <div className="inline-error" role="alert">
            <span aria-hidden="true">!</span>
            {failure}
          </div>
        )}
        <div className="dialog-actions">
          <button className="button button--secondary" disabled={pending} onClick={onClose} type="button">
            {m.cancel}
          </button>
          <button className="button button--primary" disabled={pending || (!allowNone && selected === null)} type="submit">
            {pending ? m.pending : confirmLabel}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" className={'tcl-chevron' + (open ? ' is-open' : '')} viewBox="0 0 16 16">
      <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  )
}
