import { useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import type { RunChatAnswer, RunChatQuestion } from './runChatApi'

/**
 * A question the server asked, with somewhere to click (ARTEL-487).
 *
 * Authoring cannot settle everything — which cases a vague request meant, how a
 * transition the scene spec never recorded is made. Until now those landed in prose
 * the user read as explanation and never answered. Measured: the same request five
 * times produced a different set of cases each time, and nothing on screen said which
 * boundary had been chosen.
 *
 * Picking is one click and sends immediately. The extra line is optional and exists
 * for the questions options cannot close ("how do you get from here to there").
 */
export function RunChatQuestionBlock({
  question,
  disabled,
  onAnswer,
}: {
  question: RunChatQuestion
  disabled: boolean
  onAnswer: (answer: RunChatAnswer) => void
}) {
  const { t } = useI18n()
  const q = t.scenarios.chat.question
  const [text, setText] = useState('')

  function pick(optionId: string, label: string) {
    if (disabled) return
    onAnswer({
      questionId: question.id,
      optionIds: [optionId],
      text: text.trim().length > 0 ? text.trim() : undefined,
      displayText: label,
    })
    setText('')
  }

  function sendWritten() {
    const said = text.trim()
    if (disabled || said.length === 0) return
    onAnswer({ questionId: question.id, optionIds: [], text: said })
    setText('')
  }

  return (
    <div className="chat-question">
      {question.why !== null && <p className="chat-question-why">{question.why}</p>}

      {question.options.length > 0 && (
        <div className="chat-question-options">
          {question.options.map((option) => (
            <button
              key={option.id}
              className="chat-question-option"
              type="button"
              disabled={disabled}
              title={option.detail ?? undefined}
              onClick={() => pick(option.id, option.label)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {question.allowFreeText && (
        <div className="chat-question-write">
          <input
            className="chat-question-input"
            value={text}
            placeholder={q.freeTextPlaceholder}
            aria-label={q.freeTextLabel}
            disabled={disabled}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                sendWritten()
              }
            }}
          />
          <button
            className="chat-question-send"
            type="button"
            disabled={disabled || text.trim().length === 0}
            onClick={sendWritten}
          >
            {q.send}
          </button>
        </div>
      )}
    </div>
  )
}
