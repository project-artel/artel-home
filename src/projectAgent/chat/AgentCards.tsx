import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import type { PendingApproval } from '../registry/types'
import { projectRoute } from './pagePath'
import type { PendingChoice } from './sessionStore'
import type { PendingCalls } from './threadState'
import type { JobState } from './toolTypes'

/*
 * 대화 안에 서는 카드. 색은 상태를 말한다: 승인과 이어서 하기는 amber(사용자를 기다림),
 * 질문은 violet(agent), 실패한 job 은 coral. 색만으로 말하지 않도록 늘 제목 글자와 함께 그린다.
 */

export function ApprovalCard({ approval }: { approval: PendingApproval }) {
  const { t } = useI18n()
  const copy = t.projectAgent.chat
  return (
    <section aria-label={copy.approvalTitle} className="agent-card agent-card--waiting" role="group">
      <p className="agent-card__title">{copy.approvalTitle}</p>
      <p className="agent-card__body">{approval.summary}</p>
      <div className="agent-card__actions">
        <button className="agent-button agent-button--primary" onClick={approval.approve} type="button">
          {copy.approve}
        </button>
        <button className="agent-button" onClick={approval.reject} type="button">
          {copy.cancelApproval}
        </button>
      </div>
    </section>
  )
}

export function ChoiceCard({ choice, onAnswer }: { choice: PendingChoice; onAnswer: (optionIds: string[]) => void }) {
  const { t } = useI18n()
  const copy = t.projectAgent.chat
  const [picked, setPicked] = useState<string[]>([])

  const toggle = (id: string) =>
    setPicked((previous) => (previous.includes(id) ? previous.filter((one) => one !== id) : [...previous, id]))

  return (
    <section aria-label={copy.choiceLabel} className="agent-card agent-card--agent" role="group">
      <p className="agent-card__title">{choice.question}</p>
      {choice.multiple ? (
        <>
          <ul className="agent-choice-list">
            {choice.options.map((option) => (
              <li key={option.id}>
                <label className="agent-choice-check">
                  <input checked={picked.includes(option.id)} onChange={() => toggle(option.id)} type="checkbox" />
                  <span>{option.label}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="agent-card__actions">
            <button
              className="agent-button agent-button--primary"
              disabled={picked.length === 0}
              onClick={() => onAnswer(picked)}
              type="button"
            >
              {copy.choiceConfirm}
            </button>
          </div>
        </>
      ) : (
        <ul className="agent-choice-list">
          {choice.options.map((option) => (
            <li key={option.id}>
              <button className="agent-choice" onClick={() => onAnswer([option.id])} type="button">
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function JobCard({ job, projectId }: { job: JobState; projectId: string }) {
  const { t } = useI18n()
  const copy = t.projectAgent.chat
  const line = job.state === 'running' ? job.progress : job.detail
  return (
    <section aria-label={job.label} className={`agent-card agent-job agent-job--${job.state}`} role="group">
      <div className="agent-job__head">
        <StateIcon state={job.state === 'running' ? 'running' : job.state === 'finished' ? 'ok' : 'error'} />
        <p className="agent-card__title">{job.label}</p>
        <span className="agent-job__state">{copy.jobState[job.state]}</span>
      </div>
      {line !== undefined && line.length > 0 && <p className="agent-card__body">{line}</p>}
      {job.href !== undefined && (
        <Link className="agent-job__link" to={projectRoute(projectId, job.href)}>
          {copy.openJob}
        </Link>
      )}
    </section>
  )
}

export function ResumeCard({
  pending,
  onResume,
  onStop,
}: {
  pending: PendingCalls
  onResume: () => void
  onStop: () => void
}) {
  const { t } = useI18n()
  const copy = t.projectAgent.chat
  return (
    <section aria-label={copy.resumeTitle} className="agent-card agent-card--waiting" role="group">
      <p className="agent-card__title">{copy.resumeTitle}</p>
      <p className="agent-card__body">{copy.resumeBody(pending.calls.length)}</p>
      <div className="agent-card__actions">
        <button className="agent-button agent-button--primary" onClick={onResume} type="button">
          {copy.resume}
        </button>
        <button className="agent-button" onClick={onStop} type="button">
          {copy.stopConversation}
        </button>
      </div>
    </section>
  )
}

export type IconState = 'ok' | 'error' | 'muted' | 'running' | 'waiting'

/** step 줄과 job 카드의 상태 icon. 색과 모양을 함께 바꾼다. */
export function StateIcon({ state }: { state: IconState }) {
  if (state === 'running') return <span aria-hidden="true" className="agent-state agent-state--running" />
  if (state === 'waiting') return <span aria-hidden="true" className="agent-state agent-state--waiting" />
  return (
    <svg aria-hidden="true" className={`agent-state agent-state--${state}`} fill="none" height="14" viewBox="0 0 14 14" width="14">
      {state === 'ok' && <path d="M3 7.2 5.8 10 11 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />}
      {state === 'error' && <path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />}
      {state === 'muted' && <path d="M3.5 7h7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />}
    </svg>
  )
}
