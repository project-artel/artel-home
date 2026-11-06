import type { FolderCommand, HistoryContext } from './folderHistory'
import { collectDescendantIds } from './testCaseFolders'
import {
  addFolderItems,
  cloneTestCaseFolder,
  createTestCaseFolder,
  deleteTestCaseFolder,
  listFolderItems,
  moveFolderItems,
  removeFolderItems,
  reorderFolderItems,
  setFolderItemsHidden,
  updateTestCaseFolder,
  type FolderItem,
  type TestCaseFolder,
} from './testCaseFolderApi'

/*
 * Undo 할 수 있는 폴더 작업(ARTEL-1024). 작업 하나가 요청과 그 되돌리는 요청을 함께 든다 — 기록은
 * `folderHistory.ts` 가 맡는다.
 *
 * 폴더 id 는 모두 처음 기록된 값으로 들고 실행할 때마다 `resolve` 한다. Undo 로 지웠다가 Redo 로 다시 만든
 * 폴더는 새 id 이기 때문이다.
 */

/** 서버가 돌려준 폴더를 화면에 알린다. 만들기 · 복제의 Redo 도 부른다. */
type OnFolder = (folder: TestCaseFolder) => void

/** 새 폴더. [onCreated] 는 처음 만들 때만 부른다(화면이 그 폴더를 고른다). */
export function createFolderCommand(
  projectId: string,
  input: { name: string; parentId: string | null },
  label: string,
  onCreated: OnFolder,
): FolderCommand {
  let originalId: string | null = null
  const make = async (context: HistoryContext) => {
    const parentId = input.parentId === null ? null : context.resolve(input.parentId)
    const created = await createTestCaseFolder(projectId, { name: input.name, parentId })
    if (originalId === null) {
      originalId = created.id
      onCreated(created)
    } else {
      context.alias(originalId, created.id)
    }
  }
  return {
    label,
    run: make,
    undo: async (context) => deleteTestCaseFolder(projectId, context.resolve(originalId as string)),
  }
}

/** 이름 바꾸기와 부모 옮기기. 서버는 한 요청으로 둘을 받는다. */
export function updateFolderCommand(
  projectId: string,
  folder: TestCaseFolder,
  next: { name: string; parentId: string | null },
  label: string,
): FolderCommand {
  const write = (target: { name: string; parentId: string | null }) => async (context: HistoryContext) => {
    await updateTestCaseFolder(projectId, context.resolve(folder.id), {
      name: target.name,
      parentId: target.parentId === null ? null : context.resolve(target.parentId),
    })
  }
  return {
    label,
    run: write(next),
    undo: write({ name: folder.name, parentId: folder.parentId }),
  }
}

/** 복제. Undo 는 복제본을 지운다. [onCloned] 는 처음 복제할 때만 부른다. */
export function cloneFolderCommand(
  projectId: string,
  folderId: string,
  label: string,
  onCloned: OnFolder,
): FolderCommand {
  let cloneId: string | null = null
  return {
    label,
    run: async (context) => {
      const clone = await cloneTestCaseFolder(projectId, context.resolve(folderId))
      if (cloneId === null) {
        cloneId = clone.id
        onCloned(clone)
      } else {
        context.alias(cloneId, clone.id)
      }
    },
    undo: async (context) => deleteTestCaseFolder(projectId, context.resolve(cloneId as string)),
  }
}

/** 지운 폴더를 되살릴 때 쓰는 사본. 부모가 앞에 오는 순서다. */
type FolderSnapshot = {
  folderId: string
  parentId: string | null
  name: string
  items: { caseId: string; hiddenGameBuildIds: string[] }[]
}

/**
 * 폴더 지우기. 지우기 전에 하위 폴더와 항목(순서 · 숨긴 버전)을 읽어 두고, Undo 는 그것을 같은 부모 아래에
 * 다시 만든다. 다시 만든 폴더는 새 id 라 옛 id 의 별칭으로 적는다.
 */
export function deleteFolderCommand(
  projectId: string,
  folder: TestCaseFolder,
  folders: readonly TestCaseFolder[],
  label: string,
): FolderCommand {
  let snapshot: FolderSnapshot[] = []
  const takeSnapshot = async (context: HistoryContext) => {
    const subtree = orderParentsFirst(folder, folders)
    snapshot = await Promise.all(
      subtree.map(async (one) => {
        const list = await listFolderItems(projectId, context.resolve(one.id), null)
        return {
          folderId: one.id,
          parentId: one.parentId,
          name: one.name,
          items: list.items.map((item) => ({ caseId: item.testCase.id, hiddenGameBuildIds: item.hiddenGameBuildIds })),
        }
      }),
    )
  }
  const remove = async (context: HistoryContext) => deleteTestCaseFolder(projectId, context.resolve(folder.id))
  return {
    label,
    run: async (context) => {
      await takeSnapshot(context)
      await remove(context)
    },
    undo: async (context) => {
      for (const one of snapshot) {
        const parentId = one.parentId === null ? null : context.resolve(one.parentId)
        const created = await createTestCaseFolder(projectId, { name: one.name, parentId })
        context.alias(one.folderId, created.id)
        const caseIds = one.items.map((item) => item.caseId)
        if (caseIds.length > 0) await addFolderItems(projectId, created.id, caseIds)
        await restoreHidden(projectId, created.id, one.items)
      }
    },
    redo: remove,
  }
}

