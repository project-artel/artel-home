import { useMemo, type ReactNode } from 'react'
import { useI18n } from '../i18n/useI18n'
import { PeMacroNames } from './peMacroNames'
import { PeText, PickedAction } from './PeText'
import { macroName } from './peWords'
import {
  agentGoals,
  agentOptions,
  deriveAgentDock,
  type AgentDockState,
  type AgentJudgement,
  type AgentStatus,
} from './agentDockState'
import type { QaLog } from './qaTypes'
import './qaAgentDock.css'

/** 고른 확률이 이보다 낮으면 눈에 띄게 그린다. 재질의 실측에서 되풀이 turn 이 0.38~0.60 이었다. */
const LOW_CONFIDENCE = 0.6
/** 게임이 바쁠 확률이 이 이상이면 그 turn 은 기다렸다. agent-server 의 기준과 같다. */
const BUSY_WAIT = 0.7
/** 같은 행동을 이만큼 연달아 고르면 경고한다. */
const REPEAT_WARN = 3
/** 고른 행동 아래에 보이는 다른 선택지 수. */
const OTHER_OPTIONS = 3

type Text = ReturnType<typeof useI18n>['t']['qa']['run']['agentDock']
type Section = 'planner' | 'executor' | 'done' | 'evaluator'

function statusText(status: AgentStatus, text: Text, turn: number | null): string {
  switch (status.kind) {
    case 'writing':
      return text.writing
    case 'replanning':
      return text.replanning
    case 'rewriting':
      return text.rewriting
    case 'handoff':
      return text.handoff(status.plan)
    case 'reusing':
      return text.reusing
    case 'turn':
      return text.turn(turn ?? 0)
    case 'finished':
      return text.played
  }
}

function PlannerIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24" width="20">
      <path d="M4 5.5 9.5 3.5l5 2 5.5-2v15l-5.5 2-5-2L4 20.5z" />
      <path d="M9.5 3.5v15" />
      <path d="M14.5 5.5v15" />
    </svg>
  )
}

function ExecutorIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24" width="22">
      <path d="M7 7h10a5 5 0 0 1 5 5v2.5a3 3 0 0 1-5.4 1.8L15 14H9l-1.6 2.3A3 3 0 0 1 2 14.5V12a5 5 0 0 1 5-5z" />
      <path d="M7.5 10v3" />
      <path d="M6 11.5h3" />
      <path d="M16 10.5h.01" />
      <path d="M18 12.5h.01" />
    </svg>
  )
}

function DoneIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24" width="20">
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 4 2 4H5" />
    </svg>
  )
}

function EvaluatorIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24" width="20">
      <circle cx="10.5" cy="10.5" r="7" />
      <path d="m15.7 15.7 5.3 5.3" />
      <path d="m7.5 10.5 2.2 2.2 3.8-4.2" />
    </svg>
  )
}

/** 판정 줄에 끝난 판정을 몇 개까지 펼쳐 보이는가. 그보다 오래된 것은 개수만 적는다. */
const SHOWN_JUDGED = 3

type PeTextProps = ReturnType<typeof useI18n>['t']['qa']['run']['pe']

function Dots({ label }: { label: string }) {
  return (
    <span aria-label={label} className="qa-agent-dots" role="img">
      <i />
      <i />
      <i />
    </span>
  )
}

/** 칸 하나: 머리(아이콘, 칸 이름, 에이전트 이름, 지금 상태)와 내용. 지금 행동 중인 칸만 강조한다. */
function Card({
  section,
  label,
  agent,
  icon,
  status,
  busy,
  on,
  text,
  children,
}: {
  section: Section
  label: string
  agent: string | null
  icon: ReactNode
  status: string
  busy: boolean
  on: boolean
  text: Text
  children: ReactNode
}) {
  return (
    <section aria-label={label} className={`qa-agent-card qa-agent-card--${section}${on ? ' is-on' : ''}`}>
      <header className="qa-agent-card-head">
        <span aria-hidden="true" className="qa-agent-card-icon">{icon}</span>
        <strong className="qa-agent-card-label">{label}</strong>
        {agent !== null && <span className="qa-agent-card-agent mono">{agent}</span>}
        {busy && <Dots label={text.active} />}
        <span className="qa-agent-card-status">{status}</span>
      </header>
      <div className="qa-agent-card-body">{children}</div>
    </section>
  )
}

function coversText(dock: AgentDockState, text: Text): string {
  const covers = dock.plan?.covers ?? []
  if (covers.length > 1) return text.covers(covers[0], covers[covers.length - 1])
  return text.coversOne(dock.plan?.step ?? dock.step ?? 0)
}

const GOAL_GLYPHS = { done: '✓', current: '›', next: '○' } as const

