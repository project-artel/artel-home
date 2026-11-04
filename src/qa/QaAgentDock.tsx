import { useMemo, type ReactNode } from 'react'
import { useI18n } from '../i18n/useI18n'
import { PeMacroNames } from './peMacroNames'
import { PeText, PickedAction } from './PeText'
import { macroName } from './peWords'
import {
  agentOptions,
  deriveAgentDock,
  isAgentRun,
  type AgentDockState,
  type AgentEdge,
  type AgentName,
  type AgentStatus,
} from './agentDockState'
import type { QaLog } from './qaTypes'
import './qaAgentDock.css'

/** confidence 가 이보다 낮으면 눈에 띄게 그린다. 재질의 실측에서 되풀이 turn 이 0.38~0.60 이었다. */
const LOW_CONFIDENCE = 0.6

type Text = ReturnType<typeof useI18n>['t']['qa']['run']['agentDock']

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
    case 'turn':
      return text.turn(turn ?? 0)
    case 'judging':
      return text.judging
    case 'judged':
      return text.judged
  }
}

function PlannerIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24" width="22">
      <path d="M4 5.5 9.5 3.5l5 2 5.5-2v15l-5.5 2-5-2L4 20.5z" />
      <path d="M9.5 3.5v15" />
      <path d="M14.5 5.5v15" />
    </svg>
  )
}

function ExecutorIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24" width="24">
      <path d="M7 7h10a5 5 0 0 1 5 5v2.5a3 3 0 0 1-5.4 1.8L15 14H9l-1.6 2.3A3 3 0 0 1 2 14.5V12a5 5 0 0 1 5-5z" />
      <path d="M7.5 10v3" />
      <path d="M6 11.5h3" />
      <path d="M16 10.5h.01" />
      <path d="M18 12.5h.01" />
    </svg>
  )
}

function EvaluatorIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24" width="22">
      <circle cx="10.5" cy="10.5" r="7" />
      <path d="m15.7 15.7 5.3 5.3" />
      <path d="m7.5 10.5 2.2 2.2 3.8-4.2" />
    </svg>
  )
}

/** 에이전트 머리: 아이콘, 이름, 지금 상태. 행동 중이면 아이콘에 테두리, 이름 옆에 점 셋이 붙는다. */
function AgentHead({
  name,
  label,
  icon,
  dock,
  text,
}: {
  name: AgentName
  label: string
  icon: ReactNode
  dock: AgentDockState
  text: Text
}) {
  const on = dock.active === name
  const busy = on && dock.status?.kind !== 'judged'
  return (
    <div className="qa-agent-who">
      <span className={`qa-agent-icon qa-agent-icon--${name}`}>{icon}</span>
      <span className="qa-agent-name">
        <strong className={`qa-agent-label--${name}`}>
          {label}
          {busy && (
            <span aria-label={text.active} className="qa-agent-dots" role="img">
              <i />
              <i />
              <i />
            </span>
          )}
        </strong>
        <span className="qa-agent-status">
          {on && dock.status !== null ? statusText(dock.status, text, dock.turn?.turn ?? null) : text.waiting}
        </span>
      </span>
    </div>
  )
}

/** 두 에이전트 사이의 선. 무엇이 넘어가는 중이면 밝아지고 점이 그 방향으로 움직인다. */
function AgentLine({ tag, direction }: { tag: string | null; direction: 'right' | 'left' | null }) {
  return (
    <div className={`qa-agent-line${direction === null ? '' : ' qa-agent-line--on'}`}>
      <span className="qa-agent-line-tag mono">{tag}</span>
      <span className="qa-agent-line-track">
        {direction !== null && <i className={`qa-agent-line-dot qa-agent-line-dot--${direction}`} />}
      </span>
    </div>
  )
}

function edgeTag(edge: AgentEdge, text: Text): string {
  if (edge.kind === 'plan') return `${text.planTag(edge.plan, edge.actions)} →`
  const reads = edge.reads === null ? 'evidence' : text.evidenceTag(edge.reads)
  return edge.kind === 'replan' ? `← ${reads}` : `${reads} →`
}

