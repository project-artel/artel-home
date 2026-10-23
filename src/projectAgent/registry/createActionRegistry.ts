import { catalogEntry } from '../catalog'
import { validateAgainstSchema } from './validateArgs'
import type {
  ActionBinding,
  ActionOutcome,
  AgentRegistryApi,
  FieldBinding,
  PageId,
  PageSnapshot,
  PendingApproval,
} from './types'

/** 강조 표시가 켜진 대상. overlay 가 구독해 그린다. 바뀔 때마다 새 객체가 된다. */
export type HighlightState = {
  target: () => HTMLElement | null
  label: string
  /** `acting` 은 곧 실행한다는 뜻이고, `approval` 은 사용자의 승인을 기다린다는 뜻이다. */
  mode: 'acting' | 'approval'
}

export type ActionRegistry = AgentRegistryApi & {
  registerAction: (binding: ActionBinding) => () => void
  registerField: (binding: FieldBinding) => () => void
  /** URL 에서 읽은 페이지를 알린다. */
  setLocation: (page: PageId | null, params: Record<string, string>) => void
  highlight: () => HighlightState | null
  /** 같은 page 의 binding 이 하나라도 등록되어 있는지. */
  hasBindings: (page: PageId) => boolean
}

export type ActionRegistryOptions = {
  /** 실행 전에 대상을 강조해 두는 시간. 기본 600ms. */
  highlightMilliseconds?: number
  /** catalog 에 field 도 action 도 없는 페이지를 열린 것으로 치기까지 기다리는 시간. 기본 300ms. */
  emptyPageGraceMilliseconds?: number
  /** catalog 에 field 나 action 이 실려 있는지. 테스트가 catalog 를 바꿔 끼울 때 쓴다. */
  pageHasCatalogBindings?: (page: PageId) => boolean
}

const DEFAULT_HIGHLIGHT_MILLISECONDS = 600
const DEFAULT_EMPTY_PAGE_GRACE_MILLISECONDS = 300

function defaultPageHasCatalogBindings(page: PageId): boolean {
  const entry = catalogEntry(page)
  return entry !== undefined && (entry.fields.length > 0 || entry.actions.length > 0)
}

/**
 * 기다리다가 signal 이 abort 되면 바로 끝낸다. abort 로 끝났으면 false 를 돌려준다.
 */
function delayUnlessAborted(milliseconds: number, signal: AbortSignal | undefined): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false)
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer)
      resolve(false)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve(true)
    }, milliseconds)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

const CANCELLED: ActionOutcome = { status: 'cancelled' }
const PAGE_CLOSED_ERROR = 'the page closed'

/** 승인 카드 하나가 끝난 방식. `closed` 는 승인을 기다리던 binding 이 unmount 된 경우다. */
type ApprovalResult = 'approved' | 'rejected' | 'cancelled' | 'closed'

type PendingRequest = {
  binding: ActionBinding
  approval: PendingApproval
  settle: (result: ApprovalResult) => void
}

/**
 * field 의 `options` 나 지금 값의 type 에 맞지 않는 값이면 이유를, 맞으면 null 을 돌려준다.
 * options 는 select 의 value 처럼 문자열과 숫자가 섞여 오므로 문자열로 바꿔 비교한다.
 * options 가 빈 배열이면 지금은 값을 나열하지 않는 칸(예: token 수를 받는 칸)이므로 검사를 page 의
 * `write` 에 맡긴다.
 */
