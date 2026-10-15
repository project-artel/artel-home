import { useEffect, useId, useMemo, useState } from 'react'
import { readCarryOver, storeCarryOver } from '../contentMap/carryOverChoice'
import { generateContentMapTestCases, type GeneratedTestCases } from '../contentMap/generateContentMapTestCases'
import { ConfirmActionDialog } from '../design-system/primitives/ConfirmActionDialog'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
import { ProjectApiError } from '../projects/projectApi'
import {
  arrangeCandidates,
  candidateOutcome,
  firstCreatable,
  isSelectable,
  listGenerationCandidates,
  type GenerationCandidate,
} from './generationCandidates'
import type { TestCaseVersionSummary, VersionGroup } from './testCaseVersions'

type Loaded = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; candidates: GenerationCandidate[] }

/**
 * 게임 빌드를 골라 그 지도에서 TC 를 만드는 모달(ARTEL-1041). 화면 지도에 있던 생성 버튼을 라이브러리로 옮긴 것이다.
 *
 * 빌드는 라이브러리 왼쪽 목록과 같은 트리로 보인다 — 묶음 아래 버전, 묶음 없는 버전, 맨 아래 숨긴 버전. 줄마다 고르면
 * 무슨 일이 생기는지를 먼저 보인다. 이미 TC 를 만든 빌드는 덮어쓰기이고, 누르면 무엇을 잃을 수 있는지 경고한 뒤에만
 * 보낸다.
 */
