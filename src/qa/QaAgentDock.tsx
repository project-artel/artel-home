import { useMemo, type ReactNode } from 'react'
import { useI18n } from '../i18n/useI18n'
import { PeMacroNames } from './peMacroNames'
import { PeText, PickedAction } from './PeText'
import { macroName } from './peWords'
import { agentGoals, agentOptions, deriveAgentDock, type AgentDockState, type AgentStatus } from './agentDockState'
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

/** 칸 머리: 아이콘, 칸 이름과 에이전트 이름, 지금 상태. 행동 중이면 아이콘에 테두리, 이름 옆에 점 셋이 붙는다. */
function SectionHead({
  section,
  label,
  agent,
  icon,
  status,
  busy,
  text,
}: {
  section: Section
  label: string
  agent: string | null
  icon: ReactNode
  status: string
  busy: boolean
  text: Text
}) {
  return (
    <div className="qa-agent-who">
      <span className={`qa-agent-icon qa-agent-icon--${section}`}>{icon}</span>
      <span className="qa-agent-name">
        <strong className={`qa-agent-label--${section}`}>
          {label}
          {agent !== null && <span className="qa-agent-code mono">{agent}</span>}
          {busy && (
            <span aria-label={text.active} className="qa-agent-dots" role="img">
              <i />
              <i />
              <i />
            </span>
          )}
        </strong>
        <span className="qa-agent-status">{status}</span>
      </span>
    </div>
  )
}

function coversText(dock: AgentDockState, text: Text): string {
  const covers = dock.plan?.covers ?? []
  if (covers.length > 1) return text.covers(covers[0], covers[covers.length - 1])
  return text.coversOne(dock.plan?.step ?? dock.step ?? 0)
}

const GOAL_GLYPHS = { done: '✓', current: '●', next: '○' } as const

function PlannerBody({ dock, text, pe }: { dock: AgentDockState; text: Text; pe: PeTextProps }) {
  const { plan, refusal } = dock
  const goals = agentGoals(dock)
  const segmented = (plan?.covers.length ?? 0) > 1
  return (
    <>
      <div className="qa-agent-block qa-agent-block--wide">
        <div className="qa-agent-block-title">
          <strong>{plan === null ? text.noPlan : coversText(dock, text)}</strong>
          {plan !== null && <span className="mono">{text.planMeta(plan.number, plan.actions.length, plan.facts)}</span>}
        </div>
        {goals.length > 0 ? (
          <ol aria-label={text.goalsLabel} className="qa-agent-goals">
            {goals.map((goal) => (
              <li className={`qa-agent-goal qa-agent-goal--${goal.state}`} key={goal.name} title={goal.name}>
                <span aria-hidden="true" className="qa-agent-goal-glyph">{GOAL_GLYPHS[goal.state]}</span>
                <span className="qa-agent-goal-text">
                  <PeText text={pe} value={goal.goal} />
                </span>
                {segmented && goal.step !== null && <span className="qa-agent-goal-step mono">{text.goalStep(goal.step)}</span>}
                <span className="visually-hidden">{text.goalStates[goal.state]}</span>
              </li>
            ))}
          </ol>
        ) : (
          plan?.summary && <p><PeText text={pe} value={plan.summary} /></p>
        )}
      </div>
      {refusal !== null && (
        <div className="qa-agent-note"><PeText text={pe} value={text.refused(refusal.answer, refusal.reason)} /></div>
      )}
    </>
  )
}

type PeTextProps = ReturnType<typeof useI18n>['t']['qa']['run']['pe']

