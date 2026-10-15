import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { ConfirmActionDialog } from '../design-system/primitives/ConfirmActionDialog'
import { useI18n } from '../i18n/useI18n'
import { ProjectApiError } from '../projects/projectApi'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'
import { FolderDialog, type FolderDialogMode, type FolderDraft } from './FolderDialog'
import { currentFolderDrag, dragKind, endFolderDrag, readDrag, writeFolderDrag, type DragPayload } from './folderDrag'
import {
  ALL_FOLDERS,
  buildFolderTree,
  collectDescendantIds,
  countFolderDescendants,
  flattenFolderTree,
  listMoveTargets,
  NO_FOLDER,
  type FolderCounts,
  type FolderNode,
  type FolderSelection,
} from './testCaseFolders'
import type { TestCaseFolder } from './testCaseFolderApi'
import type { TestCaseFoldersStatus } from './useTestCaseFolders'
import { InfoHint } from '../design-system/primitives/InfoHint'

/**
 * 폴더를 바꾸는 작업. 부르는 쪽(라이브러리)이 Undo 기록에 실어 실행한다(ARTEL-1024). 실패는 부르는 쪽이
 * 알리고, 여기서는 기다리기만 한다.
 */
export type FolderOperations = {
  create: (input: { name: string; parentId: string | null }) => Promise<void>
  update: (folder: TestCaseFolder, next: { name: string; parentId: string | null }, kind: 'rename' | 'move') => Promise<void>
  remove: (folder: TestCaseFolder) => Promise<void>
  clone: (folder: TestCaseFolder) => Promise<void>
  /** 표에서 끈 케이스를 [folderId] 에 놓았다. */
  dropCases: (folderId: string, caseIds: readonly string[]) => Promise<void>
}

export type FolderHistoryControls = {
  canUndo: boolean
  canRedo: boolean
  busy: boolean
  undo: () => void
  redo: () => void
}

type MenuState = { x: number; y: number; folder: TestCaseFolder | null }

type DropHandlers = {
  onDragOver: (event: React.DragEvent) => void
  onDragLeave: (event: React.DragEvent) => void
  onDrop: (event: React.DragEvent) => void
}

/**
 * 라이브러리 왼쪽의 폴더 tree.
 *
 * 폴더 줄을 우클릭하면 새 폴더 · 이름 변경 · 이동 · 복제 · 삭제 메뉴가 뜬다. 빈 자리를 우클릭하면 최상위에 새
 * 폴더를 만든다. 표의 케이스를 폴더에 끌어 놓으면 담기고, 폴더를 다른 폴더에 끌어 놓으면 그 아래로 옮겨진다.
 * "폴더" 제목에 놓으면 최상위로 옮긴다.
 *
 * 쓰기는 모두 [FolderOperations] 로 나간다. 그래야 Undo 기록이 한 곳에 쌓인다.
 */
