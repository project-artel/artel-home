import { buildDisplayName } from '../projects/buildEnvironment'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NotFoundPage } from '../NotFoundPage'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { useActionBinding } from '../projectAgent/bindings'
import { TEST_RUN_EDIT_APPROVE_SCENARIO_ACTION } from '../projectAgent/specs/testRunEdit'
import { shortcutLabel } from '../shell/platform'
import { TestCaseSpecModal } from '../testCases/TestCaseSpecModal'
import { AgentChatEmbedded } from '../projectAgent/AgentDock'
import { useSuppressAgentDock } from '../projectAgent/dockSuppression'
import { isProjectAgentEnabled } from '../projectAgent/agentDockState'
import { RunChat } from '../testRuns/RunChat'
import { ChatRail } from '../testRuns/ChatRail'
import { RunNameCrumb } from '../testRuns/RunNameCrumb'
import { SplitHandle } from '../design-system/primitives/SplitHandle'
import { RunVersionChip } from '../testRuns/RunVersionChip'
import { getTestRun, type RunGameBuild } from '../testRuns/testRunApi'
import { useRunChatSession } from '../testRuns/useRunChatSession'
import { ArtelBotLock } from '../testRuns/runLock/ArtelBotLock'
import { useRunLocks } from '../testRuns/runLock/useRunLock'
import { useProjectChange } from '../live/useProjectChange'
import { ApproveScenarioDialog } from './ApproveScenarioDialog'
import { approveScenarioFailure } from './approveScenarioError'
import { DeleteScenarioDialog } from './DeleteScenarioDialog'
import { approveTestScenario, getTestScenario } from './scenarioApi'
import { FreeScenarioEditor } from './FreeScenarioEditor'
import { ScenarioList } from './ScenarioList'
import { ScenarioStepEditor } from './ScenarioStepEditor'
import { EMPTY_SCENARIO_DRAFT, isFreeScenario } from './scenarioTypes'
import { useDraftPreview } from './useDraftPreview'
import { useScenarioAgentActions } from './useScenarioAgentActions'
import { readScenarioChatAgent, storeScenarioChatAgent, type ScenarioChatAgent } from './scenarioChatAgent'
import { useChatWidth } from './useChatWidth'
import { useStepEditor } from './useStepEditor'
import { useRunCases } from './useRunCases'
import { StudioIcon } from './studioIcons'

/**
 * Deliberately NOT keyed by the scenario id. It used to be, and opening another
 * scenario remounted the whole studio — including the chat on the right, which
 * belongs to the RUN, not to the scenario. The turn in flight, the thread and the
 * proposal cards all went with it, so picking a row from the rail cost the user
 * the conversation beside it. What is scenario-scoped resets on `scenarioId`
 * instead: the editor re-seeds through `reset`, which also moves its ownership.
 */
export function TestScenarioRoute() {
  const { projectId = '', testScenarioId = '' } = useParams()
  return <TestScenarioPage projectId={projectId} testScenarioId={testScenarioId} />
}

/** 승인 버튼은 draft 를 열어 둔 동안 숨는다. 화면에 문구가 없어 agent 에게만 보인다. */
const DRAFT_OPEN_REASON = 'A draft of the chat is open instead of the saved scenario. Approve or discard the draft first.'

/** 스튜디오에서 나가면 테스트 런 목록이다 — 시나리오는 런 안에서 쓰기 때문이다. */
function backLink(projectId: string) {
  return `/projects/${encodeURIComponent(projectId)}/test-runs`
}

/**
 * The scenario studio (재설계 2026-08-08): a scenario's ordered STEPS in the
 * centre, the project's scenarios on the left, and the run's authoring
 * conversation on the right.
 *
 * The scenario body is `payload.steps`, edited in {@link ScenarioStepEditor} with
 * autosave. Undo/redo, the save indicator and the ⌘K TC spec live on the header
 * here — not inside the step editor — because they are run-scoped: one agent
 * authors many scenarios, so undo must reach across (including an agent-applied
 * proposal), which a per-scenario control cannot express. The chat is RUN-scoped
 * ({@link useRunChatSession}); applying a proposal rebases the editor so the
 * committed steps appear and the apply itself stays undoable.
 */
