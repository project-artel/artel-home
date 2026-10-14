import { Picker } from './Picker'
import type { FolderRow } from './testCaseFolders'

/** `null`(폴더 없음 · 최상위)을 Picker 의 값으로 적을 때 쓴다. 폴더 id 는 숫자라 겹치지 않는다. */
const NONE = ''

/**
 * 폴더를 하나 고르는 상자. 폴더를 만들 때와 옮길 때의 부모 고르기, test case 를 옮길 때의
 * 대상 고르기가 같은 모양이라 한 벌만 둔다. 브라우저 기본 `<select>` 대신 라이브러리의 [Picker] 를 쓴다.
 *
 * 깊이는 줄 앞의 공백으로 보인다. `noneLabel` 이 있으면 맨 위에 "폴더 없음"(또는 최상위)
 * 항목이 생기고 그 값은 `null` 이다.
 */
export function FolderPicker({
  label,
  noneLabel,
  onChange,
  rows,
  value,
}: {
  label: string
  noneLabel?: string
  onChange: (folderId: string | null) => void
  rows: readonly FolderRow[]
  value: string | null
}) {
  return (
    <Picker
      label={label}
      onChange={(next) => onChange(next === NONE ? null : next)}
      options={[
        ...(noneLabel === undefined ? [] : [{ value: NONE, label: noneLabel }]),
        ...rows.map((row) => ({ value: row.folder.id, label: indentFolderName(row) })),
      ]}
      value={value ?? NONE}
    />
  )
}

/**
 * 깊이만큼 들여 쓴 이름. 앞쪽의 일반 공백은 접히므로 no-break space 와 `└` 를 쓴다. 들여쓰기가 눈에 안 보이면
 * 같은 이름의 폴더를 구별할 수 없다.
 */
function indentFolderName(row: FolderRow): string {
  return row.depth === 0
    ? row.folder.name
    : '  '.repeat(row.depth) + '└ ' + row.folder.name
}
