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
/**
 * Everything one turn could not settle, in one place (ARTEL-630).
 *
 * The server used to ask one thing and stay silent about the rest. A run with five
 * blocked spots asked about one, and the user read the scenarios as finished — the
 * other four sat in the steps as "이 구간의 경로를 확인할 수 없습니다" that nobody was
 * invited to answer.
 *
 * Seeing them together is the point: the user answers what they know and leaves the
 * rest. Each question keeps its own buttons and its own line, and answering one does
 * not clear the others.
 */
export function RunChatQuestionList({
  questions,
  disabled,
  onAnswer,
}: {
  questions: RunChatQuestion[]
  disabled: boolean
  onAnswer: (answer: RunChatAnswer) => void
}) {
  const { t } = useI18n()
  const q = t.scenarios.chat.question

  if (questions.length === 1) {
    return <RunChatQuestionBlock question={questions[0]} disabled={disabled} onAnswer={onAnswer} />
  }

  return (
    <div className="chat-questions">
      {/* 몇 개가 남았는지 먼저 말한다. 목록만 있으면 얼마나 더 있는지 세어야 한다. */}
      <p className="chat-questions-count">{q.pendingCount.replace('{count}', String(questions.length))}</p>
      <ol className="chat-questions-list">
        {questions.map((question) => (
          <li key={question.id} className="chat-questions-item">
            <p className="chat-questions-text">{question.text}</p>
            <RunChatQuestionBlock question={question} disabled={disabled} onAnswer={onAnswer} />
          </li>
        ))}
      </ol>
    </div>
  )
}

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
