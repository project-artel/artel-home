/*
 * 폴더 tree 로 끌어 놓기(ARTEL-1024). 끄는 것은 둘이다 — 표의 케이스 줄과 tree 의 폴더.
 *
 * `dataTransfer` 는 놓을 때(`drop`)만 값을 읽을 수 있고, 끄는 동안(`dragover`)은 형식만 보인다. 그래서 무엇을
 * 끄는지는 형식으로 가르고, 값은 놓을 때 읽는다.
 */

export const CASES_TYPE = 'application/x-artel-test-cases'
export const FOLDER_TYPE = 'application/x-artel-test-case-folder'

export type DragPayload =
  | { kind: 'cases'; caseIds: string[] }
  | { kind: 'folder'; folderId: string }

export function writeCasesDrag(transfer: DataTransfer, caseIds: readonly string[]) {
  transfer.setData(CASES_TYPE, JSON.stringify(caseIds))
  // 다른 곳에 놓으면 글자로 보인다. 브라우저가 끌기 그림을 만들 때도 이 값이 있어야 한다.
  transfer.setData('text/plain', caseIds.join(','))
  transfer.effectAllowed = 'copyMove'
}

/**
 * 지금 끄는 폴더. `dragover` 에서는 값을 못 읽으므로, 자기 자신이나 하위 폴더 위에서 놓을 자리 표시를 켜지
 * 않으려고 끌기를 시작할 때 따로 적어 둔다. 끌기가 끝나면 지운다.
 */
let draggingFolderId: string | null = null

export function currentFolderDrag(): string | null {
  return draggingFolderId
}

export function endFolderDrag() {
  draggingFolderId = null
}

export function writeFolderDrag(transfer: DataTransfer, folderId: string) {
  draggingFolderId = folderId
  transfer.setData(FOLDER_TYPE, folderId)
  transfer.setData('text/plain', folderId)
  transfer.effectAllowed = 'move'
}

/** 끄는 동안 형식만 보고 무엇인지 안다. 우리 것이 아니면 null. */
export function dragKind(types: readonly string[]): DragPayload['kind'] | null {
  if (types.includes(FOLDER_TYPE)) return 'folder'
  if (types.includes(CASES_TYPE)) return 'cases'
  return null
}

export function readDrag(transfer: Pick<DataTransfer, 'getData' | 'types'>): DragPayload | null {
  const kind = dragKind([...transfer.types])
  if (kind === 'folder') {
    const folderId = transfer.getData(FOLDER_TYPE)
    return folderId.length > 0 ? { kind, folderId } : null
  }
  if (kind === 'cases') {
    try {
      const parsed: unknown = JSON.parse(transfer.getData(CASES_TYPE))
      const caseIds = Array.isArray(parsed) ? parsed.filter((one): one is string => typeof one === 'string') : []
      return caseIds.length > 0 ? { kind, caseIds } : null
    } catch {
      return null
    }
  }
  return null
}
