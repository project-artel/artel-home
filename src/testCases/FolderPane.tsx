import { useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { ConfirmActionDialog } from '../design-system/primitives/ConfirmActionDialog'
import { useI18n } from '../i18n/useI18n'
import { ProjectApiError } from '../projects/projectApi'
import { FolderDialog, type FolderDialogMode, type FolderDraft } from './FolderDialog'
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
import {
  createTestCaseFolder,
  deleteTestCaseFolder,
  updateTestCaseFolder,
  type TestCaseFolder,
} from './testCaseFolderApi'
import type { TestCaseFoldersStatus } from './useTestCaseFolders'

/**
 * 라이브러리 왼쪽의 폴더 tree 와 그 폴더를 만지는 도구줄, 그리고 거기서 뜨는 dialog 들.
 *
 * 폴더를 만지는 일은 모두 여기서 끝난다. 밖으로 나가는 것은 둘이다. `onSelect` 는 어느 범위를
 * 볼지, `onChanged` 는 서버 상태가 바뀌었으니 다시 읽으라는 알림이다. 폴더를 지우면 그 안의
 * test case 의 `folderId` 도 서버에서 바뀌므로 부른 쪽이 test case 목록도 다시 읽는다.
 *
 * 도구줄은 tree 에서 고른 폴더 하나에 걸린다. 줄마다 메뉴를 달면 키보드로 닿는 순서와 popup
 * 관리가 줄 수만큼 늘어난다.
 */
export function FolderPane({
  collapsed = false,
  counts,
  folders,
  onAnnounce,
  onChanged,
  onRetry,
  onSelect,
  onUpsert,
  projectId,
  selection,
  status,
  onToggleCollapsed,
  top,
}: {
  /** 접힌 창은 펼침 버튼만 남는다(ARTEL-1022). */
  collapsed?: boolean
  counts: FolderCounts
  folders: readonly TestCaseFolder[]
  onAnnounce: (message: string) => void
  onChanged: (change: { deletedFolderIds: readonly string[] }) => void
  onRetry: () => void
  onSelect: (selection: FolderSelection) => void
  /** 서버가 돌려준 폴더를 목록에 바로 끼운다. 다시 읽기보다 먼저 tree 를 맞춘다. */
  onUpsert: (folder: TestCaseFolder) => void
  projectId: string
  selection: FolderSelection
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
  const [dialog, setDialog] = useState<FolderDialogMode | null>(null)
  const [deleting, setDeleting] = useState(false)
  const treeRef = useRef<HTMLElement | null>(null)

  const tree = useMemo(() => buildFolderTree(folders), [folders])
  const selectedFolder =
    selection.kind === 'folder'
      ? (folders.find((folder) => folder.id === selection.id) ?? null)
      : null

  const parentRows = useMemo(() => {
    if (dialog === 'move' && selectedFolder !== null) return listMoveTargets(folders, selectedFolder.id)
    return flattenFolderTree(tree)
  }, [dialog, folders, selectedFolder, tree])

  async function submit(draft: FolderDraft) {
    if (dialog === 'create') {
      const created = await createTestCaseFolder(projectId, draft)
      onUpsert(created)
      onChanged({ deletedFolderIds: [] })
      onSelect({ kind: 'folder', id: created.id })
      onAnnounce(m.announce.created(created.name))
    } else if (selectedFolder !== null) {
      const next = dialog === 'rename'
        ? { name: draft.name, parentId: selectedFolder.parentId }
        : { name: selectedFolder.name, parentId: draft.parentId }
      const updated = await updateTestCaseFolder(projectId, selectedFolder.id, next)
      onUpsert(updated)
      onChanged({ deletedFolderIds: [] })
      onAnnounce(dialog === 'rename' ? m.announce.renamed(updated.name) : m.announce.moved(updated.name))
    }
    setDialog(null)
  }

  // 부모가 목록에 없는 폴더(고아)를 옮길 때 select 는 첫 항목을 보이는데 상태는 옛 id 를 쥐고
  // 있으면 안 되므로, 고를 수 없는 부모는 최상위로 본다.
  const wantedParentId =
    dialog === 'move' ? (selectedFolder?.parentId ?? null) : (selectedFolder?.id ?? null)
  const initialParentId = parentRows.some((row) => row.folder.id === wantedParentId) ? wantedParentId : null

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

  const hasFolder = selectedFolder !== null
  // 전체나 폴더 없음을 골랐을 때 `새 폴더` 는 최상위에 만든다. 어디에 만드는지 이름이 말한다.
  const createLabel = hasFolder ? m.toolbar.createInside : m.toolbar.createTop

  const collapseButton = onToggleCollapsed === undefined ? null : (
    <button
      aria-expanded={!collapsed}
      aria-label={collapsed ? m.expandPane : m.collapsePane}
      className="tcl-side-toggle"
      onClick={onToggleCollapsed}
      title={collapsed ? m.expandPane : m.collapsePane}
      type="button"
    >
      <span aria-hidden="true">{collapsed ? '›' : '‹'}</span>
    </button>
  )

  if (collapsed) {
    return <aside aria-labelledby={headingId} className="tcl-folders tcl-folders--collapsed">{collapseButton}<span className="visually-hidden" id={headingId}>{m.title}</span></aside>
  }

  return (
    <aside aria-labelledby={headingId} className="tcl-folders">
      {top !== undefined && <div className="tcl-side-head">{top}{collapseButton}</div>}
      <div className="tcl-folders-head">
        <h2 className="tcl-folders-title" id={headingId}>{m.title}</h2>
        {top === undefined && collapseButton}
      </div>

      <nav aria-label={m.treeLabel} aria-busy={status === 'loading' || undefined} ref={treeRef}>
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
          <li>
            <FolderItem
              count={counts.unfiled}
              current={selection.kind === 'none'}
              label={m.none}
              onClick={() => onSelect(NO_FOLDER)}
            />
          </li>
        </ul>
        {tree.length > 0 && (
          <FolderBranch
            counts={counts}
            nodes={tree}
            onSelect={onSelect}
            selectedId={selection.kind === 'folder' ? selection.id : null}
          />
        )}
      </nav>

      <div className="tcl-folder-tools" role="group" aria-label={m.toolbar.label}>
        <button
          className="button button--secondary button--compact"
          onClick={() => setDialog('create')}
          type="button"
        >
          {createLabel}
        </button>
        <button
          className="button button--secondary button--compact"
          disabled={!hasFolder}
          onClick={() => setDialog('rename')}
          type="button"
        >
          {m.toolbar.rename}
        </button>
        <button
          className="button button--secondary button--compact"
          disabled={!hasFolder}
          onClick={() => setDialog('move')}
          type="button"
        >
          {m.toolbar.move}
        </button>
        <button
          className="button button--danger button--compact"
          disabled={!hasFolder}
          onClick={() => setDeleting(true)}
          type="button"
        >
          {m.toolbar.delete}
        </button>
      </div>
      {!hasFolder && <p className="field-hint">{m.toolbar.pickHint}</p>}

      {dialog !== null && (
        <FolderDialog
          initial={{
            name: dialog === 'rename' && selectedFolder !== null ? selectedFolder.name : '',
            parentId: initialParentId,
          }}
          mode={dialog}
          onClose={() => setDialog(null)}
          onSubmit={submit}
          parentRows={parentRows}
        />
      )}

      {deleting && selectedFolder !== null && (
        <ConfirmActionDialog
          body={
            <>
              <strong>{selectedFolder.name}</strong>
              {m.delete.copySuffix(countFolderDescendants(folders, selectedFolder.id))}
            </>
          }
          cancelLabel={m.delete.cancel}
          confirmLabel={m.delete.confirm}
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            const removedIds = [selectedFolder.id, ...collectDescendantIds(folders, selectedFolder.id)]
            try {
              await deleteTestCaseFolder(projectId, selectedFolder.id)
            } catch (error: unknown) {
              // 이미 지워진 폴더면 tree 가 낡은 것이다. 다시 읽어 맞춘다.
              if (error instanceof ProjectApiError && error.isNotFound) onChanged({ deletedFolderIds: [] })
              throw error
            }
            onChanged({ deletedFolderIds: removedIds })
            onAnnounce(m.announce.deleted(selectedFolder.name))
            setDeleting(false)
            // 지운 폴더의 도구줄 button 은 비활성이 되므로 dialog 가 돌려줄 focus 자리가 없다.
            // 목록의 첫 항목으로 옮긴다.
            window.setTimeout(() => treeRef.current?.querySelector<HTMLElement>('button')?.focus(), 0)
          }}
          pendingLabel={m.delete.pending}
          title={m.delete.title(selectedFolder.name)}
          toFailureMessage={(error) =>
            error instanceof ProjectApiError && error.isNotFound ? m.delete.gone : m.delete.failed
          }
        />
      )}
    </aside>
  )
}

