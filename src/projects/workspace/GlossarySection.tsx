import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { StateNameSketch } from '../../emptyStates/sketches'
import { SketchEmpty } from '../../emptyStates/SketchEmpty'
import { useI18n } from '../../i18n/useI18n'
import type { GameIdentity } from '../gameIdentityApi'
import { linkOf, type StateFilter } from './glossaryLinks'
import {
  editGlossaryTerm,
  TERM_KINDS,
  type GlossaryTerm,
  type GlossaryTermEdit,
  type TermKind,
} from '../../testCases/glossaryApi'

/**
 * 게임 사전의 상태 이름 탭(ARTEL-1396, 예전 용어집 ARTEL-1313). 저작이 TC 를 잇는 데 쓰는 상태 이름 · 시작 값을 보고 고치고,
 * 이름마다 게임이 SDK 로 알려 준 변수를 잇는다. 표는 게임 빌드와 같은 모양이고, 줄을 누르면 케이스 편집과 같은 오른쪽 창이
 * 열린다. 여기서 고친 칸은 사람이 정한 것이 되어 AI 정리 · MCP 가 덮지 않는다. "확인 필요" 는 서버가 정한다 — 설명이 없거나,
 * 시작 값을 모르거나, 시작 값이 종류와 안 맞는 이름이다.
 */
