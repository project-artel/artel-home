import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { useActionBinding } from '../projectAgent/bindings'
import { TEST_RUN_EDIT_APPROVE_SCENARIO_ACTION } from '../projectAgent/specs/testRunEdit'
import { shortcutLabel } from '../shell/platform'
import { TestCaseSpecModal } from '../testCases/TestCaseSpecModal'
import { RunChat } from '../testRuns/RunChat'
import { RunNameCrumb } from '../testRuns/RunNameCrumb'
import { SplitHandle } from '../design-system/primitives/SplitHandle'
import { RunVersionChip } from '../testRuns/RunVersionChip'
import { getTestRun, type RunGameBuild } from '../testRuns/testRunApi'
import { useRunChatSession } from '../testRuns/useRunChatSession'
import { ApproveScenarioDialog } from './ApproveScenarioDialog'
import { approveScenarioFailure } from './approveScenarioError'
import { DeleteScenarioDialog } from './DeleteScenarioDialog'
import { approveTestScenario, getTestScenario } from './scenarioApi'
import { FreeScenarioEditor } from './FreeScenarioEditor'
import { ScenarioList } from './ScenarioList'
import { ScenarioStepEditor } from './ScenarioStepEditor'
import { EMPTY_SCENARIO_DRAFT, isFreeScenario } from './scenarioTypes'
import { useDraftPreview } from './useDraftPreview'
import { useChatWidth } from './useChatWidth'
import { useStepEditor } from './useStepEditor'

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

function backLink(projectId: string) {
  return `/projects/${encodeURIComponent(projectId)}`
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
  const runChat = useRunChatSession(projectId, fromRun, onProposalApplied, onTurnEnded)

  // 자동저장을 끈 턴의 draft(ARTEL-1075). 열어 두면 가운데와 헤더가 draft 를 따른다.
  const preview = useDraftPreview(projectId, runChat)
  const activeDraft = preview.activeDraft

  // The run's name for the crumb, when the studio was opened from a run. Fetched
  // here because the studio only carries the run id (?run=), not its name.
  const [runName, setRunName] = useState('')
  const [runBuild, setRunBuild] = useState<RunGameBuild | null>(null)
  useEffect(() => {
    if (fromRun === null) return
    const controller = new AbortController()
    getTestRun(projectId, fromRun, controller.signal)
      .then((run) => {
        if (run === null) return
        setRunName(run.name)
        setRunBuild(run.gameBuild)
      })
      .catch(() => { /* leave the crumb blank on failure */ })
    return () => controller.abort()
  }, [projectId, fromRun])

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
      if (inField) return
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo() }
      else if ((key === 'z' && event.shiftKey) || key === 'y') { event.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const split = useChatWidth()

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

  if (!validId) {
    return (
      <section className="page"><div className="panel-message">
        <h1>{t.scenarios.page.notFoundTitle}</h1>
        <p className="panel-message-copy">{t.scenarios.page.invalidAddress}</p>
        <Link className="button button--secondary" to={backLink(projectId)}>{t.scenarios.page.backToProject}</Link>
      </div></section>
    )
  }
  if (status === 'missing') {
    return (
      <section className="page"><div className="panel-message">
        <h1>{t.scenarios.page.notFoundTitle}</h1>
        <p className="panel-message-copy">{t.scenarios.page.missingCopy}</p>
        <Link className="button button--secondary" to={backLink(projectId)}>{t.scenarios.page.backToProject}</Link>
      </div></section>
    )
  }

  const e = t.scenarios.stepsEditor
  const saveState = active.saving ? 'saving' : active.dirty ? 'unsaved' : 'saved'
  const isFree = activeDraft === null && isFreeScenario(editor.working)
  const title = active.working.title.length > 0 ? active.working.title : t.scenarios.page.untitled

  return (
    <div {...split.studio}>
      <header className="st-top">
        <Link className="st-back" to={backLink(projectId)}>{t.scenarios.page.backToProject}</Link>
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
          <button className="iconbtn" type="button" disabled={!active.canUndo} onClick={active.undo} title={e.undo}>↶</button>
          <button className="iconbtn" type="button" disabled={!active.canRedo} onClick={active.redo} title={e.redo}>↷</button>
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
            ? <FreeScenarioEditor editor={editor} projectId={projectId} />
            : <ScenarioStepEditor projectId={projectId} editor={editor} />
        ) : (
          <div className="edoc-shell at-top at-bottom"><main className="edoc-wrap"><div className="edoc" /></main></div>
        )}
        <SplitHandle label={t.scenarios.chat.widthHandle} {...split.handle} />
        <aside className="st-chat">
          {fromRun !== null && <RunChat session={runChat} />}
        </aside>
      </div>

      {specOpen && <TestCaseSpecModal projectId={projectId} onClose={() => setSpecOpen(false)} />}

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
