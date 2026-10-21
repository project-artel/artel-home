import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SketchEmpty } from '../../emptyStates/SketchEmpty'
import { TestRunSketch } from '../../emptyStates/sketches'
import { Link, useSearchParams } from 'react-router-dom'
import { EdgeScrollbar } from '../../design-system/primitives/EdgeScrollbar'
import { useI18n } from '../../i18n/useI18n'
import { useFieldBinding } from '../../projectAgent/bindings'
import { requireKnownId } from '../../projectAgent/specs/fieldWriters'
import { QA_TEST_RUN_FIELD } from '../../projectAgent/specs/qa'
import type { GameInstance } from '../../projects/gameTypes'
import { sectionHref } from '../../projects/workspace/sections'
import { useWorkspace } from '../../projects/workspace/workspaceContext'
import { folderPath } from '../../testRuns/runLibrary'
import { listRunFolders, type RunFolder } from '../../testRuns/testRunFolders'
import { ChevronDownIcon, PencilIcon } from '../qaModelIcons'
import { withEngine, type QaArchSelection } from '../qaArch'
import { offeredQaModels } from '../qaModelGroups'
import { readLastArch } from '../qaStartChoices'
import { qaModelOptionKey, type QaModel } from '../qaTypes'
import { byAscendingEffort } from '../reasoningEfforts'
import { ConsolesDialog } from './ConsolesDialog'
import { LaunchPanel } from './LaunchPanel'
import { ProviderLogo } from './ProviderLogo'
import {
  getSinceLastQa,
  listProjectQaRuns,
  passRate,
  quickStarts,
  runDuration,
  type QaRunSummary,
  type QuickStart,
  type SinceLastQa,
} from './qaLaunchApi'
import { RecentRuns } from './RecentRuns'
import { RunPicker } from './RunPicker'
import { SinceLastRun } from './SinceLastRun'
import { useDismiss } from './useDismiss'

type Load = 'loading' | 'ready' | 'failed'

type Choice = {
  runId?: string | null
  instanceId?: string
  modelKey?: string
  reasoningEnabled?: boolean
  reasoningValue?: number
}

/** 빠른 시작 한 칸이 채우는 값. 지금 없는 게임 · 모델은 채우지 않는다(그 칸은 기본값을 따른다). */
function fromStart(start: QuickStart, instances: GameInstance[], offered: QaModel[]): Required<Choice> {
  const model = offered.find((one) => one.id === start.run.model && (start.run.keySource === null || one.keySource === start.run.keySource))
  const efforts = model?.reasoning?.kind === 'effort' ? byAscendingEffort(model.reasoning.efforts) : []
  const index = start.run.reasoningEffort === null ? -1 : efforts.indexOf(start.run.reasoningEffort)
  const fallbackInstance = (instances.find((one) => one.connected) ?? instances[0])?.id ?? ''
  const fallbackModel = offered.find((one) => one.keyRegistered)
  return {
    runId: start.run.testRunId,
    instanceId: instances.some((one) => one.id === start.run.gameInstanceId) ? start.run.gameInstanceId : fallbackInstance,
    modelKey: model !== undefined ? qaModelOptionKey(model) : fallbackModel === undefined ? '' : qaModelOptionKey(fallbackModel),
    reasoningEnabled: index >= 0,
    reasoningValue: index >= 0 ? index : reasoningStart(model ?? fallbackModel),
  }
}

/** 모델을 바꾸면 추론은 꺼지고, 켰을 때의 출발점은 medium(없으면 가장 약한 것) 또는 최소 토큰이다. */
function reasoningStart(model: QaModel | undefined): number {
  if (model?.reasoning?.kind === 'effort') return Math.max(byAscendingEffort(model.reasoning.efforts).indexOf('medium'), 0)
  return model?.reasoning?.minTokens ?? 0
}

