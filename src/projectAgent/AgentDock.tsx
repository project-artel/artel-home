import type { ComponentProps } from 'react'
import { SplitHandle } from '../design-system/primitives/SplitHandle'
import { useI18n } from '../i18n/useI18n'
import { AgentComposer } from './chat/AgentComposer'
import { AgentThread } from './chat/AgentThread'
import { ConversationSwitcher } from './chat/ConversationSwitcher'
import { useAgentSession } from './chat/sessionContext'
import './agentDock.css'
import './chat/agentChat.css'

function AgentIcon() {
  return (
    <svg aria-hidden="true" className="agent-icon" fill="none" height="16" viewBox="0 0 16 16" width="16">
      <path d="M8 1.5v2M3 6.5h10a1.5 1.5 0 0 1 1.5 1.5v3A1.5 1.5 0 0 1 13 12.5H3A1.5 1.5 0 0 1 1.5 11V8A1.5 1.5 0 0 1 3 6.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
      <circle cx="5.75" cy="9.5" fill="currentColor" r="0.9" />
      <circle cx="10.25" cy="9.5" fill="currentColor" r="0.9" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
      <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  )
}

/** 프로젝트 agent 대화창. 대화 상태는 `AgentSessionProvider` 가 갖고, 여기서는 그리기만 한다. */
export function AgentChatPanel({ onClose, wide = false }: { onClose?: () => void; wide?: boolean }) {
  const { t } = useI18n()
  return (
    <aside aria-label={t.projectAgent.panelLabel} className={'agent-panel' + (wide ? ' is-wide' : '')}>
      <AgentChatBody onClose={onClose} />
    </aside>
  )
}

/**
 * 시나리오 화면 오른쪽 칸처럼 dock 밖에서 같은 대화를 그릴 때 쓴다. 닫기 버튼이 없다.
 * 대화 상태는 dock 과 같은 `AgentSessionProvider` 의 것이라 두 곳이 같은 session 을 본다.
 */
export function AgentChatEmbedded() {
  const { t } = useI18n()
  return (
    <section aria-label={t.projectAgent.panelLabel} className="agent-panel is-embedded">
      <AgentChatBody />
    </section>
  )
}

function AgentChatBody({ onClose }: { onClose?: () => void }) {
  const { t } = useI18n()
  const copy = t.projectAgent
  const session = useAgentSession()
  const thread = session?.view.thread ?? null
  const empty =
    session === null ||
    (session.view.items.length === 0 && (thread === null || thread.load === 'ready') && !session.view.busy)
  return (
    <>
      <header className="agent-panel__header">
        <span className="agent-panel__identity">
          <AgentIcon />
          {session === null ? (
            <span className="agent-panel__title">{copy.newConversation}</span>
          ) : (
            <ConversationSwitcher session={session} />
          )}
        </span>
        <span className="agent-panel__tools">
          {session !== null && session.state.currentId !== null && (
            <button
              aria-label={copy.chat.newConversation}
              className="agent-icon-button"
              onClick={() => session.store.newConversation()}
              type="button"
            >
              <PlusIcon />
            </button>
          )}
          {onClose !== undefined && (
            <button aria-label={copy.close} className="agent-icon-button" onClick={onClose} type="button">
              <CloseIcon />
            </button>
          )}
        </span>
      </header>
      <div className={'agent-panel__body' + (empty ? ' is-empty' : '')}>
        <div className="agent-panel__content">
          {empty ? (
            <EmptyState onPick={session === null ? undefined : (text) => void session.store.send(text)} />
          ) : thread?.load === 'loading' && thread.messages.length === 0 ? (
            <p className="agent-panel__status">{copy.chat.loading}</p>
          ) : thread?.load === 'error' ? (
            <p className="agent-panel__status" role="alert">{copy.chat.loadFailed}</p>
          ) : (
            session !== null && <AgentThread session={session} />
          )}
        </div>
      </div>
      {session !== null && <AgentComposer session={session} />}
    </>
  )
}

function EmptyState({ onPick }: { onPick?: (text: string) => void }) {
  const { t } = useI18n()
  const copy = t.projectAgent
  const suggestions = [
    copy.chat.suggestionRunQa,
    copy.chat.suggestionLastRun,
    copy.chat.suggestionIssues,
    copy.chat.suggestionUsage,
  ]
  return (
    <>
      <h2 className="agent-panel__empty-title">{copy.emptyTitle}</h2>
      <p className="agent-panel__empty-hint">{copy.emptyHint}</p>
      {onPick !== undefined && (
        <ul aria-label={copy.chat.suggestionsLabel} className="agent-suggestions">
          {suggestions.map((text) => (
            <li key={text}>
              <button className="chat-question-option" onClick={() => onPick(text)} type="button">
                {text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/**
 * 닫힌 대화창을 다시 여는 버튼. workspace grid 의 오른쪽 마지막 칸에 선다.
 * badge 는 `AgentSessionProvider` 에서 읽는다. 승인 대기, 질문 대기, 아직 보지 않은 끝난 job 의 수다.
 */
export function AgentReopenButton({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n()
  const badgeCount = useAgentSession()?.badge.count ?? 0
  return (
    <div className="agent-reopen-rail">
      <button
        aria-label={badgeCount > 0 ? t.projectAgent.chat.reopenWithBadge(badgeCount) : t.projectAgent.reopen}
        className="agent-reopen"
        onClick={onOpen}
        type="button"
      >
        <span className="agent-reopen__icon">
          <AgentIcon />
          {badgeCount > 0 && (
            <span aria-hidden="true" className="agent-reopen__badge">
              {badgeCount > 9 ? '9+' : badgeCount}
            </span>
          )}
        </span>
        <span className="agent-reopen__label">{t.projectAgent.agentName}</span>
      </button>
    </div>
  )
}

/** `useAgentDock().handle` 를 그대로 받는다. 꾸밈이 `.agent-dock-split` 밑에만 걸려 있어 감싸서 그린다. */
export function AgentSplitHandle(props: ComponentProps<typeof SplitHandle>) {
  return (
    <div className="agent-dock-split">
      <SplitHandle {...props} />
    </div>
  )
}
