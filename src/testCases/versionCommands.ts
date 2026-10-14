import type { FolderCommand, HistoryContext } from './folderHistory'
import { deleteTestCaseFolder, type TestCaseFolder } from './testCaseFolderApi'
import {
  assignVersionGroup,
  copyVersionToFolder,
  createVersionGroup,
  deleteVersionGroup,
  renameVersionGroup,
  setVersionHidden,
  type VersionGroup,
} from './testCaseVersions'

/*
 * Undo 할 수 있는 버전 목록 정리(ARTEL-1024): 묶음 만들기 · 이름 바꾸기 · 지우기, 버전을 묶음에 넣기, 숨기기,
 * 폴더로 복제. 폴더 작업과 같은 기록(`folderHistory.ts`)에 쌓인다 — 한 화면의 ⌘Z 가 둘을 가리지 않는다.
 *
 * 다시 만든 묶음은 새 id 다. 폴더 id 와 같은 숫자일 수 있어 별칭 표에는 `g:` 를 붙여 적는다.
 */

const groupKey = (groupId: string) => `g:${groupId}`
const resolveGroup = (context: HistoryContext, groupId: string) => context.resolve(groupKey(groupId)).slice(2)

export function createGroupCommand(
  projectId: string,
  name: string,
  label: string,
  onCreated: (group: VersionGroup) => void,
): FolderCommand {
  let originalId: string | null = null
  return {
    label,
    run: async (context) => {
      const created = await createVersionGroup(projectId, name)
      if (originalId === null) {
        originalId = created.id
        onCreated(created)
      } else {
        context.alias(groupKey(originalId), groupKey(created.id))
      }
    },
    undo: async (context) => deleteVersionGroup(projectId, resolveGroup(context, originalId as string)),
  }
}

export function renameGroupCommand(projectId: string, group: VersionGroup, name: string, label: string): FolderCommand {
  return {
    label,
    run: async (context) => void (await renameVersionGroup(projectId, resolveGroup(context, group.id), name)),
    undo: async (context) => void (await renameVersionGroup(projectId, resolveGroup(context, group.id), group.name)),
  }
}

/** 묶음 지우기. Undo 는 같은 이름으로 다시 만들고 안에 있던 버전을 도로 넣는다. */
export function deleteGroupCommand(
  projectId: string,
  group: VersionGroup,
  memberBuildIds: readonly string[],
  label: string,
): FolderCommand {
  return {
    label,
    run: async (context) => deleteVersionGroup(projectId, resolveGroup(context, group.id)),
    undo: async (context) => {
      const created = await createVersionGroup(projectId, group.name)
      context.alias(groupKey(group.id), groupKey(created.id))
      for (const buildId of memberBuildIds) await assignVersionGroup(projectId, buildId, created.id)
    },
  }
}

/** 버전을 [toGroupId] 묶음에 넣는다(null 이면 묶음에서 뺀다). Undo 는 [fromGroupId] 로 돌린다. */
export function assignGroupCommand(
  projectId: string,
  gameBuildId: string,
  fromGroupId: string | null,
  toGroupId: string | null,
  label: string,
): FolderCommand {
  const assign = (groupId: string | null) => async (context: HistoryContext) =>
    assignVersionGroup(projectId, gameBuildId, groupId === null ? null : resolveGroup(context, groupId))
  return { label, run: assign(toGroupId), undo: assign(fromGroupId) }
}

export function hideVersionCommand(projectId: string, gameBuildId: string, hidden: boolean, label: string): FolderCommand {
  return {
    label,
    run: async () => setVersionHidden(projectId, gameBuildId, hidden),
    undo: async () => setVersionHidden(projectId, gameBuildId, !hidden),
  }
}

/** 버전의 케이스를 담은 폴더를 만든다. Undo 는 그 폴더를 지운다. [onCopied] 는 처음에만 부른다. */
export function copyVersionCommand(
  projectId: string,
  gameBuildId: string,
  label: string,
  onCopied: (folder: TestCaseFolder) => void,
): FolderCommand {
  let folderId: string | null = null
  return {
    label,
    run: async (context) => {
      const folder = await copyVersionToFolder(projectId, gameBuildId)
      if (folderId === null) {
        folderId = folder.id
        onCopied(folder)
      } else {
        context.alias(folderId, folder.id)
      }
    },
    undo: async (context) => deleteTestCaseFolder(projectId, context.resolve(folderId as string)),
  }
}