function FolderItem({
  contentMap = false,
  count,
  current,
  label,
  onClick,
}: {
  contentMap?: boolean
  count: number
  current: boolean
  label: string
  onClick: () => void
}) {
  const { t } = useI18n()
  const m = t.testCases.folders

  return (
    <button
      aria-current={current ? 'true' : undefined}
      className={'tcl-folder' + (current ? ' is-current' : '')}
      onClick={onClick}
      title={label}
      type="button"
    >
      <span className="tcl-folder-name">{label}</span>
      {contentMap && (
        <span className="tcl-folder-badge" title={m.contentMapTitle}>{m.contentMapBadge}</span>
      )}
      <span className="tcl-folder-count mono">{count}</span>
    </button>
  )
}

function FolderBranch({
  counts,
  nested = false,
  nodes,
  onSelect,
  selectedId,
}: {
  counts: FolderCounts
  nested?: boolean
  nodes: readonly FolderNode[]
  onSelect: (selection: FolderSelection) => void
  selectedId: string | null
}) {
  return (
    <ul className={'tcl-folder-list' + (nested ? ' tcl-folder-list--nested' : '')}>
      {nodes.map((node) => (
        <li key={node.folder.id}>
          <FolderItem
            contentMap={node.folder.contentMapId !== null}
            count={counts.byFolder.get(node.folder.id) ?? 0}
            current={node.folder.id === selectedId}
            label={node.folder.name}
            onClick={() => onSelect({ kind: 'folder', id: node.folder.id })}
          />
          {node.children.length > 0 && (
            <FolderBranch
              counts={counts}
              nested
              nodes={node.children}
              onSelect={onSelect}
              selectedId={selectedId}
            />
          )}
        </li>
      ))}
    </ul>
  )
}
