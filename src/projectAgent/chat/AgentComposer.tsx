import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { useI18n } from '../../i18n/useI18n'
import type { AgentSession } from './sessionContext'

/**
 * 입력 칸. Enter 로 보내고 Shift+Enter 로 줄을 바꾼다. agent 가 일하는 동안은 입력을 막고
 * 보내기 자리에 멈추기 버튼을 둔다.
 */
export function AgentComposer({ session }: { session: AgentSession }) {
  const { t } = useI18n()
  const copy = t.projectAgent
  const { store, state, view } = session
  const [draft, setDraft] = useState('')
  const conversationBusy = view.busy && !state.sending
  const disabled = view.busy

  const submit = () => {
    if (disabled || draft.trim().length === 0) return
    const text = draft
    setDraft('')
    void store.send(text)
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    submit()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // 한글 조합 중의 Enter 는 글자를 확정하는 것이다. 보내면 마지막 글자가 다음 입력에 남는다.
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    submit()
  }

  return (
    <form className="agent-panel__composer" onSubmit={onSubmit}>
      {state.error !== null && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>
          {state.error}
        </div>
      )}
      <textarea
        aria-describedby="agent-composer-hint"
        aria-label={copy.composerLabel}
        className="agent-composer"
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={disabled ? copy.chat.busyPlaceholder : copy.composerPlaceholder}
        rows={3}
        value={draft}
      />
      <div className="agent-composer__actions">
        <p className="shortcut-hint" id="agent-composer-hint">
          {copy.chat.composerHint}
        </p>
        {conversationBusy ? (
          <button className="button button--secondary button--compact agent-button--stop" onClick={() => void store.cancel()} type="button">
            <span aria-hidden="true" className="agent-stop-mark" />
            {copy.chat.stop}
          </button>
        ) : (
          <button
            className="button button--primary button--compact"
            disabled={disabled || draft.trim().length === 0}
            type="submit"
          >
            {copy.chat.send}
          </button>
        )}
      </div>
    </form>
  )
}