function PlannerBody({ dock, text, pe }: { dock: AgentDockState; text: Text; pe: PeTextProps }) {
  const { plan, refusal, progress } = dock
  const goals = agentGoals(dock)
  const segmented = (plan?.covers.length ?? 0) > 1
  const writing = dock.active === 'planner' && dock.status !== null && ['writing', 'replanning', 'rewriting'].includes(dock.status.kind)
  return (
    <>
      {writing && progress !== null && progress.tail.length > 0 && (
        <pre aria-label={text.progressWriting(progress.elapsed, progress.chars)} className="qa-agent-stream mono">{progress.tail}</pre>
      )}
      {plan === null ? (
        !writing && <p className="qa-agent-idle">{text.noPlan}</p>
      ) : (
        <>
          <p className="qa-agent-line">
            <strong>{coversText(dock, text)}</strong>
            <span className="qa-agent-meta mono">{text.planMeta(plan.number, plan.actions.length, plan.facts)}</span>
          </p>
          {goals.length > 0 ? (
            <ol aria-label={text.goalsLabel} className="qa-agent-goals">
              {goals.map((goal) => (
                <li className={`qa-agent-goal qa-agent-goal--${goal.state}`} key={goal.name} title={goal.goal}>
                  <span aria-hidden="true" className="qa-agent-goal-glyph">{GOAL_GLYPHS[goal.state]}</span>
                  <span className="qa-agent-goal-text"><PeText text={pe} value={goal.goal} /></span>
                  {segmented && goal.step !== null && <span className="qa-agent-goal-step mono">{text.goalStep(goal.step)}</span>}
                  <span className="visually-hidden">{text.goalStates[goal.state]}</span>
                </li>
              ))}
            </ol>
          ) : (
            plan.summary && <p className="qa-agent-sub"><PeText text={pe} value={plan.summary} /></p>
          )}
        </>
      )}
      {refusal !== null && <p className="qa-agent-note"><PeText text={pe} value={text.refused(refusal.answer, refusal.reason)} /></p>}
    </>
  )
}

function Meter({ label, value, low, thin }: { label: ReactNode; value: number; low?: boolean; thin?: boolean }) {
  return (
    <div className={`qa-agent-meter${low ? ' is-low' : ''}${thin ? ' is-thin' : ''}`}>
      <span className="qa-agent-meter-label">{label}</span>
      <span className="qa-agent-bar"><i style={{ width: `${Math.round(value * 100)}%` }} /></span>
      <span className="qa-agent-meter-value mono">{value.toFixed(2)}</span>
    </div>
  )
}

function ExecutorBody({ dock, text, pe }: { dock: AgentDockState; text: Text; pe: PeTextProps }) {
  const { turn, repeat } = dock
  if (turn === null) return <p className="qa-agent-idle">{dock.executed ? text.finished : text.awaitingPlan}</p>
  const busy = turn.wait !== null && turn.wait >= BUSY_WAIT
  const others = agentOptions(turn).filter((option) => !option.picked).slice(0, OTHER_OPTIONS)
  return (
    <>
      <p className="qa-agent-line">
        <span className="qa-agent-picked">
          {turn.picked === null ? (
            <>{text.noOptions}{turn.scene !== null && <> <span className="qa-pe-scene">{turn.scene}</span></>}</>
          ) : (
            <PickedAction picked={turn.picked} text={pe} />
          )}
        </span>
        {turn.result !== null && (
          <span className={`qa-agent-result qa-agent-result--${turn.result}`}>{pe.results[turn.result] ?? turn.result}</span>
        )}
      </p>
      {turn.confidence !== null && <Meter label={text.probability} low={turn.confidence < LOW_CONFIDENCE} value={turn.confidence} />}
      {turn.wait !== null && <Meter label={text.wait} low={busy} thin value={turn.wait} />}
      {others.length > 0 && (
        <ul aria-label={text.others} className="qa-agent-options">
          {others.map((option) => (
            <li key={option.name}>
              <Meter label={<PickedAction picked={option.name} text={pe} />} thin value={option.probability ?? 0} />
            </li>
          ))}
        </ul>
      )}
      {(busy || (repeat !== null && repeat.count >= REPEAT_WARN)) && (
        <p className="qa-agent-chips">
          {busy && <span className="qa-agent-chip">{text.waited}</span>}
          {repeat !== null && repeat.count >= REPEAT_WARN && (
            <span className="qa-agent-chip qa-agent-chip--warning">{text.repeated(repeat.count)}</span>
          )}
        </p>
      )}
    </>
  )
}