function TestScenarioPage({ projectId, testScenarioId }: { projectId: string; testScenarioId: string }) {
  const scenarioId = Number(testScenarioId)
  const validId = Number.isInteger(scenarioId) && scenarioId > 0
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fromRun = searchParams.get('run')

  const editor = useStepEditor(scenarioId, EMPTY_SCENARIO_DRAFT)
  // WHICH scenario the load settled on, not just how it went. Without the id, the
  // render right after a switch would still read `ready` — the page no longer
  // remounts — and flash the previous scenario's steps under the new title.
  const [loaded, setLoaded] = useState<{ id: number; found: boolean } | null>(null)
  const status = loaded?.id === scenarioId ? (loaded.found ? 'ready' : 'missing') : 'loading'
  const [specOpen, setSpecOpen] = useState(false)

  // Loading a scenario seeds the editor (clearing history). `editor.reset` is
  // stable, so this runs once per scenario id.
  const { reset } = editor
  useEffect(() => {
    if (!validId) return
    const controller = new AbortController()
    getTestScenario(scenarioId, controller.signal)
      .then((scenario) => {
        reset(scenarioId, scenario.payload)
        setLoaded({ id: scenarioId, found: true })
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLoaded({ id: scenarioId, found: false })
      })
    return () => controller.abort()
  }, [scenarioId, validId, reset])

  // Applying a chat proposal re-fetches the scenario and rebases the editor onto
  // it — the committed steps appear, and the apply is recorded on the undo stack.
  //
  // The rail has to hear about it too. The agent does not only edit the scenario
  // that happens to be open; it makes new ones and appends them to the run, and
  // the rail reads its own list. Bumping this token is the whole of telling it —
  // a number, not a reload: the page, the chat and the editor all stay as they
  // are and only the list re-reads. Same shape as `EvidenceScanPanel`.
  const [railToken, setRailToken] = useState(0)
  const { rebase } = editor
  const onProposalApplied = useCallback(() => {
    setRailToken((token) => token + 1)
    getTestScenario(scenarioId)
      .then((scenario) => rebase(scenario.payload))
      .catch(() => { /* leave the current draft on a reload failure */ })
  }, [scenarioId, rebase])
  // 턴이 끝나면 레일만 다시 읽는다. 편집기는 건드리지 않는다 — `rebase` 는 `working` 을
  // 서버 값으로 덮으므로, 손으로 고치던 초안이 남의 턴 하나에 사라진다.
  const onTurnEnded = useCallback(() => setRailToken((token) => token + 1), [])
  // 말을 보내기 직전에 모아 둔 자동저장을 끝낸다(ARTEL-1265). 보내면 런이 잠겨 그 저장이 거절된다.
  const { flush } = editor
  const runChat = useRunChatSession(projectId, fromRun, onProposalApplied, onTurnEnded, flush)

  // ── Artel Bot 잠금(ARTEL-1265) ──
  // Artel Bot 이 이 TS 를 고치는 동안은 편집 칸을 흐리게 덮고 막는다. 보낸 사람 본인도 막는다 — 결과가 끝에 통째로 덮는다.
  // 같은 런의 다른 TS 는 막지 않는다.
  const runLocks = useRunLocks(projectId, fromRun)
  const scenarioLock = runLocks.get(String(scenarioId))
  const botLocked = scenarioLock !== undefined
  const [unsavedDuringLock, setUnsavedDuringLock] = useState(false)
  const { dirty, working } = editor
  const latest = useRef({ dirty, working, botLocked })
  useEffect(() => {
    latest.current = { dirty, working, botLocked }
  })
  /** 서버의 지금 본문으로 편집기를 맞춘다. 같으면 건드리지 않는다(되돌리기 칸이 쌓이지 않게). */
  const pullLatest = useCallback(() => {
    if (!validId) return
    getTestScenario(scenarioId)
      .then((scenario) => {
        if (JSON.stringify(scenario.payload) !== JSON.stringify(latest.current.working)) rebase(scenario.payload)
      })
      .catch(() => { /* 다음 알림에 다시 읽는다 */ })
  }, [scenarioId, validId, rebase])
  // 풀리면 AI 가 고친 것을 읽는다. 그 사이 손으로 고친 것이 저장되지 못했으면 덮지 않고 묻는다.
  const wasLocked = useRef(false)
  useEffect(() => {
    if (wasLocked.current && !botLocked) {
      if (latest.current.dirty) setUnsavedDuringLock(true)
      else pullLatest()
    }
    wasLocked.current = botLocked
  }, [botLocked, pullLatest])

  // The run's name for the crumb, when the studio was opened from a run. Fetched
  // here because the studio only carries the run id (?run=), not its name.
  const [runName, setRunName] = useState('')
  const [runBuild, setRunBuild] = useState<RunGameBuild | null>(null)
  // `runBuild` 가 어느 런의 것인지. `?run=` 이 바뀌면 새 런을 읽을 때까지 이전 런의 빌드가 남는다.
  const [runBuildRunId, setRunBuildRunId] = useState<string | null>(null)
  useEffect(() => {
    if (fromRun === null) return
    const controller = new AbortController()
    getTestRun(projectId, fromRun, controller.signal)
      .then((run) => {
        if (run === null) return
        setRunName(run.name)
        setRunBuild(run.gameBuild)
        setRunBuildRunId(fromRun)
      })
      .catch(() => { /* leave the crumb blank on failure */ })
    return () => controller.abort()
  }, [projectId, fromRun])

  const runCases = useRunCases(projectId, runBuild?.gameBuildId ?? null)
  const runCaseList = useMemo(() => [...runCases.values()], [runCases])

  // 자동저장을 끈 턴의 draft(ARTEL-1075). 열어 두면 가운데와 헤더가 draft 를 따른다.
  const preview = useDraftPreview(projectId, runChat, runBuild)
  const activeDraft = preview.activeDraft
  const activeDraftRef = useRef(activeDraft)
  useEffect(() => {
    activeDraftRef.current = activeDraft
  })

  // 다른 사람(맵 · 다른 편집 화면 · AI)이 이 TS 를 고치면 따라간다. 지금까지는 몰랐고, 다음 자동저장이 그것을 덮었다.
  // 저장 안 된 손 편집이 있으면 따라가지 않는다 — 그건 이 화면의 자동저장이 곧 보낸다.
  useProjectChange(projectId, 'TEST_RUNS', () => {
    if (!latest.current.dirty && !latest.current.botLocked && activeDraftRef.current === null) pullLatest()
  })


  // Header shortcuts (outside text fields, where the browser's own text-undo wins):
  // ⌘/Ctrl+Z undo, ⇧+Z (or Ctrl+Y) redo, ⌘/Ctrl+K opens the TC spec.
  const active = activeDraft !== null ? preview.editor : editor
  const { undo, redo } = active
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return
      const target = event.target as HTMLElement | null
      const inField = target !== null
        && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      const key = event.key.toLowerCase()
      if (key === 'k') { event.preventDefault(); setSpecOpen(true); return }
      if (inField || latest.current.botLocked) return
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo() }
      else if ((key === 'z' && event.shiftKey) || key === 'y') { event.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const split = useChatWidth()

  // 오른쪽 칸이 시나리오 AI 와 프로젝트 agent 중 누구와 대화할지. 프로젝트 agent 가 꺼져 있으면 고르지 않고
  // 늘 시나리오 AI 다. project 모드에서는 workspace 의 dock 을 숨겨 같은 대화가 두 곳에 뜨지 않게 한다.
  const projectAgentEnabled = isProjectAgentEnabled(import.meta.env)
  const [chatAgentChoice, setChatAgentChoice] = useState<ScenarioChatAgent>(readScenarioChatAgent)
  const chatAgent: ScenarioChatAgent = projectAgentEnabled ? chatAgentChoice : 'workflow'
  const pickChatAgent = useCallback((agent: ScenarioChatAgent) => {
    setChatAgentChoice(agent)
    storeScenarioChatAgent(agent)
  }, [])
  useSuppressAgentDock(chatAgent === 'project')

  const [dialog, setDialog] = useState<'approve' | 'delete' | null>(null)
  // Approve/delete return to where the scenario was opened from: the run's edit
  // view when in a run, otherwise the project.
  const afterExit = fromRun !== null
    ? `/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(fromRun)}/edit`
    : backLink(projectId)

  // agent 가 헤더의 승인 버튼을 누르는 길. 승인 대화상자의 확인과 같은 `approveTestScenario` 를 부르고,
  // 대화상자와 같은 문구로 실패를 알리고, 같은 곳으로 돌아간다. 저장된 시나리오를 보고 있을 때만 쓴다.
  const approveButton = useRef<HTMLButtonElement>(null)
  useActionBinding(TEST_RUN_EDIT_APPROVE_SCENARIO_ACTION, {
    target: () => approveButton.current,
    blocked: () => {
      if (!validId) return t.scenarios.page.invalidAddress
      if (status === 'missing') return t.scenarios.page.missingCopy
      if (status === 'loading') return t.scenarios.map.loading
      return activeDraft !== null ? DRAFT_OPEN_REASON : null
    },
    run: async () => {
      try {
        await approveTestScenario(scenarioId)
      } catch (error: unknown) {
        throw new Error(approveScenarioFailure(error, t.scenarios.approve), { cause: error })
      }
      navigate(afterExit, { replace: true })
      return { id: scenarioId }
    },
  })

  // agent 가 이 시나리오를 FREE 로 바꾸고 TC 를 넣고 빼는 길. 읽는 중이거나 draft 를 보고 있으면 막는다 —
  // 그때 `editor` 는 저장된 시나리오가 아니다.
  useScenarioAgentActions({
    projectId,
    scenarioId,
    editor,
    runBuild,
    runBuildRunId,
    blockedReason: !validId
      ? t.scenarios.page.invalidAddress
      : status === 'missing'
        ? t.scenarios.page.missingCopy
        : status === 'loading'
          ? t.scenarios.map.loading
          : activeDraft !== null
            ? DRAFT_OPEN_REASON
            : null,
  })

  if (!validId) {
    return (
      <NotFoundPage
        back={{ to: backLink(projectId), label: t.scenarios.page.backToTestRuns }}
        copy={t.scenarios.page.invalidAddress}
        title={t.scenarios.page.notFoundTitle}
      />
    )
  }
  if (status === 'missing') {
    return (
      <NotFoundPage
        back={{ to: backLink(projectId), label: t.scenarios.page.backToTestRuns }}
        copy={t.scenarios.page.missingCopy}
        title={t.scenarios.page.notFoundTitle}
      />
    )
  }

  const e = t.scenarios.stepsEditor
  const saveState = active.saving ? 'saving' : active.dirty ? 'unsaved' : 'saved'
  const isFree = activeDraft === null && isFreeScenario(editor.working)
  const title = active.working.title.length > 0 ? active.working.title : t.scenarios.page.untitled

  return (
    <div {...split.studio}>
      <header className="st-top">
        <Link className="st-back" to={backLink(projectId)}>{t.scenarios.page.backToTestRuns}</Link>
        <div className="st-crumb">
          {fromRun !== null && (
            <>
              <RunNameCrumb
                projectId={projectId}
                runId={fromRun}
                name={runName}
                onRenamed={(run) => setRunName(run.name)}
              />
              <RunVersionChip build={runBuild} />
              <span className="st-crumb-sep" aria-hidden="true">/</span>
            </>
          )}
          <span className="scn">{title}</span>
        </div>
        <div className="st-spacer" />
        <button className="st-btn st-btn--ghost" type="button" onClick={() => setSpecOpen(true)} title={e.viewSpec}>
          {e.viewSpec} <kbd className="kbd">{shortcutLabel('K')}</kbd>
        </button>
        <div className="st-icons">
          <button className="iconbtn" type="button" disabled={!active.canUndo} onClick={active.undo} title={e.undo} aria-label={e.undo}><StudioIcon name="undo" /></button>
          <button className="iconbtn" type="button" disabled={!active.canRedo} onClick={active.redo} title={e.redo} aria-label={e.redo}><StudioIcon name="redo" /></button>
        </div>
        <span className={`savebadge ${saveState}`}>
          {saveState !== 'saved' && <span className="d" />}
          {saveState === 'saving' ? e.saving : saveState === 'unsaved' ? e.unsaved : e.saved}
        </span>
        {fromRun !== null && (
          <div className="st-seg">
            <button className="on" type="button">{t.scenarios.map.editView}</button>
            <button onClick={() => navigate(`/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(fromRun)}`)} type="button">{t.scenarios.map.mapView}</button>
          </div>
        )}
        {/* draft 를 열어 둔 동안 저장된 시나리오를 지우거나 승인하는 버튼은 숨긴다. 무엇에 대한
            버튼인지 헷갈린다 — draft 의 승인 · 버리기는 가운데 띠에 있다. */}
        {activeDraft === null && (
          <>
            <button className="st-btn st-btn--danger" onClick={() => setDialog('delete')} type="button">{t.scenarios.page.delete}</button>
            <button className="st-btn st-btn--primary" onClick={() => setDialog('approve')} ref={approveButton} type="button">{t.scenarios.page.approve}</button>
          </>
        )}
      </header>

      <div className="st-edit">
        <ScenarioList
          activeId={scenarioId}
          projectId={projectId}
          refreshToken={railToken}
          runId={fromRun}
          {...preview.listProps}
        />
        {preview.view !== null ? (
          preview.view
        ) : status === 'ready' ? (
          isFree
            ? <FreeScenarioEditor build={runBuild} editor={editor} gameBuildId={runBuild?.gameBuildId ?? null} projectId={projectId} />
            : <ScenarioStepEditor caseBuild={runBuild} projectId={projectId} editor={editor} />
        ) : (
          <div className="edoc-shell at-top at-bottom"><main className="edoc-wrap"><div className="edoc" /></main></div>
        )}
        {scenarioLock !== undefined && (
          <div className="st-bot-lock">
            <ArtelBotLock lock={scenarioLock} scope="editor" />
          </div>
        )}
        {unsavedDuringLock && !botLocked && (
          <div className="st-bot-banner" role="alert">
            <span>{t.scenarios.botLock.unsaved}</span>
            <button className="button button--secondary button--compact" onClick={() => { setUnsavedDuringLock(false); pullLatest() }} type="button">
              {t.scenarios.botLock.showLatest}
            </button>
            <button className="button button--primary button--compact" onClick={() => { setUnsavedDuringLock(false); void flush() }} type="button">
              {t.scenarios.botLock.saveMine}
            </button>
          </div>
        )}
        <SplitHandle label={t.scenarios.chat.widthHandle} {...split.handle} />
        <aside className="st-chat">
          {split.collapsed ? (
            <ChatRail busy={runChat.awaitingReply} onExpand={() => split.setCollapsed(false)} />
          ) : (
          <>
          {projectAgentEnabled && (
            <div aria-label={t.scenarios.chat.agentToggleLabel} className="st-seg st-chat-agent" role="group">
              <button
                aria-pressed={chatAgent === 'workflow'}
                className={chatAgent === 'workflow' ? 'on' : undefined}
                onClick={() => pickChatAgent('workflow')}
                type="button"
              >
                {t.scenarios.chat.agentWorkflow}
              </button>
              <button
                aria-pressed={chatAgent === 'project'}
                className={chatAgent === 'project' ? 'on' : undefined}
                onClick={() => pickChatAgent('project')}
                type="button"
              >
                {t.scenarios.chat.agentProject}
              </button>
            </div>
          )}
          {chatAgent === 'project' ? (
            <AgentChatEmbedded />
          ) : (
            fromRun !== null && (
              <RunChat gameBuildId={runBuild?.gameBuildId ?? null} onCollapse={() => split.setCollapsed(true)} session={runChat} />
            )
          )}
          </>
          )}
        </aside>
      </div>

      {/* ⌘K 명세 창도 이 런이 보는 TC 를 보인다(ARTEL-1115) — 런이 따르는 빌드 버전의 TC 와 그 버전의 판정이다. */}
      {specOpen && (
        <TestCaseSpecModal
          gameBuildId={runBuild?.gameBuildId}
          cases={runCaseList}
          onClose={() => setSpecOpen(false)}
          projectId={projectId}
          scope={fromRun === null ? undefined : runBuild === null ? t.scenarios.stepsEditor.board.pickAll : t.scenarios.stepsEditor.board.pickVersion(buildDisplayName({ ...runBuild }))}
        />
      )}

      {dialog === 'approve' && (
        <ApproveScenarioDialog
          onApproved={() => navigate(afterExit, { replace: true })}
          onClose={() => setDialog(null)}
          testScenarioId={scenarioId}
        />
      )}
      {dialog === 'delete' && (
        <DeleteScenarioDialog
          onClose={() => setDialog(null)}
          onDeleted={() => navigate(afterExit, { replace: true })}
          scenarioTitle={editor.working.title}
          testScenarioId={scenarioId}
        />
      )}
    </div>
  )
}
