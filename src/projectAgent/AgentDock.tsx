import type { ComponentProps } from 'react'
import { SplitHandle } from '../design-system/primitives/SplitHandle'
import { useI18n } from '../i18n/useI18n'
import './agentDock.css'

function AgentIcon() {
  return (
    <svg aria-hidden="true" className="agent-icon" fill="none" height="16" viewBox="0 0 16 16" width="16">
      <path d="M8 1.5v2M3 6.5h10a1.5 1.5 0 0 1 1.5 1.5v3A1.5 1.5 0 0 1 13 12.5H3A1.5 1.5 0 0 1 1.5 11V8A1.5 1.5 0 0 1 3 6.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
      <circle cx="5.75" cy="9.5" fill="currentColor" r="0.9" />
      <circle cx="10.25" cy="9.5" fill="currentColor" r="0.9" />
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

/** 프로젝트 agent 대화창. 이번 단계는 배치만 있고 대화 내용은 자리표시자다. */
export function AgentChatPanel({ onClose, wide = false }: { onClose: () => void; wide?: boolean }) {
  const { t } = useI18n()
  const copy = t.projectAgent
  return (
    <aside aria-label={copy.panelLabel} className={'agent-panel' + (wide ? ' is-wide' : '')}>
      <header className="agent-panel__header">
        <span className="agent-panel__identity">
          <AgentIcon />
          <span className="agent-panel__title">{copy.newConversation}</span>
        </span>
        <button aria-label={copy.close} className="agent-icon-button" onClick={onClose} type="button">
          <CloseIcon />
        </button>
      </header>
      <div className="agent-panel__body">
        <div className="agent-panel__content">
          <h2 className="agent-panel__empty-title">{copy.emptyTitle}</h2>
          <p className="agent-panel__empty-hint">{copy.emptyHint}</p>
        </div>
      </div>
      <form className="agent-panel__composer" onSubmit={(event) => event.preventDefault()}>
        <div className="agent-panel__content">
          <textarea aria-label={copy.composerLabel} className="agent-composer" disabled placeholder={copy.composerPlaceholder} rows={2} />
          <p className="agent-composer__note">{copy.composerNote}</p>
        </div>
      </form>
    </aside>
  )
}

/** 닫힌 대화창을 다시 여는 버튼. 오른쪽 화면 가장자리에 붙는다. */
export function AgentReopenButton({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n()
  return (
    <button
      aria-label={t.projectAgent.reopen}
      className="agent-reopen"
      onClick={onOpen}
      type="button"
    >
      <AgentIcon />
      <span className="agent-reopen__label">{t.projectAgent.agentName}</span>
    </button>
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
