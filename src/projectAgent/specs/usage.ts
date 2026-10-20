import type { ActionSpec, FieldSpec } from '../registry/types'

/*
 * 사용량 페이지. 기간을 고르는 칸이 없고, 숫자는 화면이 스스로 다시 읽는다(polling). agent 는 이 페이지를
 * 열어 읽거나 `query usage` 로 조회하면 되고, 누를 버튼이 없다.
 */

export const USAGE_FIELDS: FieldSpec[] = []
export const USAGE_ACTIONS: ActionSpec[] = []