/** [folder] 와 하위 폴더를 부모가 먼저 오게. */
function orderParentsFirst(folder: TestCaseFolder, folders: readonly TestCaseFolder[]): TestCaseFolder[] {
  const inside = collectDescendantIds(folders, folder.id)
  const ordered: TestCaseFolder[] = [folder]
  const placed = new Set([folder.id])
  let pending = folders.filter((one) => inside.has(one.id))
  while (pending.length > 0) {
    const ready = pending.filter((one) => one.parentId !== null && placed.has(one.parentId))
    if (ready.length === 0) break
    for (const one of ready) {
      ordered.push(one)
      placed.add(one.id)
    }
    pending = pending.filter((one) => !placed.has(one.id))
  }
  return ordered
}

/** 숨긴 버전을 버전마다 한 요청으로 되돌린다. */
async function restoreHidden(
  projectId: string,
  folderId: string,
  items: readonly { caseId: string; hiddenGameBuildIds: readonly string[] }[],
) {
  const byBuild = new Map<string, string[]>()
  for (const item of items) {
    for (const buildId of item.hiddenGameBuildIds) byBuild.set(buildId, [...(byBuild.get(buildId) ?? []), item.caseId])
  }
  for (const [buildId, caseIds] of byBuild) await setFolderItemsHidden(projectId, folderId, caseIds, buildId, true)
}

/** 케이스를 폴더에 담는다. Undo 는 이번에 새로 담긴 것만 뺀다. */
export function addItemsCommand(projectId: string, folderId: string, caseIds: readonly string[], label: string): FolderCommand {
  let added: string[] = []
  return {
    label,
    run: async (context) => {
      added = (await addFolderItems(projectId, context.resolve(folderId), caseIds)).caseIds
    },
    undo: async (context) => {
      if (added.length > 0) await removeFolderItems(projectId, context.resolve(folderId), added)
    },
  }
}

/**
 * 폴더에서 뺀다. [before] 는 빼기 전 그 폴더의 항목 전부(숨긴 것 포함)다 — Undo 가 순서와 숨김까지 되돌린다.
 */
export function removeItemsCommand(
  projectId: string,
  folderId: string,
  caseIds: readonly string[],
  before: readonly FolderItem[],
  label: string,
): FolderCommand {
  let removed: string[] = []
  return {
    label,
    run: async (context) => {
      removed = (await removeFolderItems(projectId, context.resolve(folderId), caseIds)).caseIds
    },
    undo: async (context) => {
      if (removed.length === 0) return
      const target = context.resolve(folderId)
      await addFolderItems(projectId, target, removed)
      await restoreHidden(projectId, target, snapshotOf(before, removed))
      await restoreOrder(projectId, target, before)
    },
  }
}

/**
 * 다른 폴더로 옮긴다. 대상에 이미 있던 케이스는 서버가 이쪽 항목만 지운다(`droppedCaseIds`). Undo 는 옮긴 것을
 * 되가져오고, 지운 것을 다시 담고, 원래 순서로 돌린다.
 */
export function moveItemsCommand(
  projectId: string,
  fromFolderId: string,
  toFolderId: string,
  caseIds: readonly string[],
  before: readonly FolderItem[],
  label: string,
): FolderCommand {
  let moved: string[] = []
  let dropped: string[] = []
  return {
    label,
    run: async (context) => {
      const change = await moveFolderItems(projectId, context.resolve(fromFolderId), caseIds, context.resolve(toFolderId))
      moved = change.caseIds
      dropped = change.droppedCaseIds
    },
    undo: async (context) => {
      const from = context.resolve(fromFolderId)
      if (moved.length > 0) await moveFolderItems(projectId, context.resolve(toFolderId), moved, from)
      if (dropped.length > 0) {
        await addFolderItems(projectId, from, dropped)
        await restoreHidden(projectId, from, snapshotOf(before, dropped))
      }
      if (moved.length + dropped.length > 0) {
        await restoreOrder(projectId, from, before)
      }
    },
  }
}

/** 이 폴더에서 [gameBuildId] 버전에 숨기거나 다시 보인다. Undo 는 실제로 바뀐 것만 되돌린다. */
export function setHiddenCommand(
  projectId: string,
  folderId: string,
  caseIds: readonly string[],
  gameBuildId: string,
  hidden: boolean,
  label: string,
): FolderCommand {
  let changed: string[] = []
  return {
    label,
    run: async (context) => {
      changed = (await setFolderItemsHidden(projectId, context.resolve(folderId), caseIds, gameBuildId, hidden)).caseIds
    },
    undo: async (context) => {
      if (changed.length > 0) await setFolderItemsHidden(projectId, context.resolve(folderId), changed, gameBuildId, !hidden)
    },
  }
}

/**
 * 원래 순서로 돌린다. 그사이 다른 사람이 폴더를 고쳐 항목이 달라졌으면 서버가 400 을 낸다. 그때는 순서만
 * 포기한다 — 케이스는 이미 돌아왔고, 순서 때문에 Undo 전체를 실패로 남기면 기록이 그 자리에 걸린다.
 */
async function restoreOrder(projectId: string, folderId: string, before: readonly FolderItem[]) {
  try {
    await reorderFolderItems(projectId, folderId, before.map((item) => item.testCase.id))
  } catch {
    // 순서만 포기한다.
  }
}

function snapshotOf(before: readonly FolderItem[], caseIds: readonly string[]) {
  const wanted = new Set(caseIds)
  return before
    .filter((item) => wanted.has(item.testCase.id))
    .map((item) => ({ caseId: item.testCase.id, hiddenGameBuildIds: item.hiddenGameBuildIds }))
}