/**
 * QA 실행 화면(ARTEL-1084) — 워크벤치 + 오른쪽 실행 설정 패널.
 *
 * 가운데는 "무엇을 · 지난번엔 어땠나" 를 보고, 오른쪽은 "어떻게 돌릴지" 를 정한다. 사이드바 · 탑바는
 * 워크스페이스의 것을 그대로 쓴다.
 *
 * 첫 선택은 **마지막 실행 조합**이다. 소규모 팀의 QA 는 고치고 다시 돌리는 일이 대부분이라, 빈 칸에서
 * 시작하면 매번 같은 셋을 다시 고르게 된다. 사람이 무엇이든 한 번 고르면 그 뒤로는 덮지 않는다.
 */
export function QaLaunch() {
  const { t } = useI18n()
  const l = t.qa.launch
  const { projectId, runs, instances, builds, models, applyInstance, removeInstance, applyBuild } = useWorkspace()
  const offered = useMemo(() => offeredQaModels(models), [models])

  /**
   * 사람이 고른 것만 든다. 고르지 않은 칸은 아래 `defaults` 가 채운다 — 첫 화면에서 기본값을 state 에
   * 밀어 넣으면 목록이 늦게 도착할 때마다 덮어쓰기 경쟁이 생긴다.
   */
  // 다른 화면이 런을 골라 보낼 수 있다(`?run=`, ARTEL-1164 대시보드의 Free 실행).
  // `&engine=agent` 가 오면 엔진도 맞춰 둔다. 고른 뒤에는 사용자가 바꾼 것이 이긴다.
  const [searchParams] = useSearchParams()
  const askedRun = searchParams.get('run')
  const askedAgent = searchParams.get('engine') === 'agent'
  const [choice, setChoice] = useState<Choice>(() => (askedRun === null ? {} : { runId: askedRun }))
  // agent 구조는 서버의 실행 기록에 없으므로(ARTEL-1091) 마지막으로 시작한 값을 이 브라우저에서 읽는다.
  const [arch, setArch] = useState<QaArchSelection>(() => (askedAgent ? withEngine(readLastArch(), 'agent') : readLastArch()))

  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerAnchor = useRef<HTMLDivElement>(null)
  const closePicker = useCallback(() => setPickerOpen(false), [])
  useDismiss(pickerOpen, pickerAnchor, closePicker)
  const [mainScroller, setMainScroller] = useState<HTMLDivElement | null>(null)
  const [consolesOpen, setConsolesOpen] = useState(false)
  const [runShortcut, setRunShortcut] = useState(0)

  const [folders, setFolders] = useState<RunFolder[]>([])
  const [qaRuns, setQaRuns] = useState<QaRunSummary[]>([])
  const [qaRunsStatus, setQaRunsStatus] = useState<Load>('loading')
  /** 어느 런의 것인지 함께 든다. 런을 바꾼 직후에는 앞 런의 값이 남아 있으니, 맞지 않으면 읽는 중이다. */
  const [sinceOf, setSinceOf] = useState<{ runId: string; value: SinceLastQa | null } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    listRunFolders(projectId, controller.signal).then(setFolders).catch(() => undefined)
    listProjectQaRuns(projectId, 20, controller.signal)
      .then((list) => {
        setQaRuns(list)
        setQaRunsStatus('ready')
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setQaRunsStatus('failed')
      })
    return () => controller.abort()
  }, [projectId])

  const liveRunIds = useMemo(() => new Set(runs.map((run) => run.id)), [runs])
  const starts = useMemo(() => quickStarts(qaRuns, liveRunIds, 5), [qaRuns, liveRunIds])

  // 첫 선택: 마지막 실행 조합 → 없으면 첫 런 · 연결된 게임 · 키 있는 첫 모델.
  const defaults = useMemo<Required<Choice>>(() => {
    if (starts.length > 0) return { ...fromStart(starts[0], instances, offered) }
    const model = offered.find((one) => one.keyRegistered)
    return {
      runId: runs[0]?.id ?? null,
      instanceId: (instances.find((one) => one.connected) ?? instances[0])?.id ?? '',
      modelKey: model === undefined ? '' : qaModelOptionKey(model),
      reasoningEnabled: false,
      reasoningValue: reasoningStart(model),
    }
  }, [starts, runs, instances, offered])
  const runId = choice.runId !== undefined ? choice.runId : defaults.runId
  const instanceId = choice.instanceId ?? defaults.instanceId
  const modelKey = choice.modelKey ?? defaults.modelKey
  const reasoningEnabled = choice.reasoningEnabled ?? defaults.reasoningEnabled
  const reasoningValue = choice.reasoningValue ?? defaults.reasoningValue
  const applyStart = (start: QuickStart) => setChoice(fromStart(start, instances, offered))

  const run = runs.find((one) => one.id === runId) ?? null

  useEffect(() => {
    if (run === null) return
    const controller = new AbortController()
    getSinceLastQa(projectId, run.id, controller.signal)
      .then((value) => setSinceOf({ runId: run.id, value }))
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setSinceOf({ runId: run.id, value: null })
      })
    return () => controller.abort()
  }, [projectId, run])
  const since = run !== null && sinceOf?.runId === run.id ? sinceOf.value : null
  const sinceStatus: Load = run === null || sinceOf?.runId !== run.id ? 'loading' : sinceOf.value === null ? 'failed' : 'ready'

  // ⌘K 런 찾기, ⌘↵ 실행. 입력 중이어도 듣는다 — 둘 다 글자를 넣는 조합이 아니다.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (runs.length > 0) setPickerOpen(true)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        setRunShortcut((n) => n + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [runs.length])

  function pickRun(next: string) {
    setChoice((current) => ({ ...current, runId: next }))
    setPickerOpen(false)
  }

  function pickModel(next: string) {
    setChoice((current) => ({
      ...current,
      modelKey: next,
      reasoningEnabled: false,
      reasoningValue: reasoningStart(offered.find((model) => qaModelOptionKey(model) === next)),
    }))
  }

  // agent 가 런을 고르는 길. 런 선택 카드를 고르는 것과 같은 `pickRun` 이다.
  useFieldBinding(QA_TEST_RUN_FIELD, {
    target: () => pickerAnchor.current,
    read: () => runId,
    options: () => runs.map((one) => ({ value: one.id, label: one.name })),
    write: (value) => pickRun(requireKnownId(QA_TEST_RUN_FIELD.name, value, runs.map((one) => one.id))),
  })

  const runPath = run === null
    ? []
    : [run.gameBuild?.label ?? run.gameBuild?.version ?? l.noVersion, ...(run.folderId === null ? [] : [...folderPath(folders, run.folderId), ...folders.filter((folder) => folder.id === run.folderId)].map((folder) => folder.name))]
  const lastDuration = since?.lastQaRun === null || since === null ? null : runDuration(since.lastQaRun)
  const modelOf = (id: string | null) => offered.find((model) => model.id === id)

  return (
    <div className="ql">
      <div className="ql-main-frame">
        <div className="ql-main" ref={setMainScroller}>
          <div className="ql-head">
            <div className="ql-head-row">
              <div className="ql-run-anchor" ref={pickerAnchor}>
                {runs.length === 0 ? (
                  <div className="ql-run-card is-empty">
                    <span className="ql-run-kicker">{l.runKicker}</span>
                    <span className="ql-run-name">{l.noRuns}</span>
                    <Link className="ql-link" to={sectionHref(projectId, 'test-runs')}>{l.createRun}</Link>
                  </div>
                ) : (
                  <button
                    aria-expanded={pickerOpen}
                    aria-haspopup="dialog"
                    aria-label={l.changeRun}
                    className={'ql-run-card' + (pickerOpen ? ' is-open' : '')}
                    onClick={() => setPickerOpen((open) => !open)}
                    type="button"
                  >
                    <span className="ql-run-card-text">
                      <span className="ql-run-kicker">
                        {l.runKicker}
                        {runPath.length > 0 && <span className="ql-run-path mono"> · {runPath.join(' / ')}</span>}
                      </span>
                      <span className="ql-run-name">{run?.name ?? l.changeRun}</span>
                      {run !== null && <span className="ql-run-meta">{l.runMeta(run.scenarioCount)}</span>}
                    </span>
                    <span className="ql-run-chevron"><ChevronDownIcon size={20} /></span>
                  </button>
                )}
                {pickerOpen && (
                  <RunPicker
                    builds={builds}
                    folders={folders}
                    onManageConsoles={() => {
                      setPickerOpen(false)
                      setConsolesOpen(true)
                    }}
                    onPick={pickRun}
                    projectId={projectId}
                    runs={runs}
                    selectedRunId={runId}
                  />
                )}
              </div>
              {run !== null && (
                <Link
                  aria-label={l.editRun}
                  className="ql-icon-button"
                  title={l.editRun}
                  to={`/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(run.id)}/edit`}
                >
                  <PencilIcon size={18} />
                </Link>
              )}
            </div>

            {starts.length > 0 && (
              <div className="ql-starts">
                <span className="ql-starts-label">{l.quickStart}</span>
                {starts.map((start) => {
                  const rate = passRate(start.run)
                  const model = modelOf(start.run.model)
                  const active = start.run.testRunId === runId && start.run.gameInstanceId === instanceId && model !== undefined && qaModelOptionKey(model) === modelKey
                  return (
                    <button className={'ql-start' + (active ? ' is-active' : '')} key={start.run.id} onClick={() => applyStart(start)} type="button">
                      {model !== undefined && <ProviderLogo provider={model.provider} size={16} />}
                      <span className="ql-start-text">
                        <span className="ql-start-title">{start.run.testRunName}</span>
                        <span className="ql-start-sub">
                          {[start.run.gameInstanceName, model?.label ?? start.run.model].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {rate !== null && <span className={'ql-start-rate mono' + (rate === 100 ? ' is-ok' : '')}>{`${start.run.casesPassed}/${start.run.casesTotal}`}</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {run !== null && (
            <SinceLastRun onManageConsoles={() => setConsolesOpen(true)} projectId={projectId} runId={run.id} since={since} status={sinceStatus} />
          )}
          {runs.length === 0 && (
            // 테스트 런이 없으면 고를 것도, 쌓일 실행도 없다. 남은 자리를 그림과 할 일로 채운다(ARTEL-1162).
            <SketchEmpty
              actions={
                <Link className="button button--primary" to={sectionHref(projectId, 'test-runs')}>
                  {l.createRunButton}
                </Link>
              }
              body={l.noRunsHelp}
              sketch={<TestRunSketch />}
              title={l.noRuns}
            />
          )}
          {(runs.length > 0 || qaRuns.length > 0) && (
            <RecentRuns models={offered} projectId={projectId} runs={qaRuns} selectedRunId={runId} status={qaRunsStatus} />
          )}
        </div>
        <EdgeScrollbar label={l.runKicker} scroller={mainScroller} side="right" />
      </div>

      <LaunchPanel
        arch={arch}
        builds={builds}
        etaMs={lastDuration}
        instanceId={instanceId}
        instances={instances}
        modelKey={modelKey}
        models={offered}
        onInstanceChange={(next) => setChoice((current) => ({ ...current, instanceId: next }))}
        onArchChange={setArch}
        onManageConsoles={() => setConsolesOpen(true)}
        onModelChange={pickModel}
        onReasoningEnabled={(value) => setChoice((current) => ({ ...current, reasoningEnabled: value }))}
        onReasoningValue={(value) => setChoice((current) => ({ ...current, reasoningValue: value }))}
        projectId={projectId}
        reasoningEnabled={reasoningEnabled}
        reasoningValue={reasoningValue}
        run={run}
        runShortcut={runShortcut}
      />

      {consolesOpen && (
        <ConsolesDialog
          builds={builds}
          instances={instances}
          onBuildSaved={applyBuild}
          onClose={() => setConsolesOpen(false)}
          onRemoved={removeInstance}
          onSaved={applyInstance}
          projectId={projectId}
        />
      )}
    </div>
  )
}