function ExecutorBody({ dock, text, pe }: { dock: AgentDockState; text: Text; pe: PeTextProps }) {
  const { turn, repeat } = dock
  if (turn === null) {
    return <div className="qa-agent-block qa-agent-block--idle">{dock.executed ? text.finished : text.awaitingPlan}</div>
  }
  const low = turn.confidence !== null && turn.confidence < LOW_CONFIDENCE
  const busy = turn.wait !== null && turn.wait >= BUSY_WAIT
  const others = agentOptions(turn).filter((option) => !option.picked).slice(0, OTHER_OPTIONS)
  return (
    <>
      <div className="qa-agent-block qa-agent-block--wide">
        <div className="qa-agent-action">
          <span className="mono qa-agent-turn">t{turn.turn}</span>
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
        </div>
        {turn.confidence !== null && (
          <div className={`qa-agent-meter${low ? ' is-low' : ''}`}>
            <span>{text.probability}</span>
            <span className="qa-agent-bar"><i style={{ width: `${Math.round(turn.confidence * 100)}%` }} /></span>
            <span className="mono">{turn.confidence.toFixed(2)}</span>
          </div>
        )}
        {turn.wait !== null && (
          <div className={`qa-agent-meter qa-agent-meter--wait${busy ? ' is-low' : ''}`}>
            <span>{text.wait}</span>
            <span className="qa-agent-bar qa-agent-bar--thin"><i style={{ width: `${Math.round(turn.wait * 100)}%` }} /></span>
            <span className="mono">{turn.wait.toFixed(2)}</span>
          </div>
        )}
        {others.length > 0 && (
          <ul aria-label={text.others} className="qa-agent-options">
            {others.map((option) => (
              <li key={option.name}>
                <span className="qa-agent-option-name"><PickedAction picked={option.name} text={pe} /></span>
                {option.probability !== null && (
                  <>
                    <span className="qa-agent-bar qa-agent-bar--thin"><i style={{ width: `${Math.round(option.probability * 100)}%` }} /></span>
                    <span className="mono">{option.probability.toFixed(2)}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {(busy || (repeat !== null && repeat.count >= REPEAT_WARN)) && (
        <div className="qa-agent-chips">
          {busy && <span className="qa-agent-chip">{text.waited}</span>}
          {repeat !== null && repeat.count >= REPEAT_WARN && (
            <span className="qa-agent-chip qa-agent-chip--warning">
              <span aria-hidden="true">⟳</span> {text.repeated(repeat.count)}
            </span>
          )}
        </div>
      )}
    </>
  )
}

/**
 * planner–executer 런에서 로그 창 자리에 들어가는 창. 지금 step 에서 무엇이 일어나는지를 네 칸으로 그린다:
 * 이 step 을 맡은 계획과 goal, Executor 의 마지막 turn, `done` 여부, 뒤에서 도는 판정.
 */
export function QaAgentDock({ logs, live }: { logs: QaLog[]; live: boolean }) {
  const { t } = useI18n()
  const text = t.qa.run.agentDock
  const pe = t.qa.run.pe
  const dock = useMemo(() => deriveAgentDock(logs, live), [logs, live])
  const macros = useMemo(() => new Set((dock.plan?.actions ?? []).map(macroName)), [dock.plan])
  const { verdict, pending } = dock
  const busy = (section: 'planner' | 'executor') =>
    dock.active === section && dock.status !== null && !['handoff', 'reusing', 'finished'].includes(dock.status.kind)
  const status = (section: 'planner' | 'executor') =>
    dock.active === section && dock.status !== null ? statusText(dock.status, text, dock.turn?.turn ?? null) : text.waiting
  const judging = pending !== null && pending.played

  return (
    <PeMacroNames.Provider value={macros}>
      <section aria-label={text.title} className={`qa-agent-dock${dock.active === null ? ' qa-agent-dock--idle' : ''}`}>
        {dock.step !== null && <header className="qa-agent-dock-head mono">{text.step(dock.step)}</header>}
        <div aria-live="polite" className="qa-agent-rows">
          <div className={`qa-agent-row qa-agent-row--planner${dock.active === 'planner' ? ' is-on' : ''}`}>
            <SectionHead agent="Planner" busy={busy('planner')} icon={<PlannerIcon />} label={text.sections.planner} section="planner" status={status('planner')} text={text} />
            <div className="qa-agent-stem">
              <PlannerBody dock={dock} pe={pe} text={text} />
            </div>
          </div>

          <div className={`qa-agent-row qa-agent-row--executor${dock.active === 'executor' ? ' is-on' : ''}`}>
            <SectionHead agent="Executor" busy={busy('executor')} icon={<ExecutorIcon />} label={text.sections.executor} section="executor" status={status('executor')} text={text} />
            <div className="qa-agent-stem">
              <ExecutorBody dock={dock} pe={pe} text={text} />
            </div>
          </div>

          <div className={`qa-agent-row qa-agent-row--done${dock.done ? ' is-on' : ''}`}>
            <SectionHead
              agent={null}
              busy={false}
              icon={<DoneIcon />}
              label={text.sections.done}
              section="done"
              status={dock.step === null ? text.waiting : text.step(dock.step)}
              text={text}
            />
            <div className="qa-agent-stem">
              {dock.step === null ? (
                <div className="qa-agent-block qa-agent-block--idle">{text.doneOpenText}</div>
              ) : (
                <div className={`qa-agent-block qa-agent-block--wide qa-agent-done-state${dock.done ? ' is-met' : ''}`}>
                  <strong>
                    <span aria-hidden="true">{dock.done ? '✓' : '○'}</span> {dock.done ? text.doneMet : text.doneOpen}
                  </strong>
                  <span>{dock.done ? text.doneMetText : text.doneOpenText}</span>
                </div>
              )}
            </div>
          </div>

          <div className={`qa-agent-row qa-agent-row--evaluator${judging && live ? ' is-on' : ''}`}>
            <SectionHead
              agent="Evaluator"
              busy={judging && live}
              icon={<EvaluatorIcon />}
              label={text.sections.evaluator}
              section="evaluator"
              status={judging ? text.judging(pending.step) : text.background}
              text={text}
            />
            <div className="qa-agent-stem">
              <div className="qa-agent-block qa-agent-block--wide">
                <strong className={`qa-agent-verdict${verdict === null ? '' : verdict.passed ? ' is-passed' : ' is-failed'}`}>
                  {verdict !== null && <span aria-hidden="true">{verdict.passed ? '✓ ' : '✕ '}</span>}
                  {verdict === null ? text.noVerdict : text.verdict(verdict.step, verdict.passed)}
                </strong>
                {verdict !== null && <p className="qa-agent-verdict-text"><PeText text={pe} value={verdict.message} /></p>}
                {verdict?.stopped && <p className="qa-agent-done">{text.stopped(verdict.stopped)}</p>}
                {/* 실행이 끝난 step 은 머리에 "판정 중" 으로 이미 보인다. */}
                {pending !== null && !pending.played && <p className="qa-agent-next">{text.nextJudge(pending.step, false)}</p>}
              </div>
            </div>
          </div>
        </div>
      </section>
    </PeMacroNames.Provider>
  )
}
