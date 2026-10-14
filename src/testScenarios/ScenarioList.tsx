import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ConfirmActionDialog } from '../design-system/primitives/ConfirmActionDialog'
import { EdgeScrollbar } from '../design-system/primitives/EdgeScrollbar'
import { useI18n } from '../i18n/useI18n'
import { ContextMenu, type ContextMenuItem } from '../testCases/ContextMenu'
import { getRunScenarios, setRunScenarios } from '../testRuns/testRunApi'
import { createTestScenario, deleteTestScenario, listTestScenarios } from './scenarioApi'
import type { ScenarioImportResult } from './scenarioLibrary'
import { PlaylistAddIcon, PlusIcon } from './scenarioIcons'
import { ScenarioImportDialog } from './ScenarioImportDialog'
import type { TestScenarioSummary } from './scenarioTypes'

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
 */
export function ScenarioList({
  projectId,
  activeId,
  runId = null,
  refreshToken = 0,
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
}) {
  const { t } = useI18n()
  const s = t.scenarios.list
  const navigate = useNavigate()
  // 노드를 state 로 든다 — {@link EdgeScrollbar} 가 붙는 시점을 알아야 한다.
  const [listNode, setListNode] = useState<HTMLDivElement | null>(null)
  const [items, setItems] = useState<TestScenarioSummary[]>([])
  const [creating, setCreating] = useState(false)
  const [reload, setReload] = useState(0)
  const [importing, setImporting] = useState(false)
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

  async function create() {
    if (creating) return
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
    } catch {
      // stay put; the topbar's own errors already cover a failed round trip
    } finally {
      setCreating(false)
    }
  }

  /** 지금 편집 중인 시나리오를 목록에서 없앴으면 런의 빈 자리로 간다. 안 그러면 없는 시나리오를 보고 있게 된다. */
  function leaveIfActive(id: number) {
    if (id !== activeId) return
    if (runId !== null) navigate(`/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(runId)}/edit`)
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

  function menuItems(item: TestScenarioSummary): ContextMenuItem[] {
    const items: ContextMenuItem[] = [{ label: s.menu.open, onSelect: () => open(item.testScenarioId) }]
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
        <button className="mini-add tip-btn" onClick={create} disabled={creating} aria-label={s.new} type="button">
          <PlusIcon />
          <span aria-hidden="true" className="tip">{s.new}</span>
        </button>
      </div>
      {notice !== null && (
        <p className="empty-note" role="status">{notice}</p>
      )}
      {importing && runId !== null && (
        <ScenarioImportDialog
          onClose={() => setImporting(false)}
          onImported={imported}
          projectId={projectId}
          runId={runId}
        />
      )}
      <div className="scn-list" ref={setListNode}>
        {items.length === 0 ? (
          <p className="empty-note">{s.empty}</p>
        ) : (
          items.map((item) => (
            <button
              className={'scnrow' + (item.testScenarioId === activeId ? ' sel' : '')}
              key={item.testScenarioId}
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
                <span className="scnrow-meta">{formatDay(item.updatedAt || item.createdAt)}</span>
              </span>
              <span />
            </button>
          ))
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
          onConfirm={async () => {
            const item = deleting
            await deleteTestScenario(item.testScenarioId)
            setDeleting(null)
            setReload((n) => n + 1)
            leaveIfActive(item.testScenarioId)
          }}
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
