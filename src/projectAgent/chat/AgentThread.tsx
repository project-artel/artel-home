import { useEffect, useRef } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { ChatMessageBody } from '../../testRuns/ChatMessageBody'
import { ApprovalCard, ChoiceCard, JobCard, ResumeCard, StateIcon, type IconState } from './AgentCards'
import type { AgentSession } from './sessionContext'
import { stepTarget } from './stepLabel'
import type { StepState, ThreadItem, ToolStep } from './threadState'

const STEP_ICON: Record<StepState, IconState> = {
  ok: 'ok',
  error: 'error',
  unavailable: 'error',
  rejected: 'muted',
  cancelled: 'muted',
  running: 'running',
  waiting: 'waiting',
}

function StepRow({ step }: { step: ToolStep }) {
  const { t } = useI18n()
  const copy = t.projectAgent.chat
  const label = step.tool in copy.tools ? copy.tools[step.tool as keyof typeof copy.tools] : copy.tools.unknown
  const target = stepTarget(step.tool, step.args)
  return (
    <li className={`agent-step agent-step--${step.state}`} title={step.error ?? undefined}>
      <StateIcon state={STEP_ICON[step.state]} />
      <span className="agent-step__label">{label}</span>
      {target.length > 0 && <span className="agent-step__target">{target}</span>}
      <span className="visually-hidden">{copy.stepState[step.state]}</span>
    </li>
  )
}

function ThreadRow({ item }: { item: ThreadItem }) {
  const { t } = useI18n()
  const copy = t.projectAgent.chat
  switch (item.kind) {
    case 'user':
      return (
        <li className="agent-msg agent-msg--user">
          <p className="agent-bubble">{item.text}</p>
        </li>
      )
    case 'assistant':
      return (
        <li className="agent-msg agent-msg--assistant">
          <ChatMessageBody body={item.text} />
        </li>
      )
    case 'steps':
      return (
        <li className="agent-msg">
          <ul aria-label={copy.stepsLabel} className="agent-steps">
            {item.steps.map((step) => (
              <StepRow key={step.callId} step={step} />
            ))}
          </ul>
        </li>
      )
    case 'event': {
      const label =
        item.eventKind === 'job_finished' ? copy.eventFinished : item.eventKind === 'job_failed' ? copy.eventFailed : copy.eventOther
      return (
        <li className={`agent-msg agent-event${item.eventKind === 'job_failed' ? ' is-failed' : ''}`}>
          <span className="agent-event__label">{label}</span> {item.text}
        </li>
      )
    }
    case 'notice':
      return (
        <li className={`agent-msg agent-notice${item.noticeKind === 'error' ? ' is-error' : ''}`} role="note">
          {item.text}
        </li>
      )
  }
}

/** 대화 내용과 그 아래의 카드(job, 질문, 승인, 이어서 하기). */
export function AgentThread({ session }: { session: AgentSession }) {
  const { t } = useI18n()
  const copy = t.projectAgent.chat
  const { store, state, view } = session
  const endRef = useRef<HTMLDivElement | null>(null)
  const running = view.thread?.conversation?.status === 'RUNNING'
  const lastItemId = view.items.length === 0 ? 0 : view.items[view.items.length - 1].id

  // 새 줄이나 카드가 생기면 맨 아래로 내린다.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [lastItemId, view.items.length, view.jobs.length, view.choice, state.approval, view.resume, running])

  return (
    <div className="agent-thread">
      <ol className="agent-thread__list">
        {view.items.map((item) => (
          <ThreadRow item={item} key={`${item.kind}-${item.id}`} />
        ))}
      </ol>
      {view.jobs.map((job) => (
        <JobCard job={job} key={job.key} projectId={store.projectId} />
      ))}
      {view.choice !== null && <ChoiceCard choice={view.choice} key={view.choice.question} onAnswer={(ids) => store.answerChoice(ids)} />}
      {state.approval !== null && <ApprovalCard approval={state.approval} />}
      {view.resume !== null && (
        <ResumeCard onResume={() => store.resume()} onStop={() => void store.cancel()} pending={view.resume} />
      )}
      <p aria-live="polite" className={running ? 'agent-working' : 'visually-hidden'}>
        {running ? copy.working : ''}
      </p>
      <div ref={endRef} />
    </div>
  )
}
