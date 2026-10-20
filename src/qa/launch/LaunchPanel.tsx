import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EdgeScrollbar } from '../../design-system/primitives/EdgeScrollbar'
import { InfoHint } from '../../design-system/primitives/InfoHint'
import { useI18n } from '../../i18n/useI18n'
import type { GameBuild, GameInstance } from '../../projects/gameTypes'
import { ProjectApiError } from '../../projects/projectApi'
import { useActionBinding, useFieldBinding } from '../../projectAgent/bindings'
import { tasksCopy } from '../../projectAgent/tasksCopy'
import { requireBoolean, requireKnownId, requireReasoningValue } from '../../projectAgent/specs/fieldWriters'
import {
  createQaStartRunner,
  QA_GAME_INSTANCE_FIELD,
  QA_MODEL_FIELD,
  QA_REASONING_ENABLED_FIELD,
  QA_REASONING_VALUE_FIELD,
  QA_START_RUN_ACTION,
  type StartOutcome,
} from '../../projectAgent/specs/qa'
import { sectionHref } from '../../projects/workspace/sections'
import { versionMismatch } from '../../testRuns/runLibrary'
import { getRunCasesOutsideBuild, type TestRun } from '../../testRuns/testRunApi'
import { archEngine, archLabelMissing, toArchRequest, withoutVisionKnobs, type QaArchSelection } from '../qaArch'
import { createQaRun, qaStartConflict } from '../qaApi'
import { storeLastArch } from '../qaStartChoices'
import { DEFAULT_QA_FUNCTION_OPTIONS, type QaFunctionOptions } from '../qaFunctionOptions'
import { QaFunctionOptionsFields } from '../QaFunctionOptionsFields'
import { CheckIcon, ChevronDownIcon, CircleCheckIcon, CircleXIcon } from '../qaModelIcons'
import { QaModelPicker } from '../QaModelPicker'
import { qaModelOptionKey, type QaModel, type QaReasoningSelection } from '../qaTypes'
import { byAscendingEffort } from '../reasoningEfforts'
import { TakeOverQaRunDialog } from '../TakeOverQaRunDialog'
import { ArchSettings } from './ArchSettings'
import { useDismiss } from './useDismiss'

type Check = { tone: 'ok' | 'warn' | 'bad'; title: string; detail?: string; fix?: { label: string; to: string } }

/** 고른 런의 FREE 시나리오 수. `planner_executer` 를 골랐을 때만 화면이 읽는다(ARTEL-1119). */
export type FreeScenarioCount = number | 'loading' | 'failed'

/**
 * QA 실행 화면의 오른쪽 "실행 설정" 패널(ARTEL-1084).
 *
 * 고르는 것(게임 · 에이전트 · 추론)과, 그 고른 것으로 실행할 수 있는지(점검)와, 실행 버튼이 한 곳에
 * 있다. 실행 조건은 누른 뒤 오류로 알려 주던 것을 버튼 바로 위에 미리 보인다 — 막힌 항목에는 고칠
 * 곳 링크가 붙는다.
 *
 * 실행 · 충돌 · 이어받기는 옛 `QaTryPanel` 의 흐름을 그대로 옮겼다. 서버가 거절하는 이유(SDK 끊김,
 * 빈 런, 이미 도는 실행)는 점검이 미리 막아도 남는다 — 점검은 마지막으로 읽은 값이고, 서버가 지금을 안다.
 */
