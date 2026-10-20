import type { ActionSpec, FieldSpec } from '../registry/types'

/*
 * 사용량 페이지. 기간을 고르는 칸은 이 화면에 없다(창은 고정이다). 다시 읽는 버튼 하나뿐이다.
 */

export const USAGE_REFRESH_ACTION: ActionSpec = {
  id: 'usage.refresh',
  page: 'usage',
  risk: 'auto',
  description:
    'Reload the project spend figures from the server, as the Refresh button does. The numbers trail the real calls by up to a flush interval, so refreshing twice in a row changes nothing. Returns {reloading: true} at once.',
  args: { type: 'object', properties: {} },
  summarize: () => 'Refresh the spend figures',
}

export const USAGE_FIELDS: FieldSpec[] = []
export const USAGE_ACTIONS: ActionSpec[] = [USAGE_REFRESH_ACTION]
