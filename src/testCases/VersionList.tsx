import { useCallback, useId, useMemo, useState } from 'react'
import { ConfirmActionDialog } from '../design-system/primitives/ConfirmActionDialog'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'
import { NameDialog } from './NameDialog'
import { Picker } from './Picker'
import {
  arrangeVersions,
  hiddenVersions,
  UNVERSIONED,
  versionName,
  type TestCaseVersionSummary,
  type VersionGroup,
} from './testCaseVersions'

/** 버전 목록 정리 작업. 부르는 쪽(라이브러리)이 Undo 기록에 실어 실행한다(ARTEL-1024). */
export type VersionOperations = {
  createGroup: (name: string) => Promise<void>
  renameGroup: (group: VersionGroup, name: string) => Promise<void>
  deleteGroup: (group: VersionGroup) => Promise<void>
  assignGroup: (version: TestCaseVersionSummary, groupId: string | null) => Promise<void>
  setHidden: (version: TestCaseVersionSummary, hidden: boolean) => Promise<void>
  copyToFolder: (version: TestCaseVersionSummary) => Promise<void>
  /** 다른 라이브러리(버전 · 버전 없음 · 폴더)의 사용자 생성 케이스를 이 버전에 가져오는 창을 연다(ARTEL-1032). */
  importManual?: (version: TestCaseVersionSummary) => void
  /** 다른 버전의 판정을 이 버전 TC 에 가져오는 창을 연다(ARTEL-1181). */
  importVerdicts?: (version: TestCaseVersionSummary) => void
}

/** 끄는 버전. 폴더 끌기와 섞이지 않게 형식을 따로 쓴다. */
const VERSION_TYPE = 'application/x-artel-test-case-version'

type MenuState =
  | { x: number; y: number; kind: 'root' }
  | { x: number; y: number; kind: 'group'; group: VersionGroup }
  | { x: number; y: number; kind: 'version'; version: TestCaseVersionSummary }

type MenuTarget =
  | { kind: 'root' }
  | { kind: 'group'; group: VersionGroup }
  | { kind: 'version'; version: TestCaseVersionSummary }

/**
 * 라이브러리 왼쪽 맨 위의 "버전" 묶음(ARTEL-1022). 최신 버전이 맨 위이고, 지금 버전에는 칩이 붙는다.
 * 버전을 고르면 그 버전의 TC 표를 본다. 줄 모양은 아래 폴더 tree(`tcl-folder`)와 같다.
 *
 * 사람이 정리할 수 있다(ARTEL-1024).
 * - 버전 묶음: 버전과 같은 층에 묶음 하나(예: `1.X`, `2.X`). 버전을 묶음에 끌어 놓거나 메뉴로 넣는다. "버전" 제목에
 *   놓으면 묶음에서 뺀다.
 * - 숨기기: 목록에서 빼되 지우지 않는다. 맨 아래 "숨긴 버전" 을 펴면 보이고, 거기서 다시 보이게 한다.
 * - 폴더로 복제: 그 버전의 케이스를 담은 폴더를 새로 만든다.
 * - 버전 없음: 어느 버전에도 몫이 없는 케이스(QA 판정 전의 사람이 쓴 케이스 등).
 */
