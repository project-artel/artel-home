import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { dockFor, placeTag, ringOf, veilPieces, type Box } from './coachGeometry'
import { McpScene } from './McpScene'
import { START_TUTORIAL_STEPS, flatIndex, type CoachContext, type TutorialAction } from './startTutorialSteps'
import { UnityScene } from './UnityScene'

const STEPS = START_TUTORIAL_STEPS
const TOTAL_ACTIONS = flatIndex(STEPS, STEPS.length, 0)
/** 짚을 자리가 이만큼 기다려도 안 뜨면 다음으로 넘길 수 있게 한다. */
const FIND_PATIENCE_MS = 6000

type Position = { step: number; action: number }

/**
 * 실제 서비스 화면 위에 덧씌우는 시작 튜토리얼(ARTEL-1461).
 *
 * - 짚는 자리 밖은 흐리게 덮고, 그 자리만 비워 실제 화면을 직접 누르게 한다. 읽기만 하는 자리는 눌리지 않게 막는다.
 * - 안내 줄은 짚는 자리를 가리지 않는 쪽(위 · 아래)에 붙는다.
 * - 화면 데이터는 목데이터다(`tutorialMode`). 부르는 쪽이 들어가고 나오는 일을 맡는다.
 */
export function TutorialCoach({
  base,
  firstRun,
  phase,
  onClose,
  onStart,
  onPhase,
}: {
  base: string
  firstRun: boolean
  phase: 'intro' | 'play' | 'done'
  onClose: () => void
  onStart: () => void
  onPhase: (phase: 'intro' | 'play' | 'done') => void
}) {
  const { t } = useI18n()
  const m = t.tutorial
  const titleId = useId()
  const navigate = useNavigate()
  const location = useLocation()
  const [position, setPosition] = useState<Position>({ step: 0, action: 0 })
  const [reached, setReached] = useState(0)
  const step = STEPS[position.step]
  const action = step.actions[position.action]
  const flat = flatIndex(STEPS, position.step, position.action)
  const ctx = useMemo<CoachContext>(() => ({ t, base }), [t, base])

  const goTo = useCallback((next: Position) => {
    setPosition(next)
    setReached((now) => Math.max(now, flatIndex(STEPS, next.step, next.action)))
  }, [])

  const next = useCallback(() => {
    if (position.action + 1 < step.actions.length) goTo({ step: position.step, action: position.action + 1 })
    else if (position.step + 1 < STEPS.length) goTo({ step: position.step + 1, action: 0 })
    else onPhase('done')
  }, [goTo, onPhase, position, step.actions.length])

  const restartStep = useCallback(() => {
    setPosition({ step: position.step, action: 0 })
  }, [position.step])

  // 이 동작이 있어야 할 화면으로 옮긴다. 단계 첫 동작 · 이 단계 처음부터 · 단계로 바로 가기가 이것을 쓴다.
  const wanted = phase === 'play' && action.at !== undefined ? action.at(ctx) : null
  useEffect(() => {
    if (wanted !== null && location.pathname !== wanted) navigate(wanted)
    // 같은 동작에서 사용자가 다른 화면으로 옮겨 가도 끌고 오지 않는다. 동작이 바뀔 때만 옮긴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat, phase])

  const target = useTarget(phase === 'play' ? action : null, ctx, flat)

  // 사용자가 빛나는 자리를 직접 누르면 넘어간다. 화면이 먼저 반응하도록 다음 차례에 넘긴다.
  useEffect(() => {
    if (phase !== 'play' || action.kind !== 'click' || target.element === null) return undefined
    const element = target.element
    function onClick(event: MouseEvent) {
      if (event.target instanceof Node && element.contains(event.target)) window.setTimeout(next, 0)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [action.kind, next, phase, target.element])

  const clickToAdvance = phase === 'play' && (action.kind === 'click' || (action.kind === 'unity' && action.stage !== 'browser'))

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      } else if (event.key === 'ArrowRight' && phase === 'play' && !clickToAdvance) {
        event.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [clickToAdvance, next, onClose, phase])

  const hudRef = useRef<HTMLDivElement | null>(null)
  const hudHeight = useHeight(hudRef, 128)
  const viewport = useViewport()
  const ring = target.box === null ? null : ringOf(target.box, viewport)
  const dock = dockFor(ring, viewport, hudHeight)

  const tagRef = useRef<HTMLSpanElement | null>(null)
  const tagSize = useSize(tagRef)
  const copy = phase === 'play' ? action.copy(m) : null
  const tag = copy !== null && 'tag' in copy && typeof copy.tag === 'string' ? copy.tag : null
  const tagPlace = ring === null ? null : placeTag(ring, tagSize, viewport, { dock, height: hudHeight })

  const lines = useMemo(() => (action.kind === 'mcp' ? action.lines(m) : null), [action, m])
  const scene = phase === 'play' && (action.kind === 'unity' || action.kind === 'mcp')
  const waiting = phase === 'play' && !scene && target.element === null

  return createPortal(
    <div className="tut" data-dock={dock}>
      {/* 덮개: 짚는 자리만 비운다. 자리를 아직 못 찾았거나 장면 · 안내 카드가 뜬 동안은 통째로 덮는다. */}
      {ring !== null && !scene && phase === 'play' ? (
        veilPieces(ring, viewport).map((piece, index) => <div aria-hidden="true" className="tut-veil" key={index} style={box(piece)} />)
      ) : (
        <div aria-hidden="true" className="tut-veil tut-veil--full" />
      )}
      {ring !== null && phase === 'play' && !scene && (
        <>
          <div aria-hidden="true" className="tut-ring" key={`ring-${flat}`} style={box(ring)} />
          {action.kind === 'look' && <div aria-hidden="true" className="tut-block" style={box(ring)} />}
          {tag !== null && (
            <span aria-hidden="true" className="tut-tag" key={`tag-${flat}`} ref={tagRef} style={tagPlace === null ? undefined : { left: tagPlace.left, top: tagPlace.top }}>
              {tag}
            </span>
          )}
        </>
      )}

      {phase === 'play' && action.kind === 'unity' && (
        <div className="tut-scene">
          <div className="tut-scene-frame">
            <UnityScene key={action.stage} onAdvance={next} stage={action.stage} />
          </div>
        </div>
      )}
      {phase === 'play' && lines !== null && (
        <div className="tut-scene">
          <McpScene key={flat} lines={lines} />
        </div>
      )}

      {phase === 'intro' && (
        <div aria-labelledby={titleId} aria-modal="true" className="tut-card" role="dialog">
          <span className="tut-card-eyebrow">{m.player.introEyebrow}</span>
          <h2 id={titleId}>{m.player.introTitle}</h2>
          <p>{m.player.introBody}</p>
          <ol className="tut-card-steps">
            {STEPS.map((one, index) => (
              <li key={one.id}><span>{index + 1}</span>{m.steps[one.id].name}</li>
            ))}
          </ol>
          <div className="tut-card-actions">
            <button className="button button--secondary" onClick={onClose} type="button">{m.player.introLater}</button>
            <button autoFocus className="button button--primary" onClick={onStart} type="button">{m.player.introStart}</button>
          </div>
        </div>
      )}
      {phase === 'done' && (
        <div aria-labelledby={titleId} aria-modal="true" className="tut-card" role="dialog">
          <span className="tut-card-eyebrow">{m.player.doneEyebrow(STEPS.length)}</span>
          <h2 id={titleId}>{m.player.doneTitle}</h2>
          <p>{m.player.doneBody}</p>
          <div className="tut-card-actions">
            <button
              className="button button--secondary"
              onClick={() => {
                setPosition({ step: 0, action: 0 })
                onPhase('play')
              }}
              type="button"
            >
              {m.player.doneAgain}
            </button>
            <button autoFocus className="button button--primary" onClick={onClose} type="button">{m.player.doneClose}</button>
          </div>
        </div>
      )}

      {phase === 'play' && copy !== null && (
        <section aria-label={m.player.label} className={`tut-hud tut-hud--${dock}`} ref={hudRef}>
          <div className="tut-hud-copy">
            <div className="tut-hud-meta">
              <span className="tut-hud-step">{m.player.stepLabel(position.step + 1, m.steps[step.id].name)}</span>
              <span className="tut-hud-count">{m.player.actionCount(position.action + 1, step.actions.length)}</span>
              <span className="tut-hud-badge">{m.player.example}</span>
            </div>
            <h2 aria-live="polite">{waiting ? m.player.loading : copy.title}</h2>
            {!waiting && <p>{copy.body}</p>}
          </div>
          <div className="tut-hud-side">
            <ol aria-label={m.player.steps} className="tut-steps">
              {STEPS.map((one, index) => {
                const locked = firstRun && flatIndex(STEPS, index, 0) > reached
                const current = index === position.step
                const done = flatIndex(STEPS, index + 1, 0) <= reached && !current
                return (
                  <li key={one.id}>
                    <button
                      aria-current={current ? 'step' : undefined}
                      aria-label={m.player.stepLabel(index + 1, m.steps[one.id].name)}
                      className={'tut-step' + (current ? ' is-current' : '') + (done ? ' is-done' : '')}
                      disabled={locked}
                      onClick={() => goTo({ step: index, action: 0 })}
                      title={locked ? m.player.lockedStep : m.steps[one.id].name}
                      type="button"
                    >
                      {index + 1}
                    </button>
                  </li>
                )
              })}
            </ol>
            <div aria-hidden="true" className="tut-progress"><span style={{ width: `${((flat + 1) / TOTAL_ACTIONS) * 100}%` }} /></div>
            <div className="tut-hud-buttons">
              <button className="tut-link" onClick={onClose} title={m.player.closeTitle} type="button">{m.player.close}</button>
              <button className="tut-link" disabled={position.action === 0} onClick={restartStep} type="button">{m.player.restartStep}</button>
              {action.kind === 'fill' && (
                <button className="button button--secondary button--compact" onClick={() => void action.fill(ctx)} type="button">{m.player.fill}</button>
              )}
              {clickToAdvance && !waiting ? (
                <span className="tut-hint">{m.player.clickHint}</span>
              ) : (
                (!waiting || target.patienceOver) && (
                  <button className="button button--primary button--compact" onClick={next} type="button">{m.player.next}</button>
                )
              )}
            </div>
          </div>
        </section>
      )}
    </div>,
    document.body,
  )
}

function box(rect: Box): React.CSSProperties {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

/**
 * 짚을 요소를 찾고 화면 위 자리를 따라간다. 화면이 데이터를 받아 그려지기까지, 또 스크롤 · 크기 변경 · 움직임을 따라
 * 매 프레임 다시 잰다(값이 바뀔 때만 다시 그린다). 처음 찾으면 화면 가운데로 데려온다.
 */
function useTarget(action: TutorialAction | null, ctx: CoachContext, key: number) {
  const [state, setState] = useState<{ key: number; element: Element | null; box: Box | null; patienceOver: boolean }>({
    key,
    element: null,
    box: null,
    patienceOver: false,
  })
  if (state.key !== key) setState({ key, element: null, box: null, patienceOver: false })

  const find = action === null || action.kind === 'unity' || action.kind === 'mcp' ? null : action.target

  useEffect(() => {
    if (find === null) return undefined
    let frame = 0
    let scrolled: Element | null = null
    const started = performance.now()
    const tick = () => {
      const element = find(ctx)
      const rect = element?.getBoundingClientRect()
      const usable = element !== null && rect !== undefined && (rect.width > 0 || rect.height > 0)
      if (usable && scrolled !== element) {
        scrolled = element
        element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      }
      const nextBox = usable ? { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) } : null
      const patienceOver = performance.now() - started > FIND_PATIENCE_MS
      setState((now) => {
        if (now.key !== key) return now
        const same = now.element === (usable ? element : null)
          && now.patienceOver === patienceOver
          && (now.box === nextBox || (now.box !== null && nextBox !== null && now.box.left === nextBox.left && now.box.top === nextBox.top && now.box.width === nextBox.width && now.box.height === nextBox.height))
        return same ? now : { key, element: usable ? element : null, box: nextBox, patienceOver }
      })
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [ctx, find, key])

  return state
}

function useViewport() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight })
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}

function useHeight(ref: React.RefObject<HTMLElement | null>, fallback: number): number {
  const [height, setHeight] = useState(fallback)
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return undefined
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight))
    observer.observe(element)
    return () => observer.disconnect()
  })
  return height
}

function useSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 120, height: 30 })
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return undefined
    const observer = new ResizeObserver(() => setSize({ width: element.offsetWidth, height: element.offsetHeight }))
    observer.observe(element)
    return () => observer.disconnect()
  })
  return size
}
