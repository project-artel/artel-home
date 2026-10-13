import type { TestCaseFolder } from './testCaseFolderApi'
import type { TestCase } from './testCaseTypes'

/*
 * 폴더 tree 를 세우고 test case 를 폴더로 거르는 규칙.
 *
 * 컴포넌트가 아니라 이 파일에 두는 이유는 `testCaseLibrary.ts` 와 같다. 순수 함수라 렌더 없이
 * 테스트되고, tree 의 건수·목록·빈 상태 문구가 모두 같은 판정을 읽는다.
 */

/** 라이브러리가 보여 주는 범위. 주소의 `?folder=` 와 일대일이다. */
export type FolderSelection =
  | { kind: 'all' }
  | { kind: 'none' }
  | { kind: 'folder'; id: string }

export const ALL_FOLDERS: FolderSelection = { kind: 'all' }
export const NO_FOLDER: FolderSelection = { kind: 'none' }

/** `?folder=` 의 값 `none` 은 폴더 없음을 뜻한다. 폴더 id 는 숫자 문자열이라 겹치지 않는다. */
const NO_FOLDER_PARAM = 'none'

export function parseFolderSelection(param: string | null): FolderSelection {
  if (param === null || param.length === 0) return ALL_FOLDERS
  if (param === NO_FOLDER_PARAM) return NO_FOLDER
  return { kind: 'folder', id: param }
}

/** 전체는 `null` 이다 — 주소에 아무것도 싣지 않는다. */
export function toFolderParam(selection: FolderSelection): string | null {
  if (selection.kind === 'all') return null
  return selection.kind === 'none' ? NO_FOLDER_PARAM : selection.id
}

/** 없는 폴더(지워졌거나 잘못된 링크)를 가리키는 선택은 전체로 돌린다. */
export function resolveFolderSelection(
  selection: FolderSelection,
  folders: readonly TestCaseFolder[],
): FolderSelection {
  if (selection.kind !== 'folder') return selection
  return folders.some((folder) => folder.id === selection.id) ? selection : ALL_FOLDERS
}

/**
 * 라이브러리가 실제로 거는 범위. 폴더 목록이 `ready` 일 때만 폴더 id 가 있는지 알 수 있으므로,
 * 그때만 없는 id 를 전체로 돌린다. 아직 읽는 중이거나 읽지 못했다면 폴더 id 는 필터로 걸지 않고
 * (`all`), `none` 은 폴더 목록 없이도 판정되므로 그대로 둔다.
 */
export function effectiveFolderSelection(
  requested: FolderSelection,
  folderStatus: 'loading' | 'ready' | 'failed',
  folders: readonly TestCaseFolder[],
): FolderSelection {
  if (folderStatus === 'ready') return resolveFolderSelection(requested, folders)
  return requested.kind === 'none' ? requested : ALL_FOLDERS
}

export type FolderNode = {
  folder: TestCaseFolder
  children: FolderNode[]
}

function compareNames(left: TestCaseFolder, right: TestCaseFolder): number {
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
}

/**
 * 평면 목록을 이름순 중첩 tree 로.
 *
 * 부모가 목록에 없는 폴더(고아)는 최상위로 올린다. 서버 정합성이 어긋났을 때 그 폴더와 안의
 * test case 가 화면에서 사라지는 것보다 최상위에 보이는 편이 낫다. 자기 조상이 되는 순환은
 * 어느 루트에서도 닿지 않으므로 마찬가지로 최상위로 올려 한 번만 그린다.
 */
export function buildFolderTree(folders: readonly TestCaseFolder[]): FolderNode[] {
  const nodes = new Map<string, FolderNode>()
  for (const folder of folders) nodes.set(folder.id, { folder, children: [] })

  const roots: FolderNode[] = []
  for (const node of nodes.values()) {
    const parent = node.folder.parentId === null ? undefined : nodes.get(node.folder.parentId)
    if (parent === undefined || parent === node || reachesItself(node, nodes)) roots.push(node)
    else parent.children.push(node)
  }

  const sortTree = (level: FolderNode[]) => {
    level.sort((left, right) => compareNames(left.folder, right.folder))
    for (const node of level) sortTree(node.children)
  }
  sortTree(roots)
  return roots
}

/** 부모를 따라 올라가다 자기 자신을 다시 만나면 순환이다. */
function reachesItself(start: FolderNode, nodes: ReadonlyMap<string, FolderNode>): boolean {
  const seen = new Set<string>([start.folder.id])
  let parentId = start.folder.parentId
  while (parentId !== null) {
    if (seen.has(parentId)) return parentId === start.folder.id
    seen.add(parentId)
    parentId = nodes.get(parentId)?.folder.parentId ?? null
  }
  return false
}

