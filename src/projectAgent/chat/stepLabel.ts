import { catalogEntry } from '../catalog'
import type { PageId } from '../registry/types'

/** step 줄 하나에 붙는 대상 이름의 최대 길이. 좁은 대화창에서 한 줄을 넘지 않게 한다. */
export const STEP_TARGET_MAX = 48

function text(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function shorten(value: string): string {
  return value.length > STEP_TARGET_MAX ? `${value.slice(0, STEP_TARGET_MAX - 1)}…` : value
}

/** tool 호출이 무엇을 겨누는지 짧게. 예: `open_page` 는 페이지 제목, `call_action` 은 action id. */
export function stepTarget(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case 'open_page': {
      const page = text(args.page)
      return shorten(catalogEntry(page as PageId)?.title ?? page)
    }
    case 'set_field':
      return shorten(text(args.field))
    case 'call_action':
      return shorten(text(args.action))
    case 'query':
      return shorten(text(args.kind))
    case 'ask_choice':
      return shorten(text(args.question))
    case 'watch_job': {
      const label = text(args.label)
      return shorten(label.length > 0 ? label : [text(args.kind), text(args.id)].filter(Boolean).join(' '))
    }
    case 'read_guide':
      return shorten(text(args.topic))
    case 'author_scenarios': {
      const runId = text(args.run_id)
      return runId.length > 0 ? `test run ${runId}` : ''
    }
    default:
      return ''
  }
}
