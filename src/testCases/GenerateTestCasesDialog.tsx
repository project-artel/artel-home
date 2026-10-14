import { useEffect, useId, useState } from 'react'
import { readCarryOver, storeCarryOver } from '../contentMap/carryOverChoice'
import { generateContentMapTestCases, type GeneratedTestCases } from '../contentMap/generateContentMapTestCases'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
import { ProjectApiError } from '../projects/projectApi'
import {
  candidateOutcome,
  firstCreatable,
  listGenerationCandidates,
  type GenerationCandidate,
} from './generationCandidates'

type Loaded = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; candidates: GenerationCandidate[] }

/**
 * 게임 빌드를 골라 그 지도에서 TC 를 만드는 모달(ARTEL-1041). 화면 지도에 있던 생성 버튼을 라이브러리로 옮긴 것이다.
 *
 * 줄마다 고르면 무슨 일이 생기는지를 먼저 보인다 — 만들 수 있다, 이미 만들었다, 지도가 아직 안 읽혔다, 지도가 없다.
 * 같은 빌드의 새 TC 버전은 아직 없어서, 이미 만든 빌드는 고를 수 없다.
 */
export function GenerateTestCasesDialog({
  onClose,
  onGenerated,
  projectId,
}: {
  onClose: () => void
  onGenerated: (candidate: GenerationCandidate, result: GeneratedTestCases) => void
  projectId: string
}) {
  const { t } = useI18n()
  const m = t.testCases.generate
  const titleId = useId()
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' })
  const [picked, setPicked] = useState<string | null>(null)
  const [carryOver, setCarryOver] = useState(readCarryOver)
  const [pending, setPending] = useState(false)
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

  const candidates = loaded.status === 'ready' ? loaded.candidates : []
  const chosen = candidates.find((candidate) => candidate.gameBuildId === picked) ?? null

  async function generate() {
    if (chosen === null) return
    setPending(true)
    setFailure(null)
    try {
      const result = await generateContentMapTestCases(projectId, chosen.gameBuildId, carryOver)
      onGenerated(chosen, result)
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

  return (
    <Dialog labelledBy={titleId} onClose={onClose} title={m.title}>
      <form
        className="form"
        onSubmit={(event) => {
          // body 로 뜬 dialog 라도 React 이벤트는 여는 쪽까지 올라간다. 여기서 멈춘다.
          event.preventDefault()
          event.stopPropagation()
          void generate()
        }}
      >
        <p className="field-hint">{m.hint}</p>
        {loaded.status === 'loading' && <p className="panel-empty" aria-busy="true">{m.loading}</p>}
        {loaded.status === 'failed' && <p className="panel-empty" role="alert">{m.loadFailed}</p>}
        {loaded.status === 'ready' && candidates.length === 0 && <p className="panel-empty">{m.empty}</p>}
        {candidates.length > 0 && (
          <ul aria-label={m.listLabel} className="vtree-list gen-list" role="radiogroup">
            {candidates.map((candidate) => {
              const outcome = candidateOutcome(candidate)
              const selectable = outcome === 'create'
              const on = picked === candidate.gameBuildId
              return (
                <li key={candidate.gameBuildId}>
                  <button
                    aria-checked={on}
                    className={'vtree-option gen-option' + (on ? ' is-selected' : '') + (selectable ? '' : ' is-blocked')}
                    disabled={!selectable || pending}
                    onClick={() => setPicked(candidate.gameBuildId)}
                    onDoubleClick={() => {
                      if (selectable) void generate()
                    }}
                    role="radio"
                    type="button"
                  >
                    <span aria-hidden="true" className="vtree-radio" />
                    <span className="vtree-name">
                      {candidate.version}
                      {candidate.label !== null && candidate.label.length > 0 && (
                        <span className="gen-label"> · {candidate.label}</span>
                      )}
                    </span>
                    <span className={`gen-outcome gen-outcome--${outcome}`}>{m.outcome[outcome](candidate.version)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
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
            {pending ? m.pending : m.confirm}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