export function LaunchPanel({
  projectId,
  run,
  builds,
  instances,
  instanceId,
  onInstanceChange,
  models,
  modelKey,
  onModelChange,
  reasoningEnabled,
  onReasoningEnabled,
  reasoningValue,
  onReasoningValue,
  arch,
  onArchChange,
  freeScenarios,
  etaMs,
  onManageConsoles,
  runShortcut,
}: {
  projectId: string
  run: TestRun | null
  builds: GameBuild[]
  instances: GameInstance[]
  instanceId: string
  onInstanceChange: (instanceId: string) => void
  models: QaModel[]
  modelKey: string
  onModelChange: (modelKey: string) => void
  reasoningEnabled: boolean
  onReasoningEnabled: (value: boolean) => void
  reasoningValue: number
  onReasoningValue: (value: number) => void
  /** agent 구조 고급 설정(ARTEL-1091). 바꾼 knob 이 없으면 요청에 실리지 않는다. */
  arch: QaArchSelection
  onArchChange: (next: QaArchSelection) => void
  /** `planner_executer` 는 ORDERED 만 돌리므로, FREE 가 있으면 점검이 실행을 막는다. `agent` 면 읽지 않는다. */
  freeScenarios: FreeScenarioCount
  etaMs: number | null
  onManageConsoles: () => void
  /** ⌘↵ 가 눌린 횟수. 바뀔 때마다 실행을 시도한다 — 단축키는 화면이 듣고, 실행은 여기서 한다. */
  runShortcut: number
}) {
  const { t } = useI18n()
  const l = t.qa.launch.panel
  const p = t.qa.panel
  const navigate = useNavigate()
  const modelSelectId = useId()
  const reasoningControlId = useId()
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [panelScroller, setPanelScroller] = useState<HTMLDivElement | null>(null)
  const consoleBox = useRef<HTMLDivElement>(null)
  const closeConsole = useCallback(() => setConsoleOpen(false), [])
  useDismiss(consoleOpen, consoleBox, closeConsole)
  const [starting, setStarting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [takeoverOpen, setTakeoverOpen] = useState(false)
  const [functionOptions, setFunctionOptions] = useState<QaFunctionOptions>(DEFAULT_QA_FUNCTION_OPTIONS)

  const instance = instances.find((one) => one.id === instanceId) ?? null
  const model = models.find((one) => `${one.keySource}:${one.id}` === modelKey) ?? null
  const reasoning = model?.reasoning ?? null
  const efforts = reasoning?.kind === 'effort' ? byAscendingEffort(reasoning.efforts) : []
  const selectedReasoning: QaReasoningSelection | null =
    !reasoningEnabled || reasoning === null
      ? null
      : reasoning.kind === 'effort'
        ? { effort: efforts[reasoningValue] ?? efforts[0] }
        : { maxTokens: reasoningValue }
  const reasoningWord = selectedReasoning === null
    ? null
    : 'effort' in selectedReasoning ? selectedReasoning.effort : selectedReasoning.maxTokens.toLocaleString()

  // 이미지를 읽지 않는 모델이면 vision 이 필요한 knob 은 agent-server 가 422 로 거절한다. 고른 값을
  // 지우는 대신 보낼 때 걷어 내므로, 모델을 되돌리면 고른 값이 그대로 살아 있다.
  const readsImages = model?.multimodal ?? true
  const effectiveArch = readsImages ? arch : withoutVisionKnobs(arch)
  const engine = archEngine(arch)

  const mismatch = versionMismatch(run ?? undefined, instance ?? undefined)
  // 켜진 게임 버전에 없는 이 TR 의 케이스 수(ARTEL-1070). 못 읽으면 알리지 않는다.
  const skipped = useCasesOutsideBuild(projectId, run?.id ?? '', instance?.id ?? '')
  const skippedGame = instance?.lastGameBuild == null ? null : instance.lastGameBuild.label ?? instance.lastGameBuild.version
  const checks: Check[] = []
  if (instance === null) checks.push({ tone: 'bad', title: l.noGame })
  else if (instance.connected) checks.push({ tone: 'ok', title: l.connected })
  else checks.push({ tone: 'bad', title: l.disconnected, detail: l.offline, fix: { label: l.install, to: sectionHref(projectId, 'setup') } })
  if (run !== null && instance !== null) {
    if (mismatch === null) {
      const version = run.gameBuild?.label ?? run.gameBuild?.version
      if (version !== undefined) checks.push({ tone: 'ok', title: l.versionOk(version) })
    } else {
      checks.push({ tone: 'warn', title: l.versionDiff, detail: `${p.versionMismatch.basis(mismatch.run, mismatch.game)} ${p.versionMismatch.record(mismatch.game)}` })
    }
    // 켜진 게임 버전에 없는 이 TR 의 케이스(ARTEL-1070). QA 는 이 케이스들을 판정하지 않고 넘긴다 — 막지 않고 알린다.
    if (skipped > 0 && skippedGame !== null) {
      checks.push({ tone: 'warn', title: l.casesSkipped(skipped), detail: p.versionMismatch.skipped(skipped, skippedGame) })
    }
  }
  const runEditHref = run === null ? null : `/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(run.id)}/edit`
  if (run !== null && runEditHref !== null) {
    if (run.scenarioCount === 0) {
      checks.push({ tone: 'bad', title: l.noScenarios, fix: { label: l.fixScenarios, to: runEditHref } })
    } else if (run.scenarioCount !== null) {
      checks.push({ tone: 'ok', title: l.scenarios(run.scenarioCount) })
    }
  }
  if (model === null) checks.push({ tone: 'bad', title: l.noModel })
  else if (model.keyRegistered) checks.push({ tone: 'ok', title: l.keyOk })
  else checks.push({ tone: 'bad', title: l.keyMissing, fix: { label: l.fixKey, to: '/account' } })
  // knob 을 바꾼 구조는 label 이 있어야 한다. 기본 label 로 보내면 `/api/qa-stats` 가 그 run 을 기본
  // 구조와 한 묶음으로 세어, 비교하려던 두 구조가 통계에서 하나로 섞인다.
  if (archLabelMissing(effectiveArch)) checks.push({ tone: 'bad', title: l.archLabelMissing, detail: p.advanced.labelHint })
  // `planner_executer` 는 ORDERED 만 돌린다. FREE 가 섞인 런을 보내면 agent-server 가 session 을 열 때
  // 거절하고, 사람은 실행 화면에 가서야 그것을 본다. 읽는 중에도 막는다 — 다 읽기 전에 누르면 그 거절로 간다.
  if (engine === 'planner_executer' && runEditHref !== null) {
    if (freeScenarios === 'loading') checks.push({ tone: 'bad', title: l.engineFreeChecking })
    else if (freeScenarios === 'failed') checks.push({ tone: 'warn', title: l.engineFreeUnknown, detail: l.engineFreeUnknownDetail })
    else if (freeScenarios > 0) checks.push({ tone: 'bad', title: l.engineFree, detail: l.engineFreeDetail(freeScenarios), fix: { label: l.fixScenarios, to: runEditHref } })
  }
  const blocked = run === null || checks.some((check) => check.tone === 'bad')

  /**
   * 버튼, 단축키, agent 가 함께 쓴다. 시작하지 않았으면 null 이다(막혀 있거나 이미 시작하는 중).
   * `force` 는 사용자가 인수 대화상자에서 답했을 때만 true 다 — agent 는 절대 보내지 않는다.
   */
  async function start(force = false): Promise<StartOutcome | null> {
    if (blocked || starting || run === null || instance === null || model === null) return null
    setStarting(true)
    setFailure(null)
    try {
      const created = await createQaRun(run.id, instance.id, model.id, model.keySource, selectedReasoning, force, toArchRequest(effectiveArch), functionOptions)
      // 시작이 성공한 구조만 다음 폼의 기본값이 된다. 고르다 만 값은 남기지 않는다.
      storeLastArch(effectiveArch)
      setTakeoverOpen(false)
      navigate(`/projects/${encodeURIComponent(projectId)}/qa-runs/${encodeURIComponent(created.id)}`)
      return { kind: 'started', qaRunId: created.id }
    } catch (error: unknown) {
      const conflict = qaStartConflict(error)
      if (conflict === 'qa_run_active' && !force) {
        setTakeoverOpen(true)
        setStarting(false)
        return { kind: 'takeoverNeeded' }
      }
      const message =
        conflict === 'sdk_disconnected'
          ? t.qa.errors.sdkDisconnected
          : conflict === 'test_run_empty'
            ? t.qa.errors.emptyRun
            : conflict === 'qa_run_active'
              ? t.qa.errors.alreadyRunning
              : error instanceof ProjectApiError
                ? error.message
                : t.qa.errors.startFailed
      setFailure(message)
      setStarting(false)
      return { kind: 'failed', message }
    }
  }

  const modelField = useRef<HTMLDivElement>(null)
  const reasoningField = useRef<HTMLDivElement>(null)
  const runButton = useRef<HTMLButtonElement>(null)

  useFieldBinding(QA_GAME_INSTANCE_FIELD, {
    target: () => consoleBox.current,
    read: () => instanceId,
    options: () =>
      instances.map((one) => ({
        value: one.id,
        label: `${one.name} (${one.connected ? t.projects.instances.connected : t.projects.instances.notConnected})`,
      })),
    write: (value) =>
      onInstanceChange(requireKnownId(QA_GAME_INSTANCE_FIELD.name, value, instances.map((one) => one.id))),
  })
  useFieldBinding(QA_MODEL_FIELD, {
    target: () => modelField.current,
    read: () => modelKey,
    options: () =>
      models.map((one) => ({
        value: qaModelOptionKey(one),
        label: one.keyRegistered ? one.label : `${one.label} (${l.keyMissing})`,
      })),
    write: (value) => onModelChange(requireKnownId(QA_MODEL_FIELD.name, value, models.map(qaModelOptionKey))),
  })
  useFieldBinding(QA_REASONING_ENABLED_FIELD, {
    target: () => reasoningField.current,
    read: () => reasoningEnabled,
    write: (value) => {
      const enabled = requireBoolean(QA_REASONING_ENABLED_FIELD.name, value)
      if (enabled && reasoning === null) throw new Error(tasksCopy().errors.reasoningUnsupported)
      onReasoningEnabled(enabled)
    },
  })
  useFieldBinding(QA_REASONING_VALUE_FIELD, {
    target: () => reasoningField.current,
    read: () => reasoningValue,
    options: () => efforts.map((effort, index) => ({ value: index, label: effort })),
    write: (value) =>
      onReasoningValue(
        requireReasoningValue(
          value,
          reasoning === null
            ? null
            : reasoning.kind === 'effort'
              ? { kind: 'effort', effortCount: efforts.length }
              : { kind: 'max_tokens', minTokens: reasoning.minTokens, maxTokens: reasoning.maxTokens },
        ),
      ),
  })

  // 버튼이 막혀 있을 때 보이는 점검 항목 중 막힌 것들을 그대로 이유로 돌려준다.
  function startBlockedReason(): string | null {
    if (starting) return p.starting
    if (run === null) return t.qa.errors.missingSelection
    if (!blocked) return null
    const reasons = checks.filter((check) => check.tone === 'bad').map((check) => check.title)
    return reasons.length > 0 ? reasons.join(' ') : l.blockedHint
  }

  useActionBinding(QA_START_RUN_ACTION, {
    target: () => runButton.current,
    blocked: startBlockedReason,
    run: createQaStartRunner({ start, blockedReason: startBlockedReason, blockedHint: l.blockedHint }),
  })

  // ⌘↵ — 첫 렌더의 0 은 누른 것이 아니다.
  const lastShortcut = useRef(runShortcut)
  useEffect(() => {
    if (runShortcut === lastShortcut.current) return
    lastShortcut.current = runShortcut
    void start()
    // `start` 는 매 렌더 새로 만들어지지만, 여기서 듣는 것은 단축키뿐이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runShortcut])

  return (
    <aside aria-labelledby="ql-panel-title" className="ql-panel">
      <div className="ql-panel-scroll" ref={setPanelScroller}>
        <h2 className="ql-panel-title" id="ql-panel-title">{l.title}</h2>

        {run !== null && instance !== null && model !== null && (
          <p className="ql-summary">
            {l.summary(run.name, instance.name, reasoningWord === null ? model.label : `${model.label} · ${reasoningWord}`)}
          </p>
        )}

        <div className="ql-field">
          <div className="ql-field-head">
            <span className="ql-field-label">{l.consoleLabel}</span>
            <Link className="ql-mini" to={sectionHref(projectId, 'setup')}>{l.install}</Link>
            <button className="ql-mini ql-mini--accent" onClick={onManageConsoles} type="button">{l.manage}</button>
          </div>
          <div className="ql-select" ref={consoleBox}>
            <button
              aria-expanded={consoleOpen}
              aria-haspopup="listbox"
              className={'ql-select-trigger' + (instance !== null && !instance.connected ? ' is-bad' : '')}
              onClick={() => setConsoleOpen((open) => !open)}
              type="button"
            >
              <span aria-hidden="true" className={'ql-dot' + (instance?.connected ? ' ql-dot--live' : '')} />
              <span className="ql-select-text">
                <span className="ql-select-name">{instance?.name ?? l.noGame}</span>
                {instance !== null && (
                  <span className="ql-select-meta">
                    {instance.connected ? t.projects.instances.connected : t.projects.instances.notConnected}
                    {instance.lastGameBuild !== null && ` · ${instance.lastGameBuild.label ?? instance.lastGameBuild.version}`}
                  </span>
                )}
              </span>
              <ChevronDownIcon className="ql-select-chevron" size={16} />
            </button>
            {consoleOpen && (
              <ul className="ql-listbox" role="listbox" aria-label={l.consoleLabel}>
                {instances.map((one) => (
                  <li aria-selected={one.id === instanceId} key={one.id} role="option">
                    <button
                      className="ql-option"
                      onClick={() => {
                        onInstanceChange(one.id)
                        setConsoleOpen(false)
                      }}
                      type="button"
                    >
                      <span aria-hidden="true" className={'ql-dot' + (one.connected ? ' ql-dot--live' : '')} />
                      <span className="ql-select-text">
                        <span className="ql-select-name">{one.name}</span>
                        <span className="ql-select-meta">
                          {one.connected ? t.projects.instances.connected : t.projects.instances.notConnected}
                          {one.lastGameBuild !== null && ` · ${one.lastGameBuild.label ?? one.lastGameBuild.version}`}
                        </span>
                      </span>
                      {one.id === instanceId && <CheckIcon size={15} />}
                    </button>
                  </li>
                ))}
                <li className="ql-listbox-foot">
                  <Link className="ql-link" to={sectionHref(projectId, 'setup')}>{t.qa.launch.actionInstall}</Link>
                </li>
              </ul>
            )}
          </div>
        </div>

        <div className="ql-field" ref={modelField}>
          <label className="ql-field-label" htmlFor={modelSelectId}>{l.agentLabel}</label>
          <QaModelPicker disabled={models.length === 0} id={modelSelectId} models={models} onChange={onModelChange} popoverWidth={460} value={modelKey} />
          {model !== null && reasoning === null && <p className="qa-reasoning-unavailable">{p.reasoningUnavailable}</p>}
        </div>

        {model !== null && reasoning !== null && (
          <div className="ql-field" ref={reasoningField}>
            <span className="ql-field-head">
              <span className="ql-field-label">{l.reasoningTitle}</span>
              <InfoHint>{l.reasoningHint}</InfoHint>
            </span>
            {reasoning.kind === 'effort' ? (
              <div aria-label={l.reasoningTitle} className="ql-seg" role="radiogroup" style={{ gridTemplateColumns: `repeat(${segColumns(efforts.length + 1)}, minmax(0, 1fr))` }}>
                {[l.reasoningOff, ...efforts].map((label, index) => {
                  const on = index === 0 ? !reasoningEnabled : reasoningEnabled && reasoningValue === index - 1
                  return (
                    <button
                      aria-checked={on}
                      className={'ql-seg-item' + (on ? ' is-on' : '')}
                      key={label}
                      onClick={() => {
                        onReasoningEnabled(index > 0)
                        if (index > 0) onReasoningValue(index - 1)
                      }}
                      role="radio"
                      type="button"
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="ql-reasoning">
                <div aria-label={l.reasoningTitle} className="ql-seg" role="radiogroup" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                  {[false, true].map((value) => (
                    <button
                      aria-checked={reasoningEnabled === value}
                      className={'ql-seg-item' + (reasoningEnabled === value ? ' is-on' : '')}
                      key={String(value)}
                      onClick={() => onReasoningEnabled(value)}
                      role="radio"
                      type="button"
                    >
                      {value ? p.reasoningTag : l.reasoningOff}
                    </button>
                  ))}
                </div>
                {reasoningEnabled && (
                  <label className="qa-reasoning-slider" htmlFor={reasoningControlId}>
                    <span>{reasoningValue.toLocaleString()}</span>
                    <input
                      aria-label={p.reasoningControlLabel}
                      id={reasoningControlId}
                      max={reasoning.maxTokens}
                      min={reasoning.minTokens}
                      onChange={(event) => onReasoningValue(Number(event.target.value))}
                      step={reasoning.step}
                      type="range"
                      value={reasoningValue}
                    />
                  </label>
                )}
              </div>
            )}
          </div>
        )}

        <QaFunctionOptionsFields
          builds={builds}
          disabled={starting}
          onChange={setFunctionOptions}
          projectId={projectId}
          value={functionOptions}
        />

        <div className="ql-field">
          <ArchSettings onChange={onArchChange} readsImages={readsImages} selection={effectiveArch} />
        </div>

        <div className="ql-field">
          <span className="ql-field-label">{l.checksTitle}</span>
          <ul className="ql-checks">
            {checks.map((check, index) => (
              <li className={`ql-check ql-check--${check.tone}`} key={index}>
                <span aria-hidden="true" className="ql-check-icon">
                  {check.tone === 'ok' ? <CircleCheckIcon size={16} /> : check.tone === 'bad' ? <CircleXIcon size={16} /> : '!'}
                </span>
                <span className="ql-check-body">
                  <span className="ql-check-title">{check.title}</span>
                  {check.detail !== undefined && <span className="ql-check-detail">{check.detail}</span>}
                  {check.fix !== undefined && <Link className="ql-link" to={check.fix.to}>{check.fix.label} →</Link>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <EdgeScrollbar label={l.title} scroller={panelScroller} side="right" />
      <div className="ql-panel-foot">
        {failure !== null && !takeoverOpen && (
          <div className="inline-error" role="alert">
            <span aria-hidden="true">!</span>
            {failure}
          </div>
        )}
        <button
          aria-disabled={blocked}
          className={'ql-run' + (blocked ? ' is-blocked' : '')}
          onClick={() => void start()}
          ref={runButton}
          type="button"
        >
          <span>{starting ? p.starting : blocked ? l.runBlocked : l.run}</span>
          {!blocked && <span className="ql-run-key mono">{l.shortcut}</span>}
        </button>
        <p className="ql-eta">
          {blocked ? l.blockedHint : etaMs === null ? l.etaNone : l.eta(formatEta(etaMs))}
        </p>
      </div>

      {takeoverOpen && (
        <TakeOverQaRunDialog
          failure={failure}
          onClose={() => setTakeoverOpen(false)}
          onConfirm={() => void start(true)}
          pending={starting}
        />
      )}
    </aside>
  )
}

function formatEta(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000))
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`
}

/** 한 줄에 넷까지. 그보다 많으면 두 줄로 나눠 글자가 잘리지 않게 한다(끔 · low · medium · high · xhigh · max 는 3 × 2). */
function segColumns(count: number): number {
  return count <= 4 ? count : Math.ceil(count / 2)
}

/**
 * 이 TR 의 케이스 중 켜진 게임의 버전에 없는 것의 수(ARTEL-1070). 게임이나 TR 을 고르지 않았거나 읽지 못하면 0 이다
 * — 점검에 덧붙이는 정보라, 못 읽었다고 QA 를 막지 않는다.
 */
function useCasesOutsideBuild(projectId: string, runId: string, instanceId: string): number {
  const [counted, setCounted] = useState<{ key: string; count: number } | null>(null)
  const key = `${runId}:${instanceId}`
  useEffect(() => {
    if (runId === '' || instanceId === '') return undefined
    const controller = new AbortController()
    getRunCasesOutsideBuild(projectId, runId, instanceId, controller.signal)
      .then((outside) => setCounted({ key: `${runId}:${instanceId}`, count: outside.testCaseIds.length }))
      .catch(() => undefined)
    return () => controller.abort()
  }, [projectId, runId, instanceId])
  return counted !== null && counted.key === key ? counted.count : 0
}
