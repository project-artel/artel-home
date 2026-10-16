import type { Localized } from '../messages'

/** Strings for `src/projectAgent/*`. See `common.ts` for the typing convention. */
export const projectAgentEn = {
  agentName: 'Agent',
  panelLabel: 'Project agent conversation',
  newConversation: 'New conversation',
  close: 'Close agent conversation',
  emptyTitle: 'What should we do?',
  emptyHint: 'The agent can open pages and run work for you.',
  composerLabel: 'Message to the agent',
  composerPlaceholder: 'Ask the agent to do something',
  composerNote: 'The conversation will be connected in a later release.',
  reopen: 'Open agent conversation',
  resizeHandle: 'Resize agent conversation',
}

export const projectAgentKo: Localized<typeof projectAgentEn> = {
  agentName: 'Agent',
  panelLabel: '프로젝트 agent 대화창',
  newConversation: '새 대화',
  close: 'agent 대화창 닫기',
  emptyTitle: '무엇을 할까요?',
  emptyHint: 'agent 가 페이지를 열고 작업을 대신 실행합니다.',
  composerLabel: 'agent 에게 보낼 메시지',
  composerPlaceholder: 'agent 에게 일을 시켜 보세요',
  composerNote: '대화 연결은 다음 릴리스에서 제공합니다.',
  reopen: 'agent 대화창 열기',
  resizeHandle: 'agent 대화창 폭 조절',
}
