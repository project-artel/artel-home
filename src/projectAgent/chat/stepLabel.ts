import { catalogEntry } from '../catalog'
import type { PageId } from '../registry/types'

function text(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

/** tool 호출이 무엇을 겨누는지 짧게. 예: `open_page` 는 페이지 제목, `call_action` 은 action id. */
export function stepTarget(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case 'open_page': {
      const page = text(args.page)
      return catalogEntry(page as PageId)?.title ?? page
    }
    case 'set_field':
      return text(args.field)
    case 'call_action':
      return text(args.action)
    case 'query':
      return text(args.kind)
    case 'ask_choice':
      return text(args.question)
    case 'watch_job': {
      const label = text(args.label)
      return label.length > 0 ? label : [text(args.kind), text(args.id)].filter(Boolean).join(' ')
    }
    case 'read_guide':
      return text(args.topic)
    case 'author_scenarios': {
      const runId = text(args.run_id)
      return runId.length > 0 ? `test run ${runId}` : ''
    }
    default:
      return ''
  }
}
