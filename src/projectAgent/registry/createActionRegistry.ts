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

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
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
  let pending: PendingApproval | null = null

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

  async function highlightThenWait(target: () => HTMLElement | null, label: string) {
    setHighlight({ target, label, mode: 'acting' })
    await delay(highlightMilliseconds)
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

  function askApproval(binding: ActionBinding, summary: string): Promise<boolean> {
    return new Promise((resolve) => {
      const settle = (approved: boolean) => {
        if (pending === null) return
        pending = null
        highlighted = null
        notify()
        resolve(approved)
      }
      pending = {
        actionId: binding.spec.id,
        summary,
        approve: () => settle(true),
        reject: () => settle(false),
      }
      setHighlight({ target: binding.target, label: summary, mode: 'approval' })
    })
  }

  return {
    registerAction(binding) {
      actions.set(binding.spec.id, binding)
      notify()
      return () => {
        if (actions.get(binding.spec.id) !== binding) return
        actions.delete(binding.spec.id)
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

    async setField(name, value) {
      const binding = fields.get(name)
      if (binding === undefined) return { status: 'unavailable' }
      await highlightThenWait(binding.target, `${name} = ${previewValue(value)}`)
      try {
        binding.write(value)
        return { status: 'ok', result: undefined }
      } catch (error) {
        return { status: 'error', error: describeError(error) }
      } finally {
        setHighlight(null)
      }
    },

    async callAction(id, args) {
      const binding = actions.get(id)
      if (binding === undefined) return { status: 'unavailable' }
      const argsError = validateAgainstSchema(args, { type: 'object', ...binding.spec.args })
      if (argsError !== null) return { status: 'error', error: argsError }
      const blockedReason = binding.blocked()
      if (blockedReason !== null) return { status: 'error', error: blockedReason }

      const summary = summarize(binding, args)
      if (binding.spec.risk === 'auto') {
        await highlightThenWait(binding.target, summary)
        setHighlight(null)
        return runBinding(binding, args)
      }
      if (pending !== null) return { status: 'error', error: 'Another action is waiting for approval.' }
      const approved = await askApproval(binding, summary)
      return approved ? runBinding(binding, args) : { status: 'rejected' }
    },

    pendingApproval: () => pending,

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
