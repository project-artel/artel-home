import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { readCarryOver, storeCarryOver } from '../contentMap/carryOverChoice'
import { generateContentMapTestCases, type GeneratedTestCases } from '../contentMap/generateContentMapTestCases'
import { ConfirmActionDialog } from '../design-system/primitives/ConfirmActionDialog'
import { Dialog } from '../design-system/primitives/Dialog'
import { ProgressRing } from '../design-system/primitives/ProgressRing'
import { StudioIcon } from '../testScenarios/studioIcons'
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
import {
  cancelTestCaseGeneration,
  GENERATION_CANCELLED,
  GENERATION_IN_PROGRESS,
  GENERATION_PHASES,
  generationPercent,
  type TestCaseGeneration,
} from './testCaseGeneration'
import { useTestCaseGeneration } from './useTestCaseGeneration'

type Loaded = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; candidates: GenerationCandidate[] }

/** 이 창에서 누른 생성이 어떻게 끝났나(ARTEL-1188). 성공은 여는 쪽이 받아 창을 닫는다. */
type Outcome =
  | { kind: 'cancelled' }
  | { kind: 'alreadyRunning' }
  | { kind: 'failed'; message: string }

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
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  // 진행을 받을 빌드. 누르는 순간 정하고, 다른 빌드를 골라도 끝날 때까지 그 빌드의 진행을 본다.
  const [activeBuildId, setActiveBuildId] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const cancelInFlight = useRef(false)
  const generation = useTestCaseGeneration(projectId, activeBuildId)
  // 내 요청이 취소 · 실패로 끝났으면 SSE 의 끝 이벤트를 기다리지 않는다. 응답과 이벤트는 순서가 바뀌어 올 수 있다.
  // 남이 시작한 생성(이미 도는 중)은 내 요청과 상관없이 SSE 를 따른다.
  const running =
    pending ||
    (generation?.state === 'RUNNING' && (outcome === null || outcome.kind === 'alreadyRunning'))

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

  /**
   * 생성을 보내고 그 빌드의 진행을 받는다. 덮어쓰기 확인 뒤에도 여기로 온다 — 확인 창 안에서 기다리면 진행이 안 보인다.
   * 취소 · 이미 도는 중은 오류가 아니라 안내로 그린다.
   */
  async function run(target: GenerationCandidate) {
    setPending(true)
    setOutcome(null)
    setActiveBuildId(target.gameBuildId)
    try {
      const result = await generateContentMapTestCases(projectId, target.gameBuildId, carryOver, candidateOutcome(target) === 'overwrite')
      onGenerated(target, result)
    } catch (cause) {
      if (cause instanceof ProjectApiError && cause.code === GENERATION_CANCELLED) setOutcome({ kind: 'cancelled' })
      else if (cause instanceof ProjectApiError && cause.code === GENERATION_IN_PROGRESS) setOutcome({ kind: 'alreadyRunning' })
      else setOutcome({ kind: 'failed', message: failureMessage(cause) })
    } finally {
      setPending(false)
    }
  }

  async function submit(target: GenerationCandidate | null) {
    if (target === null || !isSelectable(target) || running) return
    if (candidateOutcome(target) === 'overwrite') {
      setPicked(target.gameBuildId)
      setConfirmingOverwrite(true)
      return
    }
    await run(target)
  }

  /** 도는 생성을 끊는다. 누른 사람의 요청이든 남의 것이든 그 빌드의 생성이다. 빠르게 두 번 눌러도 한 번만 보낸다. */
  async function cancel() {
    if (activeBuildId === null || cancelInFlight.current) return
    cancelInFlight.current = true
    setCancelling(true)
    try {
      await cancelTestCaseGeneration(projectId, activeBuildId)
    } catch {
      // 그사이 끝났거나 이미 끊겼다. 진행 SSE 가 끝 상태를 알려 준다.
    } finally {
      cancelInFlight.current = false
      setCancelling(false)
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
          disabled={!selectable || running}
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
              disabled={running}
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
          <GenerationStatus generation={generation} outcome={outcome} running={running} />
          <div className="dialog-actions">
            {running ? (
              <>
                <button className="button button--secondary" onClick={onClose} type="button">
                  {m.progress.close}
                </button>
                <button className="button button--danger" disabled={cancelling} onClick={() => void cancel()} type="button">
                  {cancelling ? m.progress.cancelling : m.progress.cancel}
                </button>
              </>
            ) : (
              <>
                <button className="button button--secondary" onClick={onClose} type="button">
                  {outcome === null ? m.cancel : m.progress.close}
                </button>
                <button className="button button--primary" disabled={chosen === null} type="submit">
                  {outcome !== null && outcome.kind !== 'alreadyRunning' ? m.progress.retry : overwriting ? m.overwrite.open : m.confirm}
                </button>
              </>
            )}
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
          onConfirm={async () => {
            // 확인 창은 바로 닫고 본 창에서 진행을 보인다.
            setConfirmingOverwrite(false)
            void run(chosen)
          }}
          pendingLabel={m.pending}
          title={m.overwrite.title(chosen.version)}
          toFailureMessage={failureMessage}
        />
      )}
    </>
  )
}