function fieldValueError(binding: FieldBinding, value: unknown): string | null {
  const allowedValues = binding.options?.().map((option) => option.value) ?? []
  if (allowedValues.length > 0) {
    if (!allowedValues.some((allowed) => String(allowed) === String(value))) {
      const listed = allowedValues.map((allowed) => JSON.stringify(allowed)).join(', ')
      return `${binding.spec.name} must be one of ${listed}`
    }
  }
  if (typeof binding.read() === 'boolean' && typeof value !== 'boolean') {
    return `${binding.spec.name} must be a boolean`
  }
  return null
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function previewValue(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  const shown = text ?? String(value)
  return shown.length > 40 ? `${shown.slice(0, 37)}...` : shown
}

export function createActionRegistry(options: ActionRegistryOptions = {}): ActionRegistry {
  const highlightMilliseconds = options.highlightMilliseconds ?? DEFAULT_HIGHLIGHT_MILLISECONDS
  const graceMilliseconds = options.emptyPageGraceMilliseconds ?? DEFAULT_EMPTY_PAGE_GRACE_MILLISECONDS
  const pageHasCatalogBindings = options.pageHasCatalogBindings ?? defaultPageHasCatalogBindings

  const actions = new Map<string, ActionBinding>()
  const fields = new Map<string, FieldBinding>()
  const listeners = new Set<() => void>()
  let page: PageId | null = null
  let params: Record<string, string> = {}
  let highlighted: HighlightState | null = null
  let pending: PendingRequest | null = null

  function notify() {
    for (const listener of [...listeners]) listener()
  }

  function hasBindings(target: PageId): boolean {
    for (const binding of actions.values()) if (binding.spec.page === target) return true
    for (const binding of fields.values()) if (binding.spec.page === target) return true
    return false
  }

  function setHighlight(next: HighlightState | null) {
    highlighted = next
    notify()
  }

  /** 강조한 채로 기다린다. 기다리는 사이 abort 되면 강조를 지우고 false 를 돌려준다. */
  async function highlightThenWait(
    target: () => HTMLElement | null,
    label: string,
    signal: AbortSignal | undefined,
  ): Promise<boolean> {
    setHighlight({ target, label, mode: 'acting' })
    const waited = await delayUnlessAborted(highlightMilliseconds, signal)
    if (!waited) setHighlight(null)
    return waited
  }

  async function runBinding(binding: ActionBinding, args: Record<string, unknown>): Promise<ActionOutcome> {
    try {
      return { status: 'ok', result: await binding.run(args) }
    } catch (error) {
      return { status: 'error', error: describeError(error) }
    }
  }

  function summarize(binding: ActionBinding, args: Record<string, unknown>): string {
    try {
      return binding.spec.summarize(args)
    } catch {
      return binding.spec.id
    }
  }

  function askApproval(
    binding: ActionBinding,
    summary: string,
    signal: AbortSignal | undefined,
  ): Promise<ApprovalResult> {
    if (signal?.aborted) return Promise.resolve('cancelled')
    return new Promise((resolve) => {
      const onAbort = () => request.settle('cancelled')
      // 늦게 도착한 approve 나 reject 가 그 뒤에 열린 승인 카드를 닫지 않게, 자기 자신이 아직
      // 대기 중일 때만 끝낸다.
      const settle = (result: ApprovalResult) => {
        if (pending !== request) return
        pending = null
        signal?.removeEventListener('abort', onAbort)
        highlighted = null
        notify()
        resolve(result)
      }
      const request: PendingRequest = {
        binding,
        settle,
        approval: {
          actionId: binding.spec.id,
          summary,
          approve: () => settle('approved'),
          reject: () => settle('rejected'),
        },
      }
      pending = request
      signal?.addEventListener('abort', onAbort, { once: true })
      setHighlight({ target: binding.target, label: summary, mode: 'approval' })
    })
  }

  /** 승인 뒤 실제로 실행하기 직전에, 그 사이 페이지가 닫혔거나 막혔는지 다시 본다. */
  function runAfterApproval(binding: ActionBinding, args: Record<string, unknown>): Promise<ActionOutcome> {
    if (actions.get(binding.spec.id) !== binding) {
      return Promise.resolve({ status: 'error', error: PAGE_CLOSED_ERROR })
    }
    const blockedReason = binding.blocked()
    if (blockedReason !== null) return Promise.resolve({ status: 'error', error: blockedReason })
    return runBinding(binding, args)
  }

  return {
    registerAction(binding) {
      actions.set(binding.spec.id, binding)
      notify()
      return () => {
        if (actions.get(binding.spec.id) !== binding) return
        actions.delete(binding.spec.id)
        if (pending?.binding === binding) pending.settle('closed')
        notify()
      }
    },

    registerField(binding) {
      fields.set(binding.spec.name, binding)
      notify()
      return () => {
        if (fields.get(binding.spec.name) !== binding) return
        fields.delete(binding.spec.name)
        notify()
      }
    },

    setLocation(nextPage, nextParams) {
      const unchanged =
        nextPage === page &&
        Object.keys(nextParams).length === Object.keys(params).length &&
        Object.entries(nextParams).every(([key, value]) => params[key] === value)
      if (unchanged) return
      page = nextPage
      params = nextParams
      notify()
    },

    highlight: () => highlighted,
    hasBindings,

    snapshot(): PageSnapshot {
      const fieldSnapshot: PageSnapshot['fields'] = {}
      for (const [name, binding] of fields) {
        const entry: PageSnapshot['fields'][string] = { value: binding.read() }
        if (binding.options !== undefined) entry.options = binding.options()
        fieldSnapshot[name] = entry
      }
      return {
        page,
        params: { ...params },
        fields: fieldSnapshot,
        actions: [...actions.values()].map((binding) => ({ id: binding.spec.id, blocked: binding.blocked() })),
      }
    },

    waitForPage(target, timeoutMilliseconds) {
      return new Promise<boolean>((resolve) => {
        let settleTimer: ReturnType<typeof setTimeout> | null = null
        let finished = false
        const finish = (result: boolean) => {
          if (finished) return
          finished = true
          listeners.delete(check)
          clearTimeout(deadline)
          if (settleTimer !== null) clearTimeout(settleTimer)
          resolve(result)
        }
        function check() {
          if (finished) return
          if (page !== target) {
            if (settleTimer !== null) clearTimeout(settleTimer)
            settleTimer = null
            return
          }
          if (hasBindings(target)) return finish(true)
          // binding 이 없어도 되는 페이지는 잠깐 기다린 뒤 열린 것으로 친다.
          if (!pageHasCatalogBindings(target) && settleTimer === null) {
            settleTimer = setTimeout(() => {
              settleTimer = null
              if (page === target) finish(true)
            }, graceMilliseconds)
          }
        }
        const deadline = setTimeout(() => finish(false), timeoutMilliseconds)
        listeners.add(check)
        check()
      })
    },

    async setField(name, value, signal) {
      const binding = fields.get(name)
      if (binding === undefined) return { status: 'unavailable' }
      if (signal?.aborted) return CANCELLED
      const valueError = fieldValueError(binding, value)
      if (valueError !== null) return { status: 'error', error: valueError }
      if (!(await highlightThenWait(binding.target, `${name} = ${previewValue(value)}`, signal))) return CANCELLED
      try {
        binding.write(value)
        return { status: 'ok', result: undefined }
      } catch (error) {
        return { status: 'error', error: describeError(error) }
      } finally {
        setHighlight(null)
      }
    },

    async callAction(id, args, signal) {
      const binding = actions.get(id)
      if (binding === undefined) return { status: 'unavailable' }
      if (signal?.aborted) return CANCELLED
      const argsError = validateAgainstSchema(args, { type: 'object', ...binding.spec.args })
      if (argsError !== null) return { status: 'error', error: argsError }
      const blockedReason = binding.blocked()
      if (blockedReason !== null) return { status: 'error', error: blockedReason }

      const summary = summarize(binding, args)
      if (binding.spec.risk === 'auto') {
        if (!(await highlightThenWait(binding.target, summary, signal))) return CANCELLED
        setHighlight(null)
        return runBinding(binding, args)
      }
      if (pending !== null) return { status: 'error', error: 'Another action is waiting for approval.' }
      const result = await askApproval(binding, summary, signal)
      if (result === 'approved') return runAfterApproval(binding, args)
      if (result === 'cancelled') return CANCELLED
      if (result === 'closed') return { status: 'rejected', error: PAGE_CLOSED_ERROR }
      return { status: 'rejected' }
    },

    pendingApproval: () => pending?.approval ?? null,

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