export type FolderRow = {
  folder: TestCaseFolder
  /** 최상위가 0. */
  depth: number
}

/** tree 를 위에서 아래로 읽는 순서의 행으로 편다. 깊이 우선이라 하위 폴더가 부모 바로 밑에 온다. */
export function flattenFolderTree(roots: readonly FolderNode[]): FolderRow[] {
  const rows: FolderRow[] = []
  const visit = (node: FolderNode, depth: number) => {
    rows.push({ folder: node.folder, depth })
    for (const child of node.children) visit(child, depth + 1)
  }
  for (const root of roots) visit(root, 0)
  return rows
}

/** 폴더 자신을 뺀 하위 폴더 id 전부. 순환이 있어도 끝난다. */
export function collectDescendantIds(
  folders: readonly TestCaseFolder[],
  folderId: string,
): Set<string> {
  const childIdsByParent = new Map<string, string[]>()
  for (const folder of folders) {
    if (folder.parentId === null) continue
    const siblings = childIdsByParent.get(folder.parentId) ?? []
    siblings.push(folder.id)
    childIdsByParent.set(folder.parentId, siblings)
  }

  const descendants = new Set<string>()
  const pending = [...(childIdsByParent.get(folderId) ?? [])]
  while (pending.length > 0) {
    const current = pending.pop() as string
    if (current === folderId || descendants.has(current)) continue
    descendants.add(current)
    pending.push(...(childIdsByParent.get(current) ?? []))
  }
  return descendants
}

/**
 * 선택한 범위의 test case. 폴더는 자기와 하위 폴더의 test case 를 모두 낸다.
 * 받은 순서를 지킨다 — 정렬은 뒤의 `selectTestCases` 가 한다.
 */
export function filterByFolder(
  cases: readonly TestCase[],
  selection: FolderSelection,
  folders: readonly TestCaseFolder[],
): TestCase[] {
  if (selection.kind === 'all') return [...cases]
  if (selection.kind === 'none') return cases.filter((testCase) => testCase.folderId === null)

  const scope = collectDescendantIds(folders, selection.id)
  scope.add(selection.id)
  return cases.filter((testCase) => testCase.folderId !== null && scope.has(testCase.folderId))
}

export type FolderCounts = {
  total: number
  unfiled: number
  /** 폴더 id -> 그 폴더와 하위 폴더의 test case 수. */
  byFolder: Map<string, number>
}

/** tree 에 붙는 건수. 폴더의 수는 `filterByFolder` 가 낼 목록의 길이와 같다. */
export function countCasesByFolder(
  cases: readonly TestCase[],
  folders: readonly TestCaseFolder[],
): FolderCounts {
  const parentById = new Map(folders.map((folder) => [folder.id, folder.parentId]))
  const counts: FolderCounts = { total: cases.length, unfiled: 0, byFolder: new Map() }

  for (const testCase of cases) {
    if (testCase.folderId === null) {
      counts.unfiled += 1
      continue
    }

    // 자기부터 조상까지 한 번씩 올린다. 순환이 있어도 한 폴더를 두 번 세지 않는다.
    const visited = new Set<string>()
    let current: string | null = testCase.folderId
    while (current !== null && !visited.has(current)) {
      visited.add(current)
      counts.byFolder.set(current, (counts.byFolder.get(current) ?? 0) + 1)
      current = parentById.get(current) ?? null
    }
  }
  return counts
}

/**
 * 폴더를 옮길 때 부모로 고를 수 있는 폴더. 자기와 하위 폴더 밑으로는 옮길 수 없다(서버도 400).
 * 이름순 tree 의 읽는 순서로 낸다.
 */
export function listMoveTargets(
  folders: readonly TestCaseFolder[],
  movingFolderId: string,
): FolderRow[] {
  const blocked = collectDescendantIds(folders, movingFolderId)
  blocked.add(movingFolderId)
  return flattenFolderTree(buildFolderTree(folders)).filter((row) => !blocked.has(row.folder.id))
}

/** 삭제 확인 문구에 적는, 함께 지워질 하위 폴더 수. */
export function countFolderDescendants(
  folders: readonly TestCaseFolder[],
  folderId: string,
): number {
  return collectDescendantIds(folders, folderId).size
}