/** 하단 고정 창. planner–executer 런에서만 보이고, 세 에이전트의 지금 상태만 그린다. */
export function QaAgentDock({ logs, live }: { logs: QaLog[]; live: boolean }) {
  const { t } = useI18n()
  const text = t.qa.run.agentDock
  const pe = t.qa.run.pe
  const dock = useMemo(() => deriveAgentDock(logs, live), [logs, live])
  const macros = useMemo(() => new Set((dock.plan?.actions ?? []).map(macroName)), [dock.plan])
  if (!isAgentRun(logs)) return null

  const firstEdge = dock.edge === null || dock.edge.kind === 'evaluate' ? null : dock.edge
  const lastEdge = dock.edge?.kind === 'evaluate' ? dock.edge : null
  const { plan, refusal, turn, verdict } = dock
  const low = turn?.confidence !== null && turn?.confidence !== undefined && turn.confidence < LOW_CONFIDENCE

  return (
    <PeMacroNames.Provider value={macros}>
      <section aria-label={text.title} className={`qa-agent-dock${dock.active === null ? ' qa-agent-dock--idle' : ''}`}>
        <header className="qa-agent-dock-head">
          <strong>{text.title}</strong>
          {dock.step !== null && <span className="mono">{text.step(dock.step)}</span>}
        </header>
        <div className="qa-agent-scroll">
          <div aria-live="polite" className="qa-agent-grid">
            <div className={`qa-agent-top${dock.active === 'planner' ? ' is-on' : ''}`}>
              <AgentHead dock={dock} icon={<PlannerIcon />} label="Planner" name="planner" text={text} />
              <AgentLine direction={firstEdge === null ? null : firstEdge.kind === 'plan' ? 'right' : 'left'} tag={firstEdge === null ? null : edgeTag(firstEdge, text)} />
            </div>
            <div className={`qa-agent-top${dock.active === 'executor' ? ' is-on' : ''}`}>
              <AgentHead dock={dock} icon={<ExecutorIcon />} label="Executor" name="executor" text={text} />
              <AgentLine direction={lastEdge === null ? null : 'right'} tag={lastEdge === null ? null : edgeTag(lastEdge, text)} />
            </div>
            <div className={`qa-agent-top${dock.active === 'evaluator' ? ' is-on' : ''}`}>
              <AgentHead dock={dock} icon={<EvaluatorIcon />} label="Evaluator" name="evaluator" text={text} />
            </div>

            <div className={`qa-agent-stem${dock.active === 'planner' ? ' is-on' : ''}`}>
              <div className="qa-agent-block">
                <div className="qa-agent-block-title">
                  <strong>{plan === null ? text.noPlan : text.plan(plan.number)}</strong>
                  {plan !== null && <span className="mono">{text.planMeta(plan.actions.length, plan.facts)}</span>}
                </div>
                {plan?.summary && <p><PeText text={pe} value={plan.summary} /></p>}
              </div>
              {refusal !== null && (
                <div className="qa-agent-note"><PeText text={pe} value={text.refused(refusal.answer, refusal.reason)} /></div>
              )}
            </div>

            <div className={`qa-agent-stem${dock.active === 'executor' ? ' is-on' : ''}`}>
              {turn === null ? (
                <div className="qa-agent-block qa-agent-block--idle">{dock.executed ? text.finished : text.awaitingPlan}</div>
              ) : (
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
                    <div className={`qa-agent-confidence${low ? ' is-low' : ''}`}>
                      <span>{text.confidence}</span>
                      <span className="qa-agent-bar"><i style={{ width: `${Math.round(turn.confidence * 100)}%` }} /></span>
                      <span className="mono">{turn.confidence.toFixed(2)}</span>
                    </div>
                  )}
                  <ul className="qa-agent-options">
                    {agentOptions(turn).map((option) => (
                      <li className={option.picked ? 'is-picked' : ''} key={option.name}>
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
                </div>
              )}
            </div>

            <div className={`qa-agent-stem${dock.active === 'evaluator' ? ' is-on' : ''}`}>
              <div className="qa-agent-block">
                <strong className="qa-agent-verdict">{verdict === null ? text.noVerdict : text.verdict(verdict.step, verdict.passed)}</strong>
                {verdict !== null && <p><PeText text={pe} value={verdict.message} /></p>}
                {verdict?.stopped && <p className="qa-agent-done">{text.stopped(verdict.stopped)}</p>}
              </div>
            </div>
          </div>
        </div>
      </section>
    </PeMacroNames.Provider>
  )
}