/**
 * 생성 창 아래의 진행 · 안내(ARTEL-1188). 도는 동안은 도넛 · 단계 줄 · 수 · 경과, 끝나면 무엇이 어떻게 끝났는지 한 덩어리.
 * 진행은 서버가 화면 지도 SSE 로 흘리는 것이라, 다른 탭 · 팀원이 시작한 생성도 똑같이 보인다.
 */
function GenerationStatus({
  generation,
  outcome,
  running,
}: {
  generation: TestCaseGeneration | null
  outcome: Outcome | null
  running: boolean
}) {
  const { t } = useI18n()
  const m = t.testCases.generate
  const p = m.progress
  const now = useTickingNow(running)
  const elapsed = generation === null ? null : elapsedOf(generation, now, p.duration)

  const progress = generation !== null && generation.state === 'RUNNING' && (
    <GenerationProgress elapsed={elapsed ?? ''} generation={generation} />
  )

  if (outcome?.kind === 'alreadyRunning') {
    const finished = generation !== null && generation.state !== 'RUNNING'
    return (
      <div className="gen-status" role="status">
        <div className="gen-notice">
          <StudioIcon className="gen-notice-icon gen-notice-icon--warning" name="alert" size={18} />
          <div>
            <p className="gen-notice-title">{p.alreadyRunningTitle}</p>
            <p className="gen-notice-copy">
              {finished && generation?.state === 'SUCCEEDED' ? p.alreadyRunningDone : p.alreadyRunningCopy}
            </p>
          </div>
        </div>
        {progress}
      </div>
    )
  }

  if (outcome?.kind === 'cancelled' || (generation?.state === 'CANCELLED' && !running && outcome === null)) {
    return (
      <div className="gen-status gen-notice" role="status">
        <StudioIcon className="gen-notice-icon" name="alert" size={18} />
        <div>
          <p className="gen-notice-title">{p.cancelledTitle}</p>
          <p className="gen-notice-copy">{p.cancelledCopy}</p>
        </div>
      </div>
    )
  }

  if (outcome?.kind === 'failed') {
    // 서버가 남긴 사유가 있으면 그것을 쓴다. 몇 단계에서 멈췄는지도 함께 말한다.
    const stopped = generation?.state === 'FAILED' ? generation : null
    return (
      <div className="inline-error gen-failure" role="alert">
        <span aria-hidden="true">!</span>
        <div>
          <p>{stopped?.error ?? outcome.message}</p>
          {stopped !== null && elapsed !== null && (
            <p className="gen-notice-copy">{p.stoppedAt(p.phases[stopped.phase], elapsed)}</p>
          )}
        </div>
      </div>
    )
  }

  if (!running) return null
  return (
    <div aria-live="polite" className="gen-status">
      {progress || <GenerationProgress elapsed="" generation={null} />}
    </div>
  )
}

/** 도넛 · 단계 줄 · 수 · 경과. 아직 첫 진행이 안 왔으면 도는 호와 첫 단계만. */
function GenerationProgress({ generation, elapsed }: { generation: TestCaseGeneration | null; elapsed: string }) {
  const { t } = useI18n()
  const p = t.testCases.generate.progress
  const phase = generation?.phase ?? 'READING_MAP'
  const percent = generation === null ? null : generationPercent(generation)
  const current = GENERATION_PHASES.indexOf(phase)
  const count =
    generation?.done == null || generation.total == null
      ? null
      : phase === 'DRAFTING'
        ? p.drafting(generation.done, generation.total)
        : phase === 'WRITING'
          ? p.writing(generation.done, generation.total)
          : null

  return (
    <div className="gen-progress">
      <ProgressRing label={p.label(p.phases[phase], percent ?? 0)} percent={percent} showPercent={percent !== null} size={64} />
      <div className="gen-progress-body">
        <ol className="gen-phases">
          {GENERATION_PHASES.map((name, index) => (
            <li
              aria-current={index === current ? 'step' : undefined}
              className={index < current ? 'is-done' : index === current ? 'is-current' : undefined}
              key={name}
            >
              <span>{p.phases[name]}</span>
            </li>
          ))}
        </ol>
        {count !== null && <p className="gen-progress-count mono">{count}</p>}
        <p className="gen-notice-copy">
          {elapsed.length > 0 && `${p.elapsed(elapsed)} · `}
          {p.keepsRunning}
        </p>
      </div>
    </div>
  )
}

function elapsedOf(
  generation: TestCaseGeneration,
  now: number,
  duration: (minutes: number, seconds: number) => string,
): string {
  const start = Date.parse(generation.startedAt)
  const end = generation.finishedAt === null ? now : Date.parse(generation.finishedAt)
  if (Number.isNaN(start) || Number.isNaN(end)) return ''
  const total = Math.max(0, Math.floor((end - start) / 1000))
  return duration(Math.floor(total / 60), total % 60)
}

/** 초마다 갱신되는 현재 시각. 도는 동안만 돈다. */
function useTickingNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active])
  return now
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" className={'tcl-chevron' + (open ? ' is-open' : '')} viewBox="0 0 16 16">
      <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  )
}
