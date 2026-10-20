/**
 * registry 의 공개 API. 이 파일의 hook 들은 ARTEL-1128 이 실제 구현으로 바꾸기 전까지는
 * 아무것도 하지 않는 stub 이다. 다른 작업이 signature 에 맞춰 먼저 코드를 쓸 수 있게 둔다.
 */
import type { ActionBinding, AgentRegistryApi, FieldBinding, PageId } from './types'

export type * from './types'

const EMPTY_API: AgentRegistryApi = {
  snapshot: () => ({ page: null, params: {}, fields: {}, actions: [] }),
  waitForPage: async () => false,
  setField: async () => ({ status: 'unavailable' }),
  callAction: async () => ({ status: 'unavailable' }),
  pendingApproval: () => null,
  subscribe: () => () => {},
}

/** 페이지가 자기 id 와 URL params 를 알린다. */
export function useAgentPage(page: PageId, params: Record<string, string> = {}): void {
  void page
  void params
}

export function useAgentAction(binding: ActionBinding): void {
  void binding
}

export function useAgentField(binding: FieldBinding): void {
  void binding
}

export function useAgentRegistry(): AgentRegistryApi {
  return EMPTY_API
}