export function VersionList({
  groups,
  onSelect,
  operations,
  selectedId,
  unversionedTotal,
  versions,
  messages,
  allRow,
  readOnly = false,
  showUnversioned = true,
}: {
  groups: readonly VersionGroup[]
  onSelect: (gameBuildId: string) => void
  operations: VersionOperations
  /** 고른 build id, "버전 없음"(`unversioned`), 또는 폴더를 보는 중이면 null. */
  selectedId: string | null
  unversionedTotal: number
  versions: readonly TestCaseVersionSummary[]
  /** 문구를 바꿔 쓸 때(이슈 화면, ARTEL-1114). 없으면 케이스 라이브러리 문구. */
  messages?: ReturnType<typeof useI18n>['t']['testCases']['versions']
  /**
   * 버전을 가로질러 보는 맨 위 줄(이슈 화면의 "모든 버전", ARTEL-1114). 다른 버전 줄과 같은 모양으로 그린다.
   * 케이스 라이브러리는 늘 한 버전을 보므로 쓰지 않는다.
   */
  allRow?: { label: string; count: number; selected: boolean; onSelect: () => void }
  /** 고르기만 한다(TC 가져오기 창). 묶음 만들기 단추, 우클릭 메뉴, 끌어 옮기기가 없고 [operations] 를 부르지 않는다. */
  readOnly?: boolean
  /** "버전 없음" 줄. TC 가져오기 창은 런의 버전 하나만 보이므로 끈다. */
  showUnversioned?: boolean
}) {
  const { t } = useI18n()
  const m = messages ?? t.testCases.versions
  const entries = useMemo(() => arrangeVersions(versions, groups), [versions, groups])
  const hidden = useMemo(() => hiddenVersions(versions), [versions])
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  const [showHidden, setShowHidden] = useState(false)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [naming, setNaming] = useState<{ group: VersionGroup | null } | null>(null)
  const [moving, setMoving] = useState<TestCaseVersionSummary | null>(null)
  const [deleting, setDeleting] = useState<VersionGroup | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])

  function openMenu(event: React.MouseEvent | React.KeyboardEvent, target: MenuTarget) {
    // dialog 는 body 로 뜨지만 React 이벤트는 이 목록까지 올라온다. dialog 안의 우클릭은 메뉴를 열지 않는다.
    if ((event.target as HTMLElement).closest('[role="dialog"]') !== null) return
    event.preventDefault()
    event.stopPropagation()
    // 키보드로 열면 누른 자리가 없다. 그 줄 아래에 띄운다.
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const point = 'clientX' in event && (event.clientX !== 0 || event.clientY !== 0)
      ? { x: event.clientX, y: event.clientY }
      : { x: rect.left + 24, y: rect.bottom }
    setMenu({ ...point, ...target })
  }
  const menuKeys = (target: MenuTarget) => (event: React.KeyboardEvent) => {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) openMenu(event, target)
  }

  function menuItems(state: MenuState): ContextMenuItem[] {
    if (state.kind === 'root') return [{ label: m.menu.createGroup, onSelect: () => setNaming({ group: null }) }]
    if (state.kind === 'group') {
      const group = state.group
      return [
        { label: m.menu.renameGroup, onSelect: () => setNaming({ group }) },
        { label: m.menu.deleteGroup, danger: true, onSelect: () => setDeleting(group) },
      ]
    }
    const version = state.version
    if (version.hidden) {
      return [
        { label: m.menu.show, onSelect: () => void operations.setHidden(version, false) },
        { label: m.menu.copyToFolder, onSelect: () => void operations.copyToFolder(version) },
      ]
    }
    const importManual = operations.importManual
    const importVerdicts = operations.importVerdicts
    return [
      { label: m.menu.copyToFolder, onSelect: () => void operations.copyToFolder(version) },
      ...(importManual === undefined ? [] : [{ label: m.menu.importManual, onSelect: () => importManual(version) }]),
      ...(importVerdicts === undefined || versions.length < 2
        ? []
        : [{ label: m.menu.importVerdicts, onSelect: () => importVerdicts(version) }]),
      { label: m.menu.moveToGroup, disabled: groups.length === 0, onSelect: () => setMoving(version) },
      ...(version.groupId === null
        ? []
        : [{ label: m.menu.ungroup, onSelect: () => void operations.assignGroup(version, null) }]),
      { label: m.menu.hide, onSelect: () => void operations.setHidden(version, true) },
    ]
  }

  /** 버전 끌기를 받는 자리. [groupId] 가 null 이면 묶음에서 뺀다. */
  function dropHandlers(key: string, groupId: string | null) {
    return {
      onDragOver: (event: React.DragEvent) => {
        if (!event.dataTransfer.types.includes(VERSION_TYPE)) return
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = 'move'
        if (dropTarget !== key) setDropTarget(key)
      },
      onDragLeave: (event: React.DragEvent) => {
        if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) {
          setDropTarget((current) => (current === key ? null : current))
        }
      },
      onDrop: (event: React.DragEvent) => {
        setDropTarget(null)
        const buildId = event.dataTransfer.getData(VERSION_TYPE)
        const version = versions.find((one) => one.gameBuildId === buildId)
        if (version === undefined) return
        event.preventDefault()
        event.stopPropagation()
        if (version.groupId !== groupId) void operations.assignGroup(version, groupId)
      },
    }
  }

  const versionRow = (version: TestCaseVersionSummary) => {
    const current = version.gameBuildId === selectedId
    return (
      <li key={version.gameBuildId}>
        <button
          aria-current={current ? 'true' : undefined}
          className={'tcl-folder tcl-version' + (current ? ' is-current' : '') + (version.hidden ? ' is-hidden' : '')}
          // 튜토리얼이 "다른 라이브러리에서 가져오기" 를 설명할 때 밝게 두는 줄(ARTEL-1033).
          data-tour={version.latest && !version.hidden ? 'latest-version' : undefined}
          draggable={!readOnly && !version.hidden}
          onClick={() => onSelect(version.gameBuildId)}
          onContextMenu={readOnly ? undefined : (event) => openMenu(event, { kind: 'version', version })}
          onDragStart={(event) => {
            event.dataTransfer.setData(VERSION_TYPE, version.gameBuildId)
            event.dataTransfer.setData('text/plain', versionName(version))
            event.dataTransfer.effectAllowed = 'move'
          }}
          onKeyDown={readOnly ? undefined : menuKeys({ kind: 'version', version })}
          type="button"
        >
          <span className="tcl-folder-name" title={versionName(version)}>{versionName(version)}</span>
          {version.latest && <span className="tcl-version-latest">{m.latest}</span>}
          <span className="tcl-folder-count">{version.total}</span>
        </button>
      </li>
    )
  }

  return (
    <section
      aria-label={m.heading}
      className="tcl-versions"
      data-tour="versions"
      onContextMenu={readOnly ? undefined : (event) => openMenu(event, { kind: 'root' })}
    >
      <div
        className={'tcl-versions-head' + (dropTarget === 'root' ? ' is-drop-target' : '')}
        data-tour="version-head"
        {...dropHandlers('root', null)}
      >
        <h2 className="tcl-folders-title" title={readOnly ? undefined : m.dropToUngroup}>{m.heading}</h2>
        {!readOnly && <button
          aria-label={m.menu.createGroup}
          className="iconbtn tcl-versions-add"
          onClick={() => setNaming({ group: null })}
          title={m.menu.createGroup}
          type="button"
        >
          +
        </button>}
      </div>
      <ul className="tcl-folder-list">
        {allRow && (
          <li>
            <button
              aria-current={allRow.selected ? 'true' : undefined}
              className={'tcl-folder tcl-version' + (allRow.selected ? ' is-current' : '')}
              onClick={allRow.onSelect}
              type="button"
            >
              <span className="tcl-folder-name">{allRow.label}</span>
              <span className="tcl-folder-count">{allRow.count}</span>
            </button>
          </li>
        )}
        {entries.map((entry) => {
          if (entry.kind === 'version') return versionRow(entry.version)
          const group = entry.group
          const isFolded = folded.has(group.id)
          const key = `group:${group.id}`
          return (
            <li key={key} {...dropHandlers(key, group.id)}>
              <button
                aria-expanded={!isFolded}
                className={'tcl-folder tcl-version-group' + (dropTarget === key ? ' is-drop-target' : '')}
                onClick={() =>
                  setFolded((current) => {
                    const next = new Set(current)
                    if (next.has(group.id)) next.delete(group.id)
                    else next.add(group.id)
                    return next
                  })
                }
                onContextMenu={readOnly ? undefined : (event) => openMenu(event, { kind: 'group', group })}
                onKeyDown={readOnly ? undefined : menuKeys({ kind: 'group', group })}
                title={group.name}
                type="button"
              >
                <Chevron open={!isFolded} />
                <span className="tcl-folder-name">{group.name}</span>
                <span className="tcl-folder-count">{entry.versions.length}</span>
              </button>
              {!isFolded && entry.versions.length > 0 && (
                <ul className="tcl-folder-list tcl-folder-list--nested">{entry.versions.map(versionRow)}</ul>
              )}
            </li>
          )
        })}
        {showUnversioned && <li>
          <button
            aria-current={selectedId === UNVERSIONED ? 'true' : undefined}
            className={'tcl-folder tcl-version tcl-version--none' + (selectedId === UNVERSIONED ? ' is-current' : '')}
            data-tour="unversioned"
            onClick={() => onSelect(UNVERSIONED)}
            title={m.unversionedTitle}
            type="button"
          >
            <span className="tcl-folder-name">{m.unversioned}</span>
            <span className="tcl-folder-count">{unversionedTotal}</span>
          </button>
        </li>}
      </ul>
      {hidden.length > 0 && (
        <div className="tcl-hidden-versions">
          <button
            aria-expanded={showHidden}
            className="tcl-hidden-toggle"
            onClick={() => setShowHidden((value) => !value)}
            type="button"
          >
            <Chevron open={showHidden} />
            {m.hiddenVersions(hidden.length)}
          </button>
          {showHidden && <ul className="tcl-folder-list">{hidden.map(versionRow)}</ul>}
        </div>
      )}

      {menu !== null && (
        <ContextMenu
          items={menuItems(menu)}
          label={
            menu.kind === 'version'
              ? m.menu.labelFor(versionName(menu.version))
              : menu.kind === 'group'
                ? m.menu.labelFor(menu.group.name)
                : m.menu.label
          }
          onClose={closeMenu}
          x={menu.x}
          y={menu.y}
        />
      )}

      {naming !== null && (
        <NameDialog
          initialName={naming.group?.name ?? ''}
          messages={m.groupDialog}
          onClose={() => setNaming(null)}
          onSubmit={async (name) => {
            if (naming.group === null) await operations.createGroup(name)
            else await operations.renameGroup(naming.group, name)
            setNaming(null)
          }}
          submitLabel={naming.group === null ? m.groupDialog.create : m.groupDialog.rename}
          title={naming.group === null ? m.groupDialog.createTitle : m.groupDialog.renameTitle}
        />
      )}

      {moving !== null && (
        <GroupMoveDialog
          groups={groups}
          onClose={() => setMoving(null)}
          onSubmit={async (groupId) => {
            await operations.assignGroup(moving, groupId)
            setMoving(null)
          }}
          version={moving}
        />
      )}

      {deleting !== null && (
        <ConfirmActionDialog
          body={
            <>
              <strong>{deleting.name}</strong>
              {m.groupDialog.deleteBody}
            </>
          }
          cancelLabel={m.groupDialog.cancel}
          confirmLabel={m.groupDialog.deleteConfirm}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await operations.deleteGroup(deleting)
            setDeleting(null)
          }}
          pendingLabel={m.groupDialog.pending}
          title={m.groupDialog.deleteTitle(deleting.name)}
          toFailureMessage={() => m.groupDialog.failed}
        />
      )}
    </section>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" className={'tcl-chevron' + (open ? ' is-open' : '')} viewBox="0 0 16 16">
      <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  )
}

