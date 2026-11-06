import { ProjectApiError } from '../projects/projectApi'
import type { FolderCommand, HistoryContext } from '../testCases/folderHistory'
import type { TestCaseFolder } from '../testCases/testCaseFolderApi'
import { listProjectIssues } from './issueApi'
import {
  addIssuesToFolder,
  cloneIssueFolder,
  createIssueFolder,
  deleteIssueFolder,
  removeIssuesFromFolder,
  updateIssueFolder,
} from './issueFolderApi'

/*
 * 이슈 folder 작업의 Undo/Redo(ARTEL-1114). 케이스 라이브러리의 `folderCommands` 와 같은 모양이다 — 작업마다
 * "되돌리는 요청" 을 함께 기억하고, 다시 만들어진 folder 의 새 id 는 [HistoryContext.alias] 로 이어 둔다.
 */

type OnFolder = (folder: TestCaseFolder) => void

export function createIssueFolderCommand(
  projectId: string,
  input: { name: string; parentId: string | null },
  label: string,
  onCreated: OnFolder,
): FolderCommand {
  let originalId: string | null = null
  return {
    label,
    run: async (context) => {
      const parentId = input.parentId === null ? null : context.resolve(input.parentId)
      const created = await createIssueFolder(projectId, { name: input.name, parentId })
      if (originalId === null) {
        originalId = created.id
        onCreated(created)
      } else {
        context.alias(originalId, created.id)
      }
    },
    undo: async (context) => deleteIssueFolder(projectId, context.resolve(originalId as string)),
  }
}

export function updateIssueFolderCommand(
  projectId: string,
  folder: TestCaseFolder,
  next: { name: string; parentId: string | null },
  label: string,
): FolderCommand {
  const write = (target: { name: string; parentId: string | null }) => async (context: HistoryContext) => {
    await updateIssueFolder(projectId, context.resolve(folder.id), {
      name: target.name,
      parentId: target.parentId === null ? null : context.resolve(target.parentId),
    })
  }
  return { label, run: write(next), undo: write({ name: folder.name, parentId: folder.parentId }) }
}

export function cloneIssueFolderCommand(projectId: string, folder: TestCaseFolder, label: string, onCloned: OnFolder): FolderCommand {
  let cloneId: string | null = null
  return {
    label,
    run: async (context) => {
      const clone = await cloneIssueFolder(projectId, context.resolve(folder.id))
      if (cloneId === null) {
        cloneId = clone.id
        onCloned(clone)
      } else {
        context.alias(cloneId, clone.id)
      }
    },
    undo: async (context) => deleteIssueFolder(projectId, context.resolve(cloneId as string)),
  }
}

/** folder 하나에 담긴 이슈 id 전부. 지우기를 되돌리려면 지우기 전에 담긴 것을 기억해야 한다. */
async function issueIdsIn(projectId: string, folderId: string): Promise<string[]> {
  const ids: string[] = []
  let beforeId: string | undefined
  for (;;) {
    const page = await listProjectIssues(projectId, { folderId }, beforeId)
    ids.push(...page.items.map((issue) => issue.id))
    if (!page.hasMore || page.nextBeforeId === null) return ids
    beforeId = page.nextBeforeId
  }
}

/**
 * 지우기. 하위 folder 와 항목은 서버에서 함께 지워지므로, 지우기 전에 그 트리와 담긴 이슈를 적어 두고 Undo 때
 * 같은 이름 · 같은 자리로 다시 만들어 담는다. 다시 만든 folder 는 새 id 를 받는다.
 */
export function deleteIssueFolderCommand(
  projectId: string,
  folder: TestCaseFolder,
  allFolders: readonly TestCaseFolder[],
  label: string,
): FolderCommand {
  type Snapshot = { folder: TestCaseFolder; issueIds: string[] }
  let snapshot: Snapshot[] | null = null
  const subtree = (rootId: string): TestCaseFolder[] => {
    const children = allFolders.filter((candidate) => candidate.parentId === rootId)
    return children.flatMap((child) => [child, ...subtree(child.id)])
  }
  return {
    label,
    run: async (context) => {
      if (snapshot === null) {
        const tree = [folder, ...subtree(folder.id)]
        snapshot = await Promise.all(
          tree.map(async (one) => ({ folder: one, issueIds: await issueIdsIn(projectId, context.resolve(one.id)) })),
        )
      }
      await deleteIssueFolder(projectId, context.resolve(folder.id))
    },
    undo: async (context) => {
      // 부모부터 다시 만든다 — 스냅샷은 부모가 먼저 오는 순서다.
      for (const { folder: one, issueIds } of snapshot ?? []) {
        const parentId = one.parentId === null ? null : context.resolve(one.parentId)
        const created = await createIssueFolder(projectId, { name: one.name, parentId })
        context.alias(one.id, created.id)
        if (issueIds.length > 0) await addIssuesToFolder(projectId, created.id, issueIds)
      }
    },
  }
}

export function addIssuesCommand(projectId: string, folderId: string, issueIds: readonly string[], label: string): FolderCommand {
  return {
    label,
    run: async (context) => void (await addIssuesToFolder(projectId, context.resolve(folderId), issueIds)),
    undo: async (context) => void (await removeIssuesFromFolder(projectId, context.resolve(folderId), issueIds)),
  }
}

export function removeIssuesCommand(projectId: string, folderId: string, issueIds: readonly string[], label: string): FolderCommand {
  return {
    label,
    run: async (context) => void (await removeIssuesFromFolder(projectId, context.resolve(folderId), issueIds)),
    undo: async (context) => void (await addIssuesToFolder(projectId, context.resolve(folderId), issueIds)),
  }
}

/** 한 버전에서 나온 이슈 id 전부. */
async function issueIdsOfBuild(projectId: string, gameBuildId: string): Promise<string[]> {
  const ids: string[] = []
  let beforeId: string | undefined
  for (;;) {
    const page = await listProjectIssues(projectId, { gameBuildId }, beforeId)
    ids.push(...page.items.map((issue) => issue.id))
    if (!page.hasMore || page.nextBeforeId === null) return ids
    beforeId = page.nextBeforeId
  }
}

/**
 * 버전의 이슈를 담은 새 folder(케이스 라이브러리의 "새 폴더로 복제" 와 같은 메뉴). 이름이 겹치면 ` (2)` … 를
 * 붙인다. Undo 는 그 folder 를 지운다.
 */
export function copyIssueVersionCommand(
  projectId: string,
  gameBuildId: string,
  baseName: string,
  label: string,
  onCopied: OnFolder,
): FolderCommand {
  let folderId: string | null = null
  return {
    label,
    run: async (context) => {
      let created: TestCaseFolder | null = null
      for (let attempt = 1; created === null; attempt++) {
        try {
          created = await createIssueFolder(projectId, { name: attempt === 1 ? baseName : `${baseName} (${attempt})`, parentId: null })
        } catch (error) {
          if (attempt >= 20 || !(error instanceof ProjectApiError && error.status === 409)) throw error
        }
      }
      const issueIds = await issueIdsOfBuild(projectId, gameBuildId)
      const filled = issueIds.length > 0 ? await addIssuesToFolder(projectId, created.id, issueIds) : created
      if (folderId === null) {
        folderId = filled.id
        onCopied(filled)
      } else {
        context.alias(folderId, filled.id)
      }
    },
    undo: async (context) => deleteIssueFolder(projectId, context.resolve(folderId as string)),
  }
}