export function FolderPane({
  collapsed = false,
  collapsedLabel = '',
  counts,
  folders,
  history,
  onRetry,
  onSelect,
  operations,
  selection,
  showUnfiled = true,
  status,
  onToggleCollapsed,
  top,
}: {
  /** 접힌 창은 펼침 막대만 남는다(ARTEL-1022). */
  collapsed?: boolean
  /** 접힌 막대에 세로로 적는 지금 보는 범위. 예: `1.1-e2e`, `회귀 묶음` */
  collapsedLabel?: string
  counts: FolderCounts
  folders: readonly TestCaseFolder[]
  history: FolderHistoryControls
  onRetry: () => void
  onSelect: (selection: FolderSelection) => void
  operations: FolderOperations
  selection: FolderSelection
  /** "폴더 없음" 줄. 버전이 있는 프로젝트는 버전 쪽 "버전 없음" 이 대신하므로 그리지 않는다(ARTEL-1024). */
  showUnfiled?: boolean
  status: TestCaseFoldersStatus
  onToggleCollapsed?: () => void
  /**
   * 맨 위 "전체" 자리에 대신 그릴 것(ARTEL-1022). 버전이 있는 프로젝트는 여기에 버전 목록이 오고, 버전을 고르는
   * 것이 곧 전체를 보는 것이다.
   */
  top?: ReactNode
}) {
  const { t } = useI18n()
  const m = t.testCases.folders
  const headingId = useId()
  const [dialog, setDialog] = useState<{ mode: FolderDialogMode; folder: TestCaseFolder | null } | null>(null)
  const [deleting, setDeleting] = useState<TestCaseFolder | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const treeRef = useRef<HTMLElement | null>(null)

  const tree = useMemo(() => buildFolderTree(folders), [folders])
  const closeMenu = useCallback(() => setMenu(null), [])

  const parentRows = useMemo(() => {
    if (dialog?.mode === 'move' && dialog.folder !== null) return listMoveTargets(folders, dialog.folder.id)
    return flattenFolderTree(tree)
  }, [dialog, folders, tree])

  async function submit(draft: FolderDraft) {
    if (dialog === null) return
    const folder = dialog.folder
    if (dialog.mode === 'create') {
      await operations.create({ name: draft.name, parentId: draft.parentId })
    } else if (folder !== null) {
      const next = dialog.mode === 'rename'
        ? { name: draft.name, parentId: folder.parentId }
        : { name: folder.name, parentId: draft.parentId }
      await operations.update(folder, next, dialog.mode === 'rename' ? 'rename' : 'move')
    }
    setDialog(null)
  }

  function openMenu(event: React.MouseEvent | React.KeyboardEvent, folder: TestCaseFolder | null) {
    event.preventDefault()
    event.stopPropagation()
    // 키보드로 열면 누른 자리가 없다. 그 줄 아래에 띄운다.
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const point = 'clientX' in event && (event.clientX !== 0 || event.clientY !== 0)
      ? { x: event.clientX, y: event.clientY }
      : { x: rect.left + 24, y: rect.bottom }
    if (folder !== null) onSelect({ kind: 'folder', id: folder.id })
    setMenu({ ...point, folder })
  }

  function menuItems(folder: TestCaseFolder | null): ContextMenuItem[] {
    if (folder === null) {
      return [{ label: m.menu.createTop, onSelect: () => setDialog({ mode: 'create', folder: null }) }]
    }
    return [
      { label: m.menu.createInside, onSelect: () => setDialog({ mode: 'create', folder }) },
      { label: m.menu.rename, onSelect: () => setDialog({ mode: 'rename', folder }) },
      { label: m.menu.move, onSelect: () => setDialog({ mode: 'move', folder }) },
      { label: m.menu.clone, onSelect: () => void operations.clone(folder) },
      { label: m.menu.delete, danger: true, onSelect: () => setDeleting(folder) },
    ]
  }

  /** [targetId] 에 놓을 수 있나. 폴더는 자기와 하위 폴더 안으로 옮길 수 없다. null 은 최상위다. */
  function canDrop(payload: DragPayload | DragPayload['kind'], targetId: string | null): boolean {
    const kind = typeof payload === 'string' ? payload : payload.kind
    if (kind === 'cases') return targetId !== null
    if (typeof payload === 'string' || payload.kind !== 'folder') return true
    if (targetId === null) return folders.find((one) => one.id === payload.folderId)?.parentId !== null
    return payload.folderId !== targetId && !collectDescendantIds(folders, payload.folderId).has(targetId)
  }

  function dropHandlers(targetId: string | null): DropHandlers {
    const key = targetId ?? 'root'
    return {
      onDragOver: (event) => {
        const kind = dragKind([...event.dataTransfer.types])
        const folderId = kind === 'folder' ? currentFolderDrag() : null
        const known: DragPayload | DragPayload['kind'] | null = folderId !== null ? { kind: 'folder', folderId } : kind
        if (known === null || !canDrop(known, targetId)) return
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = 'move'
        if (dropTarget !== key) setDropTarget(key)
      },
      onDragLeave: (event) => {
        if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) {
          setDropTarget((current) => (current === key ? null : current))
        }
      },
      onDrop: (event) => {
        setDropTarget(null)
        const payload = readDrag(event.dataTransfer)
        if (payload === null || !canDrop(payload, targetId)) return
        event.preventDefault()
        event.stopPropagation()
        if (payload.kind === 'cases' && targetId !== null) {
          void operations.dropCases(targetId, payload.caseIds)
          return
        }
        if (payload.kind === 'folder') {
          const moving = folders.find((one) => one.id === payload.folderId)
          if (moving === undefined || moving.parentId === targetId) return
          void operations.update(moving, { name: moving.name, parentId: targetId }, 'move')
        }
      },
    }
  }

  if (status === 'failed') {
    return (
      <aside aria-labelledby={headingId} className="tcl-folders">
        <h2 className="tcl-folders-title" id={headingId}>{m.title}</h2>
        <div className="panel-message" role="alert">
          <p>{m.loadFailed}</p>
          <button className="button button--secondary button--compact" onClick={onRetry} type="button">
            {m.retry}
          </button>
        </div>
      </aside>
    )
  }

  const collapseButton = onToggleCollapsed === undefined ? null : (
    <button
      aria-expanded
      aria-label={m.collapsePane}
      className="tcl-side-toggle"
      data-tour="collapse"
      onClick={onToggleCollapsed}
      title={m.collapsePane}
      type="button"
    >
      <PaneIcon collapsed={false} />
    </button>
  )

  // 접힌 창은 막대 전체가 펴기 단추다. 위에 펴기 표시를, 그 아래에 지금 보는 범위를 세로로 적는다 — 화살표 하나만
  // 긴 막대 위에 떠 있으면 무엇이 접혔는지 알 수 없다.
  if (collapsed) {
    return (
      <aside aria-labelledby={headingId} className="tcl-folders tcl-folders--collapsed">
        <span className="visually-hidden" id={headingId}>{m.title}</span>
        <button
          aria-expanded={false}
          aria-label={m.expandPane}
          className="tcl-rail"
          onClick={onToggleCollapsed}
          title={m.expandPane}
          type="button"
        >
          <span className="tcl-rail-icon"><PaneIcon collapsed /></span>
          {collapsedLabel.length > 0 && <span className="tcl-rail-label">{collapsedLabel}</span>}
        </button>
      </aside>
    )
  }

  return (
    <aside aria-labelledby={headingId} className="tcl-folders">
      {top !== undefined && <div className="tcl-side-head">{top}{collapseButton}</div>}
      <div
        className={'tcl-folders-head' + (dropTarget === 'root' ? ' is-drop-target' : '')}
        {...dropHandlers(null)}
      >
        <div className="tcl-folders-titlewrap">
          <h2 className="tcl-folders-title" id={headingId} title={m.dropToRoot}>{m.title}</h2>
          <InfoHint>{m.menuHint}</InfoHint>
        </div>
        <div className="tcl-folders-actions" data-tour="folder-actions" role="group" aria-label={m.toolbar.label}>
          <button
            aria-label={m.toolbar.undo}
            className="iconbtn"
            disabled={!history.canUndo || history.busy}
            onClick={history.undo}
            title={m.toolbar.undo}
            type="button"
          >
            ↶
          </button>
          <button
            aria-label={m.toolbar.redo}
            className="iconbtn"
            disabled={!history.canRedo || history.busy}
            onClick={history.redo}
            title={m.toolbar.redo}
            type="button"
          >
            ↷
          </button>
          <button
            aria-label={m.toolbar.createTop}
            className="iconbtn"
            onClick={() => setDialog({ mode: 'create', folder: null })}
            title={m.toolbar.createTop}
            type="button"
          >
            +
          </button>
        </div>
        {top === undefined && collapseButton}
      </div>

      <nav
        aria-label={m.treeLabel}
        aria-busy={status === 'loading' || history.busy || undefined}
        className="tcl-folder-tree"
        data-tour="folders"
        onContextMenu={(event) => openMenu(event, null)}
        ref={treeRef}
      >
        <ul className="tcl-folder-list">
          {top === undefined && (
            <li>
              <FolderItem
                count={counts.total}
                current={selection.kind === 'all'}
                label={m.all}
                onClick={() => onSelect(ALL_FOLDERS)}
              />
            </li>
          )}
          {showUnfiled && (
            <li>
              <FolderItem
                count={counts.unfiled}
                current={selection.kind === 'none'}
                label={m.none}
                onClick={() => onSelect(NO_FOLDER)}
              />
            </li>
          )}
        </ul>
        {tree.length > 0 && (
          <FolderBranch
            counts={counts}
            dropHandlers={dropHandlers}
            dropTarget={dropTarget}
            nodes={tree}
            onContextMenu={openMenu}
            onSelect={onSelect}
            selectedId={selection.kind === 'folder' ? selection.id : null}
          />
        )}
      </nav>

      {menu !== null && (
        <ContextMenu
          items={menuItems(menu.folder)}
          label={menu.folder === null ? m.menu.label : m.menu.labelFor(menu.folder.name)}
          onClose={closeMenu}
          x={menu.x}
          y={menu.y}
        />
      )}

      {dialog !== null && (
        <FolderDialog
          initial={{
            name: dialog.mode === 'rename' && dialog.folder !== null ? dialog.folder.name : '',
            parentId: initialParentId(dialog, parentRows),
          }}
          mode={dialog.mode}
          onClose={() => setDialog(null)}
          onSubmit={submit}
          parentRows={parentRows}
        />
      )}

      {deleting !== null && (
        <ConfirmActionDialog
          body={
            <>
              <strong>{deleting.name}</strong>
              {m.delete.copySuffix(countFolderDescendants(folders, deleting.id))}
            </>
          }
          cancelLabel={m.delete.cancel}
          confirmLabel={m.delete.confirm}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await operations.remove(deleting)
            setDeleting(null)
            // 지운 폴더 줄이 사라지므로 dialog 가 돌려줄 focus 자리가 없다. 목록의 첫 항목으로 옮긴다.
            window.setTimeout(() => treeRef.current?.querySelector<HTMLElement>('button')?.focus(), 0)
          }}
          pendingLabel={m.delete.pending}
          title={m.delete.title(deleting.name)}
          toFailureMessage={(error) =>
            error instanceof ProjectApiError && error.isNotFound ? m.delete.gone : m.delete.failed
          }
        />
      )}
    </aside>
  )
}