export function GenerateTestCasesDialog({
  groups,
  onClose,
  onGenerated,
  projectId,
  versions,
}: {
  groups: readonly VersionGroup[]
  onClose: () => void
  onGenerated: (candidate: GenerationCandidate, result: GeneratedTestCases) => void
  projectId: string
  versions: readonly TestCaseVersionSummary[]
}) {
  const { t } = useI18n()
  const m = t.testCases.generate
  const titleId = useId()
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' })
  const [picked, setPicked] = useState<string | null>(null)
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  const [showHidden, setShowHidden] = useState(false)
  const [carryOver, setCarryOver] = useState(readCarryOver)
  const [pending, setPending] = useState(false)
  const [confirmingOverwrite, setConfirmingOverwrite] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    listGenerationCandidates(projectId, controller.signal)
      .then((candidates) => {
        setLoaded({ status: 'ready', candidates })
        setPicked(firstCreatable(candidates))
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setLoaded({ status: 'failed' })
      })
    return () => controller.abort()
  }, [projectId])

  const candidates = useMemo(() => (loaded.status === 'ready' ? loaded.candidates : []), [loaded])
  const tree = useMemo(() => arrangeCandidates(candidates, versions, groups), [candidates, versions, groups])
  const chosen = candidates.find((candidate) => candidate.gameBuildId === picked) ?? null
  const overwriting = chosen !== null && candidateOutcome(chosen) === 'overwrite'

  async function generate(target: GenerationCandidate) {
    const result = await generateContentMapTestCases(projectId, target.gameBuildId, carryOver, candidateOutcome(target) === 'overwrite')
    onGenerated(target, result)
  }

  async function submit(target: GenerationCandidate | null) {
    if (target === null || !isSelectable(target)) return
    if (candidateOutcome(target) === 'overwrite') {
      setPicked(target.gameBuildId)
      setConfirmingOverwrite(true)
      return
    }
    setPending(true)
    setFailure(null)
    try {
      await generate(target)
    } catch (cause) {
      setFailure(failureMessage(cause))
      setPending(false)
    }
  }

  function failureMessage(cause: unknown): string {
    if (cause instanceof ProjectApiError) {
      if (cause.code === 'TEST_CASES_ALREADY_GENERATED') return m.failure.alreadyGenerated
      if (cause.status === 409) return m.failure.notReady
      if (cause.status === 404) return m.failure.buildMissing
    }
    return m.failure.other
  }

  const option = (candidate: GenerationCandidate) => {
    const outcome = candidateOutcome(candidate)
    const selectable = isSelectable(candidate)
    const on = picked === candidate.gameBuildId
    return (
      <li key={candidate.gameBuildId}>
        <button
          aria-checked={on}
          className={'vtree-option gen-option' + (on ? ' is-selected' : '') + (selectable ? '' : ' is-blocked')}
          disabled={!selectable || pending}
          onClick={() => setPicked(candidate.gameBuildId)}
          onDoubleClick={() => void submit(candidate)}
          role="radio"
          type="button"
        >
          <span aria-hidden="true" className="vtree-radio" />
          <span className="vtree-name">
            {candidate.version}
            {candidate.label !== null && candidate.label.length > 0 && <span className="gen-label"> · {candidate.label}</span>}
          </span>
          <span className={`gen-outcome gen-outcome--${outcome}`}>{m.outcome[outcome](candidate.version)}</span>
        </button>
      </li>
    )
  }

  return (
    <>
      <Dialog hint={m.hint} labelledBy={titleId} onClose={onClose} title={m.title}>
        <form
          className="form"
          onSubmit={(event) => {
            // body 로 뜬 dialog 라도 React 이벤트는 여는 쪽까지 올라간다. 여기서 멈춘다.
            event.preventDefault()
            event.stopPropagation()
            void submit(chosen)
          }}
        >
          {loaded.status === 'loading' && <p className="panel-empty" aria-busy="true">{m.loading}</p>}
          {loaded.status === 'failed' && <p className="panel-empty" role="alert">{m.loadFailed}</p>}
          {loaded.status === 'ready' && candidates.length === 0 && <p className="panel-empty">{m.empty}</p>}
          {candidates.length > 0 && (
            <div aria-label={m.listLabel} className="vtree gen-list" role="radiogroup">
              <ul className="vtree-list">
                {tree.entries.map((entry) => {
                  if (entry.kind === 'candidate') return option(entry.candidate)
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
                        <span className="vtree-count">{entry.candidates.length}</span>
                      </button>
                      {!isFolded && entry.candidates.length > 0 && (
                        <ul className="vtree-list vtree-list--nested">{entry.candidates.map(option)}</ul>
                      )}
                    </li>
                  )
                })}
              </ul>
              {tree.hidden.length > 0 && (
                <>
                  <button
                    aria-expanded={showHidden}
                    className="vtree-group vtree-group--hidden"
                    onClick={() => setShowHidden((value) => !value)}
                    type="button"
                  >
                    <Chevron open={showHidden} />
                    <span className="vtree-name">{t.testCases.versions.hiddenVersions(tree.hidden.length)}</span>
                  </button>
                  {showHidden && <ul className="vtree-list vtree-list--nested">{tree.hidden.map(option)}</ul>}
                </>
              )}
            </div>
          )}
          <label className="cm-generate-carry gen-carry">
            <input
              checked={carryOver}
              disabled={pending}
              onChange={(event) => {
                setCarryOver(event.target.checked)
                storeCarryOver(event.target.checked)
              }}
              type="checkbox"
            />
            <span>
              {t.contentMap.generate.carryOver}
              <small>{t.contentMap.generate.carryOverHint}</small>
            </span>
          </label>
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
            <button className="button button--primary" disabled={pending || chosen === null} type="submit">
              {pending ? m.pending : overwriting ? m.overwrite.open : m.confirm}
            </button>
          </div>
        </form>
      </Dialog>

      {confirmingOverwrite && chosen !== null && (
        <ConfirmActionDialog
          body={
            <>
              <p>{m.overwrite.lead(chosen.version, chosen.mapCases, chosen.judged)}</p>
              <ul className="gen-warning">
                <li>{m.overwrite.kept}</li>
                <li>{m.overwrite.removed}</li>
                <li>{m.overwrite.edited}</li>
                <li>{m.overwrite.manual}</li>
              </ul>
            </>
          }
          cancelLabel={m.cancel}
          confirmLabel={m.overwrite.confirm}
          onClose={() => setConfirmingOverwrite(false)}
          onConfirm={() => generate(chosen)}
          pendingLabel={m.pending}
          title={m.overwrite.title(chosen.version)}
          toFailureMessage={failureMessage}
        />
      )}
    </>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" className={'tcl-chevron' + (open ? ' is-open' : '')} viewBox="0 0 16 16">
      <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  )
}
