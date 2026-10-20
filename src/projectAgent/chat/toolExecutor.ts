import { catalogEntry } from '../catalog'
import type { ActionOutcome, PageId, PageSnapshot } from '../registry/types'
import type { ToolCall } from './conversationApi'
import { resolvePagePath } from './pagePath'
import { runQuery } from './queries'
import type { ChoiceOption, ToolContext, ToolHandler, ToolResultBody } from './toolTypes'
import { authorScenarios } from './tools/authorScenarios'
import { watchJob } from './tools/watchJob'

/*
 * 브라우저가 실행하는 tool 의 dispatcher. 결과 모양은 계약 3절의 표를 따른다.
 * 실패는 던지지 않고 결과로 돌려준다. 결과를 보내지 않으면 대화가 `AWAITING_TOOL` 에 멈춘다.
 */

/** `open_page` 가 페이지의 binding 등록을 기다리는 시간. */
export const OPEN_PAGE_WAIT_MS = 5000

/** `set_field` 와 `call_action` 의 결과. 어느 쪽이든 그 뒤의 snapshot 을 붙인다. */
export function outcomeToResult(outcome: ActionOutcome, page: PageSnapshot): ToolResultBody {
  if (outcome.status === 'ok') {
    return outcome.result === undefined ? { status: 'ok', page } : { status: 'ok', result: outcome.result, page }
  }
  return outcome.error === undefined ? { status: outcome.status, page } : { status: outcome.status, error: outcome.error, page }
}

function asArgs(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

const openPage: ToolHandler = async (args, context) => {
  const page = typeof args.page === 'string' ? (args.page as PageId) : null
  const entry = page === null ? undefined : catalogEntry(page)
  if (page === null || entry === undefined) {
    return { status: 'error', error: `unknown page '${String(args.page)}'` }
  }
  const resolved = resolvePagePath(entry, asArgs(args.params))
  if (!resolved.ok) return { status: 'error', error: resolved.error }
  context.navigate(resolved.path)
  const ready = await context.registry.waitForPage(page, OPEN_PAGE_WAIT_MS)
  const snapshot = context.registry.snapshot()
  if (!ready) {
    return { status: 'error', error: `page '${page}' did not register within ${OPEN_PAGE_WAIT_MS} ms`, page: snapshot }
  }
  return { status: 'ok', page: snapshot }
}

const readPage: ToolHandler = async (_args, context) => ({ status: 'ok', page: context.registry.snapshot() })

const setField: ToolHandler = async (args, context) => {
  if (typeof args.field !== 'string' || args.field.length === 0) {
    return { status: 'error', error: 'set_field needs a field name' }
  }
  const outcome = await context.registry.setField(args.field, args.value)
  return outcomeToResult(outcome, context.registry.snapshot())
}

const callAction: ToolHandler = async (args, context) => {
  if (typeof args.action !== 'string' || args.action.length === 0) {
    return { status: 'error', error: 'call_action needs an action id' }
  }
  const outcome = await context.registry.callAction(args.action, asArgs(args.args))
  return outcomeToResult(outcome, context.registry.snapshot())
}

/** `ask_choice` 의 options. id 와 label 이 모두 있는 것만 남긴다. */
export function parseChoiceOptions(value: unknown): ChoiceOption[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const option = asArgs(entry)
    const id = typeof option.id === 'string' ? option.id : typeof option.id === 'number' ? String(option.id) : ''
    const label = typeof option.label === 'string' ? option.label : ''
    return id.length > 0 && label.length > 0 ? [{ id, label }] : []
  })
}

const askChoice: ToolHandler = async (args, context) => {
  const question = typeof args.question === 'string' ? args.question : ''
  const options = parseChoiceOptions(args.options)
  if (question.length === 0 || options.length < 2) {
    return { status: 'error', error: 'ask_choice needs a question and at least 2 options with id and label' }
  }
  const picked = await context.askChoice(question, options, args.multiple === true)
  if (picked === null) return { status: 'cancelled' }
  return { status: 'ok', result: { optionIds: picked } }
}

const query: ToolHandler = (args, context) => runQuery(context.projectId, args, context.signal)

const HANDLERS: Record<string, ToolHandler> = {
  open_page: openPage,
  read_page: readPage,
  set_field: setField,
  call_action: callAction,
  ask_choice: askChoice,
  query,
  watch_job: watchJob,
  author_scenarios: authorScenarios,
}

export async function executeToolCall(call: ToolCall, context: ToolContext): Promise<ToolResultBody> {
  const handler = HANDLERS[call.tool]
  if (handler === undefined) return { status: 'error', error: `unknown tool '${call.tool}'` }
  try {
    return await handler(call.args, context)
  } catch (error) {
    if (context.signal.aborted) return { status: 'cancelled' }
    return { status: 'error', error: error instanceof Error ? error.message : String(error) }
  }
}