/**
 * dialog 가 처음 고를 부모. 만들기는 메뉴를 연 폴더(없으면 최상위), 옮기기는 지금 부모다. 부모가 목록에 없는
 * 폴더(고아)를 옮길 때 select 는 첫 항목을 보이는데 상태가 옛 id 를 쥐면 안 되므로, 고를 수 없는 부모는 최상위로 본다.
 */
function initialParentId(
  dialog: { mode: FolderDialogMode; folder: TestCaseFolder | null },
  rows: readonly { folder: TestCaseFolder }[],
): string | null {
  const wanted = dialog.mode === 'move' ? (dialog.folder?.parentId ?? null) : (dialog.folder?.id ?? null)
  return rows.some((row) => row.folder.id === wanted) ? wanted : null
}

function FolderItem({
  count,
  current,
  dragFolderId,
  dropping = false,
  label,
  onClick,
  onContextMenu,
}: {
  count: number
  current: boolean
  /** 있으면 이 줄을 끌어 다른 폴더로 옮길 수 있다. */
  dragFolderId?: string
  dropping?: boolean
  label: string
  onClick: () => void
  onContextMenu?: (event: React.MouseEvent | React.KeyboardEvent) => void
}) {
  return (
    <button
      aria-current={current ? 'true' : undefined}
      className={'tcl-folder' + (current ? ' is-current' : '') + (dropping ? ' is-drop-target' : '')}
      draggable={dragFolderId !== undefined}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDragStart={
        dragFolderId === undefined ? undefined : (event) => writeFolderDrag(event.dataTransfer, dragFolderId)
      }
      onDragEnd={dragFolderId === undefined ? undefined : endFolderDrag}
      onKeyDown={(event) => {
        // 키보드로 메뉴를 여는 두 길: 메뉴 키와 Shift+F10.
        if (onContextMenu !== undefined && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) {
          onContextMenu(event)
        }
      }}
      title={label}
      type="button"
    >
      <span className="tcl-folder-name">{label}</span>
      <span className="tcl-folder-count mono">{count}</span>
    </button>
  )
}