export function GlossaryStates({
  projectId,
  terms,
  variables,
  buildName,
  onSaved,
}: {
  projectId: string
  terms: readonly GlossaryTerm[]
  /** 고른 빌드의 게임 변수. 잇기 고르기와 표의 ✓ 가 이것을 본다. */
  variables: readonly GameIdentity[]
  buildName: string
  onSaved: (term: GlossaryTerm) => void
}) {
  const { t } = useI18n()
  const m = t.testCases.glossary
  const [filter, setFilter] = useState<StateFilter>('all')
  const [editing, setEditing] = useState<GlossaryTerm | null>(null)

  const counts = useMemo(() => ({
    all: terms.length,
    issues: terms.filter((term) => term.issues.length > 0).length,
    linked: terms.filter((term) => linkOf(term, variables).kind === 'found').length,
    unlinked: terms.filter((term) => linkOf(term, variables).kind !== 'found').length,
  }), [terms, variables])
  const shown = terms.filter((term) =>
    filter === 'all' ? true
      : filter === 'issues' ? term.issues.length > 0
        : filter === 'linked' ? linkOf(term, variables).kind === 'found'
          : linkOf(term, variables).kind !== 'found')

  const saved = useCallback((term: GlossaryTerm) => {
    onSaved(term)
    setEditing(null)
  }, [onSaved])

  if (terms.length === 0) return (
    <section className="panel">
      <SketchEmpty body={t.gameIdentities.dictionary.statesEmptyBody} compact surface sketch={<StateNameSketch />} title={t.gameIdentities.dictionary.statesEmptyTitle} />
    </section>
  )

  return (
    // `cp-scope`: 케이스 편집 창과 같은 오른쪽 창 · 입력을 쓰므로 그 색 변수를 단다.
    <section aria-label={m.label} className="panel panel--flush cp-scope">
      <div className="gls-chips tcl-chips" role="group" aria-label={m.filterLabel}>
        {(['all', 'issues', 'linked', 'unlinked'] as const).map((key) => (
          <button aria-pressed={filter === key} className={filter === key ? 'fchip on' : 'fchip'} key={key} onClick={() => setFilter(key)} type="button">
            {m.filters[key]} {counts[key]}
          </button>
        ))}
      </div>
      <div aria-label={m.scrollRegion} className="gb-table-scroll" role="region" tabIndex={0}>
        <table className="data-table gb-table gls-table">
          <thead>
            <tr>
              <th scope="col">{m.nameColumn}</th>
              <th scope="col">{m.kindColumn}</th>
              <th scope="col">{m.startColumn}</th>
              <th scope="col">{m.meaningColumn}</th>
              <th scope="col">{m.variableColumn}</th>
              <th className="gls-num" scope="col">{m.usedByColumn}</th>
              <th scope="col">{m.setByColumn}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((term) => (
              <tr className={editing?.name === term.name ? 'gb-row is-selected' : 'gb-row'} key={term.name} onClick={() => setEditing(term)}>
                <td>
                  <button className="table-link gls-name" onClick={(event) => { event.stopPropagation(); setEditing(term) }} translate="no" type="button">
                    {term.name}
                  </button>
                  {term.issues.length > 0 && <span className="gls-flag">{term.issues.map((issue) => m.issue[issue]).join(' · ')}</span>}
                </td>
                <td><span className="gls-kind">{m.kindShort[term.kind as TermKind] ?? term.kind}</span></td>
                <td className="table-meta mono">{term.start}</td>
                <td className={term.meaning ? 'gls-meaning' : 'gls-meaning table-meta'}>{term.meaning || m.noMeaning}</td>
                <td><LinkCell link={linkOf(term, variables)} /></td>
                <td className="table-meta gls-num">{term.usedBy}</td>
                <td className={`gls-by gls-by--${decidedBy(term)}`}>{m.source[decidedBy(term)]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing !== null && (
        <GlossaryTermSheet
          buildName={buildName}
          key={editing.name}
          onClose={() => setEditing(null)}
          onSaved={saved}
          projectId={projectId}
          term={editing}
          variables={variables}
        />
      )}
    </section>
  )
}

/** 표의 게임 변수 칸. 색만으로 말하지 않게 ✓ · ! · — 와 글자를 함께 둔다. */
function LinkCell({ link }: { link: ReturnType<typeof linkOf> }) {
  const { t } = useI18n()
  const m = t.testCases.glossary
  if (link.kind === 'none') return <span className="gls-link gls-link--none"><i aria-hidden="true">—</i>{m.linkNone}</span>
  if (link.kind === 'missing')
    return (
      <span className="gls-link gls-link--missing" title={m.linkMissingHint}>
        <i aria-hidden="true">!</i>
        <span className="mono" translate="no">{link.name}</span>
        {m.linkMissing}
      </span>
    )
  return (
    <span className="gls-link gls-link--found">
      <i aria-hidden="true">✓</i>
      <span className="mono" translate="no">{link.variable.name}</span>
      <span className="gls-link-kind">{link.variable.kind}</span>
    </span>
  )
}

/** 표의 "정한 쪽" 칸. 칸마다 다를 수 있어, 가장 위의 정한 쪽을 보인다(사람 > MCP > AI). */
function decidedBy(term: GlossaryTerm): 'user' | 'mcp' | 'ai' {
  const sources = Object.values(term.setBy)
  if (sources.includes('user')) return 'user'
  if (sources.includes('mcp')) return 'mcp'
  return 'ai'
}

type Draft = { kind: string; meaning: string; options: string; start: string; aliases: string; gameVariable: string }

function toDraft(term: GlossaryTerm): Draft {
  return {
    kind: term.kind,
    meaning: term.meaning,
    options: term.options.join(', '),
    start: term.start === 'unknown' ? '' : term.start,
    aliases: term.aliases.join(', '),
    gameVariable: term.gameVariable ?? '',
  }
}

function list(text: string): string[] {
  return text.split(',').map((item) => item.trim()).filter((item) => item.length > 0)
}

/** 바뀐 칸만 담는다. 별칭은 보낸 목록이 그대로 별칭이 된다. */
function toEdit(term: GlossaryTerm, draft: Draft): GlossaryTermEdit {
  const edit: GlossaryTermEdit = { name: term.name }
  if (draft.kind !== term.kind) edit.kind = draft.kind
  if (draft.meaning.trim() !== term.meaning) edit.meaning = draft.meaning.trim()
  if (list(draft.options).join(',') !== term.options.join(',')) edit.options = list(draft.options)
  if (draft.start.trim().length > 0 && draft.start.trim() !== term.start) edit.start = draft.start.trim()
  if (list(draft.aliases).join(',') !== term.aliases.join(',')) edit.aliases = list(draft.aliases)
  if (draft.gameVariable !== (term.gameVariable ?? '')) edit.gameVariable = draft.gameVariable
  return edit
}

/** 용어 하나를 고치는 오른쪽 창. 케이스 편집 창(`TestCaseSheet`)과 같은 틀 · 같은 입력이다. */
function GlossaryTermSheet({ projectId, term, variables, buildName, onClose, onSaved }: {
  projectId: string
  term: GlossaryTerm
  variables: readonly GameIdentity[]
  buildName: string
  onClose: () => void
  onSaved: (term: GlossaryTerm) => void
}) {
  const { t } = useI18n()
  const m = t.testCases.glossary
  const [draft, setDraft] = useState<Draft>(() => toDraft(term))
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const sheetRef = useRef<HTMLElement | null>(null)
  const meaningId = useId()
  const kindId = useId()
  const startId = useId()
  const optionsId = useId()
  const aliasesId = useId()
  const variableId = useId()
  const chosen = variables.find((item) => item.name === draft.gameVariable && !item.deleted) ?? null
  const edit = toEdit(term, draft)
  const dirty = Object.keys(edit).length > 1
  const options = list(draft.options)

  useEffect(() => { sheetRef.current?.querySelector<HTMLElement>('textarea, input')?.focus() }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!dirty) return
    setPending(true)
    setFailed(null)
    try {
      onSaved(await editGlossaryTerm(projectId, edit))
    } catch (error) {
      setFailed(error instanceof Error ? error.message : m.saveFailed)
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <div className="tcl-scrim" onClick={onClose} />
      <aside
        aria-label={m.editTitle(term.name)}
        aria-modal="true"
        className="tcl-sheet"
        onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}
        ref={sheetRef}
        role="dialog"
      >
        <header className="tcl-sheet-head">
          <div className="tcl-sheet-tags">
            <span className="tc-id" translate="no">{term.name}</span>
            {term.issues.length > 0 && <span className="gls-flag">{term.issues.map((issue) => m.issue[issue]).join(' · ')}</span>}
          </div>
          <button className="tcl-sheet-close" onClick={onClose} title={m.close} type="button">✕</button>
        </header>
        <p className="tcl-sheet-meta">{m.usedBy(term.usedBy)} · {m.decidedNote}</p>

        <form className="tcl-editor" noValidate onSubmit={(event) => void submit(event)}>
          <div className="tce-meta">
            <div className="tce-field tce-field--full">
              <span className="tce-label" id={kindId}>{m.kindColumn}</span>
              <div aria-labelledby={kindId} className="tce-seg tce-seg--fit" role="radiogroup">
                {TERM_KINDS.map((kind) => (
                  <button
                    aria-checked={draft.kind === kind}
                    className={'tce-seg-btn' + (draft.kind === kind ? ' on' : '')}
                    disabled={pending}
                    key={kind}
                    onClick={() => setDraft({ ...draft, kind, start: '' })}
                    role="radio"
                    type="button"
                  >
                    {m.kinds[kind]}
                  </button>
                ))}
              </div>
            </div>

            <div className="tce-field tce-field--full">
              <label className="tce-label" htmlFor={meaningId}>{m.meaningColumn}</label>
              <textarea className="tce-input" disabled={pending} id={meaningId} onChange={(event) => setDraft({ ...draft, meaning: event.target.value })} placeholder={m.meaningPlaceholder} rows={2} value={draft.meaning} />
            </div>

            {draft.kind === 'value' && (
              <div className="tce-field tce-field--full">
                <label className="tce-label" htmlFor={optionsId}>{m.optionsLabel}</label>
                <input className="tce-input tce-input--one" disabled={pending} id={optionsId} onChange={(event) => setDraft({ ...draft, options: event.target.value })} placeholder={m.listPlaceholder} value={draft.options} />
              </div>
            )}

            <div className="tce-field tce-field--full">
              <span className="tce-label" id={startId}>{m.startColumn}</span>
              {draft.kind === 'has' || (draft.kind === 'value' && options.length > 0) ? (
                <div aria-labelledby={startId} className="tce-seg tce-seg--fit" role="radiogroup">
                  {(draft.kind === 'has' ? ['0', '1'] : options).map((value) => (
                    <button
                      aria-checked={draft.start === value}
                      className={'tce-seg-btn' + (draft.start === value ? ' on' : '')}
                      disabled={pending}
                      key={value}
                      onClick={() => setDraft({ ...draft, start: value })}
                      role="radio"
                      type="button"
                    >
                      {draft.kind === 'has' ? m.hasValue[value as '0' | '1'] : value}
                    </button>
                  ))}
                </div>
              ) : (
                <input aria-labelledby={startId} className="tce-input tce-input--one" disabled={pending} inputMode={draft.kind === 'counter' ? 'numeric' : undefined} onChange={(event) => setDraft({ ...draft, start: event.target.value })} placeholder={m.startPlaceholder} value={draft.start} />
              )}
            </div>

            <div className="tce-field tce-field--full">
              <label className="tce-label" htmlFor={aliasesId}>{m.aliasesColumn}</label>
              <input className="tce-input tce-input--one" disabled={pending} id={aliasesId} onChange={(event) => setDraft({ ...draft, aliases: event.target.value })} placeholder={m.listPlaceholder} value={draft.aliases} />
            </div>
          </div>

          <div className="tce-field tce-field--full gls-variable">
            <label className="tce-label" htmlFor={variableId}>
              {m.variableColumn} <span className="gls-variable-build mono">{buildName}</span>
            </label>
            <select className="tce-input tce-input--one" disabled={pending} id={variableId} onChange={(event) => setDraft({ ...draft, gameVariable: event.target.value })} value={draft.gameVariable}>
              <option value="">{m.linkNone}</option>
              {draft.gameVariable !== '' && chosen === null && <option value={draft.gameVariable}>{draft.gameVariable} · {m.linkMissing}</option>}
              {variables.filter((item) => !item.deleted).map((item) => (
                <option key={item.id} value={item.name}>{item.name} · {item.kind}{item.meaning ? ` · ${item.meaning}` : ''}</option>
              ))}
            </select>
            {chosen !== null ? (
              <dl className="gls-variable-card">
                <div><dt>{m.variableMeaning}</dt><dd>{chosen.meaning || m.noMeaning}</dd></div>
                <div><dt>{m.variableChanges}</dt><dd>{chosen.changesWhen || m.noMeaning}</dd></div>
              </dl>
            ) : (
              <span className="gls-variable-hint">{variables.length === 0 ? m.noVariables : m.variableHint}</span>
            )}
          </div>

          {failed !== null && <p className="inline-error" role="alert">{failed}</p>}

          <div className="tcl-editor-actions">
            <span className="tcl-editor-spacer" />
            <button className="button button--secondary button--compact" disabled={pending} onClick={onClose} type="button">{m.cancel}</button>
            <button className="button button--primary button--compact" disabled={pending || !dirty} type="submit">{pending ? m.saving : m.save}</button>
          </div>
        </form>
      </aside>
    </>
  )
}
