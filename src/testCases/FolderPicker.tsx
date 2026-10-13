import type { FolderRow } from './testCaseFolders'

/**
 * 폴더를 하나 고르는 select. 폴더를 만들 때와 옮길 때의 부모 고르기, test case 를 옮길 때의
 * 대상 고르기가 같은 모양이라 한 벌만 둔다.
 *
 * 깊이는 줄 앞의 공백으로 보인다. `noneLabel` 이 있으면 맨 위에 "폴더 없음"(또는 최상위)
 * 항목이 생기고 그 값은 `null` 이다.
 */
export function FolderPicker({
  id,
  noneLabel,
  onChange,
  rows,
  value,
}: {
  id: string
  noneLabel?: string
  onChange: (folderId: string | null) => void
  rows: readonly FolderRow[]
  value: string | null
}) {
  return (
    <select
      className="field-input"
      id={id}
      onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
      value={value ?? ''}
    >
      {noneLabel !== undefined && <option value="">{noneLabel}</option>}
      {rows.map((row) => (
        <option key={row.folder.id} value={row.folder.id}>
          {indentFolderName(row)}
        </option>
      ))}
    </select>
  )
}

/**
 * 깊이만큼 들여 쓴 이름. `<option>` 안에서 앞쪽의 일반 공백은 접히므로 no-break space 와 `└` 를
 * 쓴다. 들여쓰기가 눈에 안 보이면 같은 이름의 폴더를 구별할 수 없다.
 */
function indentFolderName(row: FolderRow): string {
  return row.depth === 0
    ? row.folder.name
    : '\u00A0\u00A0'.repeat(row.depth) + '└ ' + row.folder.name
}