/** 버전을 넣을 묶음을 고른다. "묶음 없음" 을 고르면 묶음에서 뺀다. */
function GroupMoveDialog({
  groups,
  onClose,
  onSubmit,
  version,
}: {
  groups: readonly VersionGroup[]
  onClose: () => void
  onSubmit: (groupId: string | null) => Promise<void>
  version: TestCaseVersionSummary
}) {
  const { t } = useI18n()
  const m = t.testCases.versions.groupDialog
  const titleId = useId()
  const [groupId, setGroupId] = useState<string>(version.groupId ?? groups[0]?.id ?? '')
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  return (
    <Dialog labelledBy={titleId} onClose={onClose} title={m.moveTitle(versionName(version))}>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault()
          setPending(true)
          setFailure(null)
          onSubmit(groupId.length > 0 ? groupId : null).catch(() => {
            setFailure(m.failed)
            setPending(false)
          })
        }}
      >
        <div className="field">
          <Picker
            label={m.group}
            onChange={setGroupId}
            options={[{ value: '', label: m.noGroup }, ...groups.map((group) => ({ value: group.id, label: group.name }))]}
            value={groupId}
          />
        </div>
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
          <button
            className="button button--primary"
            disabled={pending || groupId === (version.groupId ?? '')}
            type="submit"
          >
            {pending ? m.pending : m.move}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