function JudgementItem({ item, text, pe }: { item: AgentJudgement; text: Text; pe: PeTextProps }) {
  if (item.state === 'judged') {
    const { verdict } = item
    return (
      <li className={`qa-agent-judgement is-judged ${verdict.passed ? 'is-passed' : 'is-failed'}`}>
        <p className="qa-agent-judgement-head">
          <span aria-hidden="true">{verdict.passed ? '✓' : '✕'}</span>
          <strong>{text.verdict(verdict.step, verdict.passed)}</strong>
        </p>
        <p className="qa-agent-judgement-text"><PeText text={pe} value={verdict.message} /></p>
        {verdict.stopped && <p className="qa-agent-judgement-stop">{text.stopped(verdict.stopped)}</p>}
      </li>
    )
  }
  const judging = item.state === 'judging'
  return (
    <li className={`qa-agent-judgement is-${item.state}`}>
      <p className="qa-agent-judgement-head">
        {judging ? <Dots label={text.judgeStates.judging} /> : <span aria-hidden="true">○</span>}
        <strong>{text.step(item.step)}</strong>
        <span className="qa-agent-judgement-state">{text.judgeStates[item.state]}</span>
      </p>
      <p className="qa-agent-judgement-text">{judging ? text.judgeJudgingLine(item.step) : text.judgeWaitingLine(item.step)}</p>
    </li>
  )
}

/**
 * planner–executer 런에서 로그 창 자리에 들어가는 창. 지금 step 에서 무엇이 일어나는지를 위에서 아래로 쌓는다:
 * 계획(이 step 을 맡은 계획과 goal, 쓰는 동안은 진행), 실행(마지막 turn), 완료 조건, 그리고 판정 줄.
 * 판정은 뒤에서 앞 step 부터 하나씩 돌기 때문에, 끝난 판정·판정 중·판정 대기를 step 번호와 함께 차례로 쌓는다.
 */
export function QaAgentDock({ logs, live }: { logs: QaLog[]; live: boolean }) {
  const { t } = useI18n()
  const text = t.qa.run.agentDock
  const pe = t.qa.run.pe
  const dock = useMemo(() => deriveAgentDock(logs, live), [logs, live])
  const macros = useMemo(() => new Set((dock.plan?.actions ?? []).map(macroName)), [dock.plan])
  const busy = (section: 'planner' | 'executor') =>
    dock.active === section && dock.status !== null && !['handoff', 'reusing', 'finished'].includes(dock.status.kind)
  const plannerStatus = (() => {
    if (dock.active === 'planner' && dock.progress !== null && dock.status !== null && dock.status.kind !== 'handoff') {
      const { elapsed, chars } = dock.progress
      return chars > 0 ? text.progressWriting(elapsed, chars) : text.progressThinking(elapsed)
    }
    return dock.active === 'planner' && dock.status !== null ? statusText(dock.status, text, null) : text.waiting
  })()
  const executorStatus =
    dock.active === 'executor' && dock.status !== null ? statusText(dock.status, text, dock.turn?.turn ?? null) : text.waiting
  const judged = dock.judgements.filter((item) => item.state === 'judged')
  const older = Math.max(0, judged.length - SHOWN_JUDGED)
  const shown = [...judged.slice(older), ...dock.judgements.filter((item) => item.state !== 'judged')]
  const judging = dock.judgements.some((item) => item.state === 'judging')

  return (
    <PeMacroNames.Provider value={macros}>
      <section aria-label={text.title} className={`qa-agent-dock${dock.active === null ? ' qa-agent-dock--idle' : ''}`}>
        {dock.step !== null && <header className="qa-agent-dock-head mono">{text.step(dock.step)}</header>}
        <div aria-live="polite" className="qa-agent-stack">
          <Card agent="Planner" busy={busy('planner')} icon={<PlannerIcon />} label={text.sections.planner} on={dock.active === 'planner'} section="planner" status={plannerStatus} text={text}>
            <PlannerBody dock={dock} pe={pe} text={text} />
          </Card>
          <Card agent="Executor" busy={busy('executor')} icon={<ExecutorIcon />} label={text.sections.executor} on={dock.active === 'executor'} section="executor" status={executorStatus} text={text}>
            <ExecutorBody dock={dock} pe={pe} text={text} />
          </Card>
          <Card agent={null} busy={false} icon={<DoneIcon />} label={text.sections.done} on={dock.done} section="done" status={dock.step === null ? text.waiting : text.step(dock.step)} text={text}>
            <p className={`qa-agent-line qa-agent-done-state${dock.done ? ' is-met' : ''}`}>
              <strong><span aria-hidden="true">{dock.done ? '✓' : '○'}</span> {dock.done ? text.doneMet : text.doneOpen}</strong>
              <span className="qa-agent-sub">{dock.done ? text.doneMetText : text.doneOpenText}</span>
            </p>
          </Card>
          <Card agent="Evaluator" busy={judging && live} icon={<EvaluatorIcon />} label={text.sections.evaluator} on={judging && live} section="evaluator" status={text.background} text={text}>
            {shown.length === 0 ? (
              <p className="qa-agent-idle">{text.judgeEmpty}</p>
            ) : (
              <>
                {older > 0 && <p className="qa-agent-sub">{text.olderJudgements(older)}</p>}
                <ol className="qa-agent-judgements">
                  {shown.map((item) => (
                    <JudgementItem item={item} key={`${item.state}-${item.step}`} pe={pe} text={text} />
                  ))}
                </ol>
              </>
            )}
          </Card>
        </div>
      </section>
    </PeMacroNames.Provider>
  )
}
