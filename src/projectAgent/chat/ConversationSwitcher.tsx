import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n/useI18n'
import type { AgentSession } from './sessionContext'

function ChevronIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="12" viewBox="0 0 12 12" width="12">
      <path d="M3 4.5 6 7.5l3-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 14 14" width="14">
      <path d="M2.5 4h9M5.5 4V2.5h3V4M4 4l.5 7.5h5L10 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" />
    </svg>
  )
}

/** header 의 대화 제목. 누르면 대화 목록과 새 대화가 열린다. */
export function ConversationSwitcher({ session }: { session: AgentSession }) {
  const { t } = useI18n()
  const copy = t.projectAgent.chat
  const { store, state, view } = session
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const title = view.thread?.conversation?.title ?? (state.currentId === null ? copy.newConversation : copy.untitled)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="agent-switcher" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`${copy.switcher}: ${title}`}
        className="agent-switcher__button"
        onClick={() => setOpen((was) => !was)}
        type="button"
      >
        <span className="agent-panel__title">{title}</span>
        <ChevronIcon />
      </button>
      {open && (
        <div className="agent-switcher__popover">
          <button
            className="agent-switcher__new"
            onClick={() => {
              store.newConversation()
              setOpen(false)
            }}
            type="button"
          >
            + {copy.newConversation}
          </button>
          {state.listLoad === 'error' && <p className="agent-switcher__empty">{copy.listFailed}</p>}
          {state.listLoad === 'ready' && state.conversations.length === 0 && (
            <p className="agent-switcher__empty">{copy.listEmpty}</p>
          )}
          <ul className="agent-switcher__list">
            {state.conversations.map((conversation) => {
              const label = conversation.title ?? copy.untitled
              return (
                <li className={'agent-switcher__item' + (conversation.id === state.currentId ? ' is-current' : '')} key={conversation.id}>
                  <button
                    aria-current={conversation.id === state.currentId ? 'true' : undefined}
                    className="agent-switcher__select"
                    onClick={() => {
                      store.selectConversation(conversation.id)
                      setOpen(false)
                    }}
                    type="button"
                  >
                    {label}
                  </button>
                  <button
                    aria-label={copy.deleteConversation(label)}
                    className="agent-icon-button"
                    onClick={() => void store.removeConversation(conversation.id)}
                    type="button"
                  >
                    <TrashIcon />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
