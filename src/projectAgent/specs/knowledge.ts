import type { ActionSpec, FieldSpec } from '../registry/types'

/* 지식 그래프 페이지의 action 정의. 검색칸은 이 페이지에 없다. binding 은 `KnowledgeGraphPage.tsx` 에 있다. */

export const KNOWLEDGE_OPEN_NODE_ACTION: ActionSpec = {
  id: 'knowledge.openNode',
  page: 'knowledge',
  risk: 'auto',
  description:
    'Select one knowledge item (node) of the graph, which opens its details on the right: summary, tag, source, relations and the body text. Returns {id, tag, source, summary}. Blocked while the graph loads or when it has no items.',
  args: {
    type: 'object',
    properties: {
      node: {
        type: 'string',
        description: 'The item id, or a piece of its summary text when only one item contains it.',
      },
    },
    required: ['node'],
  },
  summarize: (args) => `Open knowledge item ${typeof args.node === 'string' ? args.node : ''}`,
}

export const KNOWLEDGE_FIELDS: FieldSpec[] = []
export const KNOWLEDGE_ACTIONS: ActionSpec[] = [KNOWLEDGE_OPEN_NODE_ACTION]
