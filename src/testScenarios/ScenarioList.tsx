import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ConfirmActionDialog } from '../design-system/primitives/ConfirmActionDialog'
import { EdgeScrollbar } from '../design-system/primitives/EdgeScrollbar'
import { useI18n } from '../i18n/useI18n'
import { useActionBinding, useFieldBinding } from '../projectAgent/bindings'
import { resolveEntry, scenarioLookups } from '../projectAgent/specs/lookup'
import { listedOptions, readOnlyListWrite } from '../projectAgent/specs/listedOptions'
import {
  TEST_RUN_EDIT_ADD_SCENARIO_ACTION,
  TEST_RUN_EDIT_DELETE_SCENARIO_ACTION,
  TEST_RUN_EDIT_SCENARIOS_FIELD,
  TEST_RUN_EDIT_SELECT_SCENARIO_ACTION,
} from '../projectAgent/specs/testRunEdit'
import { ContextMenu, type ContextMenuItem } from '../testCases/ContextMenu'
import type { DraftScenario } from '../testRuns/runChatApi'
import { getRunScenarios, setRunScenarios } from '../testRuns/testRunApi'
import { createTestScenario, deleteTestScenario, listTestScenarios } from './scenarioApi'
import type { ScenarioImportResult } from './scenarioLibrary'
import { FreeScenarioBadge } from './FreeScenarioBadge'
import { PlaylistAddIcon, PlusIcon } from './scenarioIcons'
import { NewScenarioDialog } from './NewScenarioDialog'
import { ScenarioImportDialog } from './ScenarioImportDialog'
import { StudioIcon } from './studioIcons'
import type { TestScenarioSummary } from './scenarioTypes'

/** 런 밖의 목록에는 agent 가 쓸 수 있는 길이 없다. 화면에 해당하는 문구가 없어 agent 에게만 보인다. */
const NOT_IN_RUN = 'This list is not scoped to a test run, so scenarios cannot be changed from here.'
const CREATE_FAILED = 'The scenario could not be created. Try again.'

/**
 * The studio's left rail. When a `runId` is given the list is that run's
 * scenarios (in newest-first order); otherwise it is the whole project's. A row
 * navigates to the scenario, carrying the run so the Edit/Map toggle survives.
 *
 * Creating a scenario in a run context both makes it and appends it to the run,
 * so a scenario made here is immediately part of the run being edited.
 *
 * 가져오기 버튼은 다른 런의 시나리오를 복사해 이 런에 붙인다(ARTEL-995). 런 안에서만 보인다 — 복사본이
 * 붙을 자리가 런이다. 두 버튼은 아이콘만 두고 이름은 말풍선으로 보인다.
 *
 * 자동저장을 끈 저작 턴의 draft 를 **승인하면 이렇게 된다** 는 모습으로 겹쳐 그린다(ARTEL-1075).
 * 새로 생길 것은 맨 위에, 바뀔 것은 그 줄 그대로, 합쳐져 빠질 것은 지운 줄로 둔다. 셋 다 강조해
 * 저장된 것과 섞여 읽히지 않게 한다. 승인 · 버리기는 줄마다, 그리고 머리에 모두 한 번에.
 */
