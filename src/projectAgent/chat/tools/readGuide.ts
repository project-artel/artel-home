import { findGuide, GUIDES } from '../../guides/index'
import type { ToolHandler } from '../toolTypes'

/** `read_guide`. 안내 문서 하나의 본문을 돌려준다. 없는 topic 이면 있는 id 목록과 함께 error 다. */
export const readGuide: ToolHandler = async (args) => {
  const topic = typeof args.topic === 'string' ? args.topic : ''
  const guide = findGuide(topic)
  if (guide === undefined) {
    return { status: 'error', error: `unknown guide '${topic}'. Known: ${GUIDES.map((one) => one.id).join(', ')}` }
  }
  return { status: 'ok', result: { id: guide.id, title: guide.title, body: guide.body } }
}