function FolderBranch({
  counts,
  dropHandlers,
  dropTarget,
  nested = false,
  nodes,
  onContextMenu,
  onSelect,
  selectedId,
}: {
  counts: FolderCounts
  dropHandlers: (targetId: string) => DropHandlers
  dropTarget: string | null
  nested?: boolean
  nodes: readonly FolderNode[]
  onContextMenu: (event: React.MouseEvent | React.KeyboardEvent, folder: TestCaseFolder) => void
  onSelect: (selection: FolderSelection) => void
  selectedId: string | null
}) {
  return (
    <ul className={'tcl-folder-list' + (nested ? ' tcl-folder-list--nested' : '')}>
      {nodes.map((node) => (
        <li key={node.folder.id} {...dropHandlers(node.folder.id)}>
          <FolderItem
            count={counts.byFolder.get(node.folder.id) ?? 0}
            current={node.folder.id === selectedId}
            dragFolderId={node.folder.id}
            dropping={dropTarget === node.folder.id}
            label={node.folder.name}
            onClick={() => onSelect({ kind: 'folder', id: node.folder.id })}
            onContextMenu={(event) => onContextMenu(event, node.folder)}
          />
          {node.children.length > 0 && (
            <FolderBranch
              counts={counts}
              dropHandlers={dropHandlers}
              dropTarget={dropTarget}
              nested
              nodes={node.children}
              onContextMenu={onContextMenu}
              onSelect={onSelect}
              selectedId={selectedId}
            />
          )}
        </li>
      ))}
    </ul>
  )
}

/** 왼쪽 창 접기 · 펴기 그림. 창 모양 안에 방향 표시를 넣어 "창을 접는다" 로 읽히게 한다. */
function PaneIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg aria-hidden="true" className="tcl-pane-icon" viewBox="0 0 20 20">
      <rect fill="none" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5" width="16" x="2" y="3" />
      <path d="M7.5 3v14" stroke="currentColor" strokeWidth="1.5" />
      <path
        d={collapsed ? 'M11.5 8l2 2-2 2' : 'M13.5 8l-2 2 2 2'}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  )
}
