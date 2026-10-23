import type { FieldOption } from '../registry/types'

/*
 * 목록 페이지가 agent 에게 보이는 id 목록(read-only "listed" field)을 만드는 공통 부분. action 이 id 를 받는 페이지는
 * 화면에 보이는 항목의 id 를 snapshot 에 실어야 agent 가 id 를 짐작하지 않는다.
 */

/** 한 field 의 options 에 싣는 항목 수의 상한. 넘으면 앞에서부터 이만큼만 싣는다. */
export const LISTED_OPTION_LIMIT = 200

/** 앞에서 [LISTED_OPTION_LIMIT] 개까지만 option 으로 만든다. 전체 수는 field 의 값(`items.length`)으로 알린다. */
export function listedOptions<T>(items: readonly T[], toOption: (item: T) => FieldOption): FieldOption[] {
  return items.slice(0, LISTED_OPTION_LIMIT).map(toOption)
}

/** read-only list field 의 description. 모델이 읽는다. */
export function listedFieldDescription(what: string, extra = ''): string {
  return (
    `Read-only list of ${what}; values are ids, labels are what the screen shows. ` +
    `The field's value is the total number listed. Options hold at most ${LISTED_OPTION_LIMIT} entries, so when the value is larger than the options the list is truncated: narrow it with the page's filters. ` +
    `It cannot be written.${extra.length > 0 ? ` ${extra}` : ''}`
  )
}

/** read-only list field 의 write. */
export function readOnlyListWrite(field: string, hint: string): () => never {
  return () => {
    throw new Error(`${field} is read-only: ${hint}`)
  }
}