export function ScenarioList({
  projectId,
  activeId,
  runId = null,
  refreshToken = 0,
  drafts = [],
  activeDraftId = null,
  draftBusy = false,
  onOpenDraft,
  onApplyDrafts,
  onDiscardDrafts,
}: {
  projectId: string
  activeId: number
  /** When set, the rail is scoped to this run and new scenarios append to it. */
  runId?: string | null
  /**
   * Bumped by the studio when the authoring chat writes scenarios. The rail owns
   * its list, so without this a scenario the agent just made stays invisible
   * until the page is reloaded — and reloading is how the conversation is lost.
   */
  refreshToken?: number
  /** Unsaved results of the authoring chat, drawn over the list (ARTEL-1075). */
  drafts?: DraftScenario[]
  /** The draft open in the centre, if any. */
  activeDraftId?: string | null
  /** An approve or discard is on its way — the buttons wait for it. */
  draftBusy?: boolean
  onOpenDraft?: (draftId: string) => void
  onApplyDrafts?: (draftIds: string[]) => void
  onDiscardDrafts?: (draftIds: string[]) => void
}) {
  const { t } = useI18n()
  const s = t.scenarios.list
  const d = t.scenarios.draft
  const navigate = useNavigate()
  // 노드를 state 로 든다 — {@link EdgeScrollbar} 가 붙는 시점을 알아야 한다.
  const [listNode, setListNode] = useState<HTMLDivElement | null>(null)
  const [items, setItems] = useState<TestScenarioSummary[]>([])
  const [creating, setCreating] = useState(false)
  const [reload, setReload] = useState(0)
  const [importing, setImporting] = useState(false)
  const [choosingKind, setChoosingKind] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // 줄의 우클릭 메뉴(ARTEL-1049)와, 메뉴에서 고른 삭제의 확인.
  const [menu, setMenu] = useState<{ item: TestScenarioSummary; x: number; y: number } | null>(null)
  const [deleting, setDeleting] = useState<TestScenarioSummary | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const sortNewest = (list: TestScenarioSummary[]) =>
      [...list].sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt) || (b.testScenarioId - a.testScenarioId),
      )

    async function load() {
      const all = await listTestScenarios(Number(projectId), controller.signal)
      if (runId === null) return sortNewest(all)
      // Run-scoped: keep only scenarios in this run's composition.
      const runItems = await getRunScenarios(projectId, runId, controller.signal)
      const runIds = new Set(runItems.map((item) => item.testScenarioId))
      return sortNewest(all.filter((summary) => runIds.has(String(summary.testScenarioId))))
    }

    load().then(setItems).catch(() => undefined)
    return () => controller.abort()
  }, [projectId, runId, activeId, reload, refreshToken])

  function open(id: number) {
    const suffix = runId !== null ? `?run=${encodeURIComponent(runId)}` : ''
    navigate(`/projects/${encodeURIComponent(projectId)}/test-scenarios/${id}${suffix}`)
  }

  /** 만든 시나리오의 id. 만들지 못했으면 null — 화면은 조용히 그대로 두고, agent 는 이 값으로 실패를 안다. */
  async function create(): Promise<number | null> {
    if (creating) return null
    setChoosingKind(false)
    setCreating(true)
    try {
      const id = await createTestScenario(Number(projectId))
      // In a run, the new scenario must join the run's composition to be visible
      // and reachable within it — append after the existing ones.
      if (runId !== null) {
        const existing = await getRunScenarios(projectId, runId)
        await setRunScenarios(projectId, runId, [...existing.map((i) => i.testScenarioId), String(id)])
        setReload((n) => n + 1)
      }
      open(id)
      return id
    } catch {
      // stay put; the topbar's own errors already cover a failed round trip
      return null
    } finally {
      setCreating(false)
    }
  }

  /** 지금 편집 중인 시나리오를 목록에서 없앴으면 런의 빈 자리로 간다. 안 그러면 없는 시나리오를 보고 있게 된다. */
  function leaveIfActive(id: number) {
    if (id !== activeId) return
    if (runId !== null) navigate(`/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(runId)}/edit`)
  }

  /** 확인 대화상자의 삭제 버튼과 agent 의 삭제 action 이 함께 쓴다. */
  async function deleteScenario(item: TestScenarioSummary) {
    await deleteTestScenario(item.testScenarioId)
    setDeleting(null)
    setReload((n) => n + 1)
    leaveIfActive(item.testScenarioId)
  }

  async function removeFromRun(item: TestScenarioSummary) {
    if (runId === null) return
    try {
      const existing = await getRunScenarios(projectId, runId)
      await setRunScenarios(
        projectId,
        runId,
        existing.map((one) => one.testScenarioId).filter((id) => id !== String(item.testScenarioId)),
      )
      setNotice(s.menu.removed(item.title.length > 0 ? item.title : s.untitled))
      setReload((n) => n + 1)
      leaveIfActive(item.testScenarioId)
    } catch {
      setNotice(s.menu.removeFailed)
    }
  }

  // 저장된 줄 하나에 겹칠 draft — 바꾸는 것과, 합쳐져 빠지게 하는 것.
  const editOf = new Map(
    drafts.filter((draft) => draft.scenarioId !== null).map((draft) => [draft.scenarioId as number, draft]),
  )
  const absorberOf = new Map(
    drafts.flatMap((draft) => draft.absorbedScenarioIds.map((id) => [id, draft] as const)),
  )
  const added = drafts.filter((draft) => draft.scenarioId === null)

  function draftActions(draft: DraftScenario) {
    return (
      <span className="draft-acts">
        <button
          className="draft-act draft-act--ok tip-btn"
          aria-label={d.approve}
          disabled={draftBusy}
          onClick={() => onApplyDrafts?.([draft.draftId])}
          type="button"
        >
          ✓<span aria-hidden="true" className="tip">{d.approve}</span>
        </button>
        <button
          className="draft-act tip-btn"
          aria-label={d.discard}
          disabled={draftBusy}
          onClick={() => onDiscardDrafts?.([draft.draftId])}
          type="button"
        >
          <StudioIcon name="close" size={13} />
          <span aria-hidden="true" className="tip">{d.discard}</span>
        </button>
      </span>
    )
  }

  function draftRow(draft: DraftScenario, kind: 'new' | 'edit') {
    return (
      <div className={`draft-row draft-row--${kind}`} key={draft.draftId}>
        <button
          className={'scnrow' + (draft.draftId === activeDraftId ? ' sel' : '')}
          onClick={() => onOpenDraft?.(draft.draftId)}
          type="button"
        >
          <span className="vdot DRAFT" />
          <span className="scnrow-main">
            <span className="scnrow-name">{draft.title.length > 0 ? draft.title : s.untitled}</span>
            <span className={`draft-tag draft-tag--${kind}`}>{kind === 'new' ? d.kindNew : d.kindEdit}</span>
          </span>
          {draft.executionMode === 'FREE' ? <FreeScenarioBadge /> : <span />}
        </button>
        {draftActions(draft)}
      </div>
    )
  }

  function menuItems(item: TestScenarioSummary): ContextMenuItem[] {
    const items: ContextMenuItem[] = [
      {
        label: editOf.has(item.testScenarioId) ? d.openSaved : s.menu.open,
        onSelect: () => open(item.testScenarioId),
      },
    ]
    if (runId !== null) items.push({ label: s.menu.removeFromRun, onSelect: () => void removeFromRun(item) })
    items.push({ label: s.menu.delete, onSelect: () => setDeleting(item), danger: true })
    return items
  }

  function imported(result: ScenarioImportResult) {
    setImporting(false)
    setReload((n) => n + 1)
    const count = result.importedScenarios.length
    setNotice(result.unmatchedCaseIds.length > 0 ? `${s.imported(count)} ${s.unmatched(result.unmatchedCaseIds.length)}` : s.imported(count))
    const first = result.importedScenarios[0]
    if (first !== undefined) open(Number(first.testScenarioId))
  }

  // agent 가 쓰는 길. 런 안에서만 연다 — 런 밖의 목록은 이 페이지의 것이 아니다.
  const listRef = useRef<HTMLDivElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const lookups = scenarioLookups(
    items,
    (item) => String(item.testScenarioId),
    (item) => (item.title.length > 0 ? item.title : s.untitled),
  )
  const rowOf = (id: number) => listRef.current?.querySelector<HTMLElement>(`[data-scenario-id="${id}"]`) ?? null
  const pickedId = useRef<number | null>(null)
  const scenarioBlockedReason = () => (runId === null ? NOT_IN_RUN : items.length === 0 ? s.empty : null)
  useFieldBinding(TEST_RUN_EDIT_SCENARIOS_FIELD, {
    target: () => listRef.current,
    read: () => items.length,
    options: () =>
      listedOptions(items, (item) => ({ value: String(item.testScenarioId), label: item.title.length > 0 ? item.title : s.untitled })),
    write: readOnlyListWrite(TEST_RUN_EDIT_SCENARIOS_FIELD.name, 'use testRunEdit.selectScenario or testRunEdit.deleteScenario.'),
  })
  useActionBinding(TEST_RUN_EDIT_SELECT_SCENARIO_ACTION, {
    target: () => (pickedId.current === null ? listRef.current : rowOf(pickedId.current)),
    blocked: scenarioBlockedReason,
    run: async (args) => {
      const item = resolveEntry('scenario', args.scenario, lookups)
      pickedId.current = item.testScenarioId
      open(item.testScenarioId)
      return { id: item.testScenarioId, title: item.title }
    },
  })
  useActionBinding(TEST_RUN_EDIT_ADD_SCENARIO_ACTION, {
    target: () => addButton.current,
    blocked: () => (runId === null ? NOT_IN_RUN : creating ? t.scenarios.runEdit.creating : null),
    run: async () => {
      const id = await create()
      if (id === null) throw new Error(CREATE_FAILED)
      return { id }
    },
  })
  useActionBinding(TEST_RUN_EDIT_DELETE_SCENARIO_ACTION, {
    target: () => (pickedId.current === null ? listRef.current : rowOf(pickedId.current)),
    blocked: scenarioBlockedReason,
    run: async (args) => {
      const item = resolveEntry('scenario', args.scenario, lookups)
      pickedId.current = item.testScenarioId
      try {
        await deleteScenario(item)
      } catch {
        throw new Error(s.menu.deleteFailed)
      }
      return { id: item.testScenarioId, title: item.title }
    },
  })

  return (
    <aside className="elist">
      <div className="elist-head">
        <h2>{s.heading}</h2>
        <span className="count-pill">{items.length}</span>
        {runId !== null && (
          <button className="mini-add tip-btn" onClick={() => setImporting(true)} aria-label={s.import} type="button">
            <PlaylistAddIcon size={15} />
            <span aria-hidden="true" className="tip">{s.import}</span>
          </button>
        )}
        <button
          className="mini-add tip-btn"
          ref={addButton}
          onClick={runId !== null ? () => setChoosingKind(true) : () => void create()}
          disabled={creating}
          aria-label={s.new}
          type="button"
        >
          <PlusIcon />
          <span aria-hidden="true" className="tip">{s.new}</span>
        </button>
      </div>
      {notice !== null && (
        <p className="empty-note" role="status">{notice}</p>
      )}
      {choosingKind && runId !== null && (
        <NewScenarioDialog
          onClose={() => setChoosingKind(false)}
          onCreated={(id) => {
            setChoosingKind(false)
            setReload((n) => n + 1)
            open(id)
          }}
          onOrdered={() => void create()}
          projectId={projectId}
          runId={runId}
        />
      )}
      {importing && runId !== null && (
        <ScenarioImportDialog
          onClose={() => setImporting(false)}
          onImported={imported}
          projectId={projectId}
          runId={runId}
        />
      )}
      {drafts.length > 0 && (
        <div className="draft-bar" role="status">
          <p className="draft-bar-text">
            <strong>{d.bar(drafts.length)}</strong>
            <span>{d.barHint}</span>
          </p>
          <div className="draft-bar-acts">
            <button
              className="st-btn st-btn--ghost"
              disabled={draftBusy}
              onClick={() => onDiscardDrafts?.(drafts.map((draft) => draft.draftId))}
              type="button"
            >
              {d.discardAll}
            </button>
            <button
              className="st-btn st-btn--primary"
              disabled={draftBusy}
              onClick={() => onApplyDrafts?.(drafts.map((draft) => draft.draftId))}
              type="button"
            >
              {draftBusy ? d.working : d.approveAll}
            </button>
          </div>
        </div>
      )}
      <div
        className="scn-list"
        ref={(node) => {
          setListNode(node)
          listRef.current = node
        }}
      >
        {added.map((draft) => draftRow(draft, 'new'))}
        {items.length === 0 && added.length === 0 ? (
          <p className="empty-note">{s.empty}</p>
        ) : (
          items.map((item) => {
            const edit = editOf.get(item.testScenarioId)
            if (edit !== undefined) return draftRow({ ...edit, title: edit.title || item.title }, 'edit')
            const absorber = absorberOf.get(item.testScenarioId)
            return (
            <button
              className={
                'scnrow'
                + (item.testScenarioId === activeId && activeDraftId === null ? ' sel' : '')
                + (absorber !== undefined ? ' scnrow--gone' : '')
              }
              key={item.testScenarioId}
              data-scenario-id={item.testScenarioId}
              title={absorber !== undefined ? d.goneTip(absorber.title) : undefined}
              onClick={() => open(item.testScenarioId)}
              onContextMenu={(event) => {
                event.preventDefault()
                setMenu({ item, x: event.clientX, y: event.clientY })
              }}
              type="button"
            >
              <span className="vdot DRAFT" />
              <span className="scnrow-main">
                <span className="scnrow-name">{item.title.length > 0 ? item.title : s.untitled}</span>
                {absorber !== undefined ? (
                  <span className="draft-tag draft-tag--gone">{d.kindGone}</span>
                ) : (
                  <span className="scnrow-meta">{formatDay(item.updatedAt || item.createdAt)}</span>
                )}
              </span>
              {item.executionMode === 'FREE' ? <FreeScenarioBadge /> : <span />}
            </button>
            )
          })
        )}
      </div>
      <EdgeScrollbar label={s.heading} scroller={listNode} side="left" />
      {menu !== null && (
        <ContextMenu items={menuItems(menu.item)} label={s.menu.label} onClose={() => setMenu(null)} x={menu.x} y={menu.y} />
      )}
      {deleting !== null && (
        <ConfirmActionDialog
          body={<p>{s.menu.deleteCopy(deleting.title.length > 0 ? deleting.title : s.untitled)}</p>}
          cancelLabel={s.menu.cancel}
          confirmLabel={s.menu.delete}
          onClose={() => setDeleting(null)}
          onConfirm={() => deleteScenario(deleting)}
          pendingLabel={s.menu.deleting}
          title={s.menu.deleteTitle}
          toFailureMessage={() => s.menu.deleteFailed}
        />
      )}
    </aside>
  )
}

function formatDay(value: string): string {
  return value.length >= 10 ? value.slice(0, 10) : value
}
