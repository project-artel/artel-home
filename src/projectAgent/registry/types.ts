/**
 * project agent 가 페이지를 조작하는 interface. 계약은 workspace 저장소
 * `.plan/general/2026-10-20-project-agent-wire-contract.md` 4절이다.
 *
 * 페이지 id 는 URL 에서 읽는다. 페이지는 `useAgentAction` 과 `useAgentField` 로
 * 버튼과 폼 칸을 등록한다. 등록은 mount 할 때 생기고 unmount 할 때 풀리므로, registry 에는
 * 늘 지금 열린 페이지의 것만 있다.
 */

export type PageId =
  | 'home'
  | 'documents'
  | 'testCases'
  | 'testRuns'
  | 'qa'
  | 'qaHistory'
  | 'contentMap'
  | 'macros'
  | 'performance'
  | 'issues'
  | 'knowledge'
  | 'usage'
  | 'qaRun'
  | 'testRun'
  | 'testRunEdit'
  | 'members'
  | 'settings'
  | 'setup'

export type ActionRisk = 'auto' | 'approve'

/** args 검사에 쓰는 JSON Schema 의 작은 부분집합. object 의 properties, required, type, enum 만 본다. */
export type JsonSchema = {
  type?: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array'
  description?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  enum?: (string | number)[]
  items?: JsonSchema
}

/** page catalog 에 실리는 정적 정의. 페이지를 mount 하지 않아도 import 할 수 있다. */
export type ActionSpec = {
  /** `qa.startRun` 처럼 page 이름을 앞에 붙인다. */
  id: string
  page: PageId
  description: string
  args: JsonSchema
  risk: ActionRisk
  /** 강조 표시와 승인 카드에 쓰는 한 줄. */
  summarize: (args: Record<string, unknown>) => string
}

export type FieldSpec = {
  name: string
  page: PageId
  description: string
}

/** 버튼을 가진 component 가 mount 할 때 등록한다. */
export type ActionBinding = {
  spec: ActionSpec
  /** 강조할 element. 그려지지 않았으면 null. */
  target: () => HTMLElement | null
  /** 지금 실행할 수 없는 이유. 버튼의 비활성 안내와 같은 문장을 쓴다. 실행할 수 있으면 null. */
  blocked: () => string | null
  /** 버튼의 onClick 이 부르는 것과 같은 함수. */
  run: (args: Record<string, unknown>) => Promise<unknown>
}

export type FieldOption = { value: unknown; label: string }

export type FieldBinding = {
  spec: FieldSpec
  target: () => HTMLElement | null
  read: () => unknown
  options?: () => FieldOption[]
  /** 폼 칸 자신의 setter. */
  write: (value: unknown) => void
}

export type PageSnapshot = {
  page: PageId | null
  params: Record<string, string>
  fields: Record<string, { value: unknown; options?: FieldOption[] }>
  actions: { id: string; blocked: string | null }[]
}

export type ToolStatus = 'ok' | 'error' | 'rejected' | 'unavailable' | 'cancelled'

export type ActionOutcome =
  | { status: 'ok'; result: unknown }
  | { status: Exclude<ToolStatus, 'ok'>; error?: string }

/**
 * 대화창의 tool executor 가 쓰는 registry API. `useAgentRegistry()` 가 돌려준다.
 */
export type AgentRegistryApi = {
  snapshot: () => PageSnapshot
  /** `page` 의 binding 이 등록될 때까지 기다린다. 시간 안에 안 되면 false. */
  waitForPage: (page: PageId, timeoutMs: number) => Promise<boolean>
  /**
   * 강조 표시 뒤 폼 칸을 쓴다. 없는 칸이면 `unavailable`, `options` 에 없는 값이나 boolean 칸에 온
   * boolean 이 아닌 값이면 `error`. 강조하는 동안 `signal` 이 abort 되면 쓰지 않고 `cancelled`.
   */
  setField: (name: string, value: unknown, signal?: AbortSignal) => Promise<ActionOutcome>
  /**
   * args 를 검사하고, 막혀 있으면 `error`, `auto` 면 강조 뒤 실행, `approve` 면 강조한 채로
   * 승인을 기다렸다가 실행하거나 `rejected` 를 돌려준다. 승인 뒤에는 binding 이 아직 등록되어 있고
   * 막혀 있지 않은지 다시 보고, 아니면 `error`. 승인을 기다리는 사이 binding 이 unmount 되면
   * `rejected` 와 error "the page closed". 강조나 승인 대기 중에 `signal` 이 abort 되면 실행하지 않고
   * `cancelled`.
   */
  callAction: (id: string, args: Record<string, unknown>, signal?: AbortSignal) => Promise<ActionOutcome>
  /** 승인 대기 중인 action. 대화창이 승인 카드를 그릴 때 읽는다. */
  pendingApproval: () => PendingApproval | null
  /** 상태가 바뀔 때마다 부른다. 반환값으로 구독을 끊는다. */
  subscribe: (listener: () => void) => () => void
}

export type PendingApproval = {
  actionId: string
  summary: string
  approve: () => void
  reject: () => void
}
