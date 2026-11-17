import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { appPath } from '../appPath'
import { useI18n } from '../i18n/useI18n'
import { placeCallout, placeTag, ringOf, type Box } from './coachGeometry'
import { McpScene } from './McpScene'
import { START_TUTORIAL_STEPS, TUTORIAL_SKIP_PARAM, flatIndex, typeFields, type CoachContext, type TutorialAction } from './startTutorialSteps'
import { UnityScene } from './UnityScene'

const STEPS = START_TUTORIAL_STEPS
const TOTAL_ACTIONS = flatIndex(STEPS, STEPS.length, 0)
/** 짚을 자리가 이만큼 기다려도 안 뜨면 다음으로 넘길 수 있게 한다. */
const FIND_PATIENCE_MS = 6000
/** 화면이 바뀌며 짚던 자리를 잃었을 때 마지막 자리에 머무는 시간. */
const LOST_GRACE_MS = 450

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

  // 입력 장면에 들어가 칸이 보이면 예시 글을 사람이 치듯 한 글자씩 넣는다. 다 써지면 다음으로 갈 수 있다.
  const [typedKey, setTypedKey] = useState(-1)
  const typingDone = typedKey === flat
  const typingFor = useRef(-1)
  useEffect(() => {
    if (phase !== 'play' || action.kind !== 'fill' || target.element === null || typingFor.current === flat) return
    let cancelled = false
    typingFor.current = flat
    void typeFields(action.fields(ctx), () => cancelled).then(() => {
      if (!cancelled) setTypedKey(flat)
      else typingFor.current = -1
    })
    return () => {
      cancelled = true
    }
    // 칸을 찾은 그 순간 한 번만 시작한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat, phase, target.element !== null])

  // 짚은 버튼이 꺼져 있으면(이미 보냈거나 칸이 비었다) 눌러서 넘어갈 수 없으니 다음을 보여 준다.
  const targetDisabled = target.element instanceof HTMLButtonElement && target.element.disabled
  const clickToAdvance = phase === 'play' && !targetDisabled && (action.kind === 'click' || (action.kind === 'unity' && action.stage !== 'browser'))

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

  const viewport = useViewport()
  const ring = target.box === null ? null : ringOf(target.box, viewport)
  const lines = useMemo(() => (action.kind === 'mcp' ? action.lines(m) : null), [action, m])
  const scene = phase === 'play' && (action.kind === 'unity' || action.kind === 'mcp')
  const waiting = phase === 'play' && !scene && target.element === null

  // 화면이 바뀌는 동안 짚던 자리를 잠깐 잃는다. 그 사이 구멍을 가운데로 접었다가 다시 펴면 끊겨 보이므로, 잠깐은 마지막
  // 자리에 머물렀다가 새 자리를 찾으면 거기로 곧장 미끄러진다. 오래 못 찾을 때만 접는다.
  const [lastRing, setLastRing] = useState<{ ring: Box; token: number } | null>(null)
  const [lostToken, setLostToken] = useState(0)
  if (ring !== null && (lastRing === null || lastRing.token !== lostToken || !sameBox(lastRing.ring, ring))) {
    setLastRing({ ring, token: lostToken })
  }
  const ringPresent = ring !== null
  useEffect(() => {
    if (ringPresent) return undefined
    const timer = window.setTimeout(() => setLostToken((now) => now + 1), LOST_GRACE_MS)
    return () => window.clearTimeout(timer)
  }, [ringPresent, flat])
  const shown = ring ?? (lastRing !== null && lastRing.token === lostToken ? lastRing.ring : null)
  const open = shown !== null && phase === 'play' && !scene
  const hole: Box = open ? shown : { left: viewport.width / 2, top: viewport.height / 2, width: 0, height: 0 }

  const calloutRef = useRef<HTMLElement | null>(null)
  const calloutSize = useSize(calloutRef)
  const copy = phase === 'play' ? action.copy(m) : null
  const tag = copy !== null && 'tag' in copy && typeof copy.tag === 'string' ? copy.tag : null
  const placed = open
    ? placeCallout(hole, calloutSize, viewport)
    : { left: (viewport.width - calloutSize.width) / 2, top: viewport.height - calloutSize.height - 24, side: 'none' as const, arrow: 0 }

  // 짚는 자리에 바로 붙는 작은 말풍선. 설명 상자와 겹치지 않는 쪽에 둔다.
  const tagRef = useRef<HTMLSpanElement | null>(null)
  const tagSize = useSize(tagRef, { width: 110, height: 30 })
  const tagPlace = open && tag !== null
    ? placeTag(hole, tagSize, viewport, { left: placed.left, top: placed.top, width: calloutSize.width, height: calloutSize.height })
    : null

  const callout = phase === 'play' && copy !== null && (
    <section
      aria-label={m.player.label}
      className={`tut-callout tut-callout--${scene ? 'inline' : placed.side}`}
      ref={calloutRef}
      style={scene ? undefined : ({ left: placed.left, top: placed.top, '--tut-arrow': `${placed.arrow}px` } as React.CSSProperties)}
    >
      <header className="tut-callout-head">
        <span className="tut-callout-step">{m.player.stepLabel(position.step + 1, m.steps[step.id].name)}</span>
        <span className="tut-callout-count">{m.player.actionCount(position.action + 1, step.actions.length)}</span>
        <span className="tut-callout-badge" title={m.player.exampleTitle}>{m.player.example}</span>
        <button aria-label={m.player.close} className="tut-callout-close" onClick={onClose} title={m.player.closeTitle} type="button">×</button>
      </header>
      <div className="tut-callout-body" key={flat}>
        {position.action === 0 && !waiting && (
          <div className="tut-why">
            <b>{m.player.why}</b>
            <p>{m.steps[step.id].why}</p>
          </div>
        )}
        <h2 aria-live="polite">{waiting ? m.player.loading : copy.title}</h2>
        {!waiting && <p>{copy.body}</p>}
        {action.kind === 'mcp' && (
          <a
            className="tut-callout-link"
            href={appPath(`/setup?guide=skills&${TUTORIAL_SKIP_PARAM}=1`)}
            rel="noreferrer"
            target="_blank"
            title={m.player.mcpGuideTitle}
          >
            {m.player.mcpGuide} ↗
          </a>
        )}
      </div>
      <footer className="tut-callout-foot">
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
        <div className="tut-callout-actions">
          <button className="tut-link" disabled={position.action === 0} onClick={restartStep} type="button">{m.player.restartStep}</button>
          <span className="tut-spacer" />
          {action.kind === 'fill' && !typingDone && !waiting ? (
            <span className="tut-hint">{m.player.typing}</span>
          ) : clickToAdvance && !waiting ? (
            <span className="tut-hint">{m.player.clickHint}</span>
          ) : (
            (!waiting || target.patienceOver) && (
              <button autoFocus className="button button--primary button--compact" onClick={next} type="button">{m.player.next}</button>
            )
          )}
        </div>
      </footer>
    </section>
  )

  return createPortal(
    <div className="tut">
      {/* 보이는 덮개: 구멍 둘레의 큰 그림자다. transform 으로 옮겨 앱이 화면을 그리느라 바쁠 때도 미끄러짐이 끊기지 않는다. */}
      <div
        aria-hidden="true"
        className={'tut-spot' + (open ? ' is-open' : '')}
        style={{ transform: `translate(${hole.left}px, ${hole.top}px)`, width: hole.width, height: hole.height }}
      />
      {tagPlace !== null && (
        <span
          aria-hidden="true"
          className={`tut-tag tut-tag--${tagPlace.side}`}
          key={`tag-${flat}`}
          ref={tagRef}
          style={{ transform: `translate(${tagPlace.left}px, ${tagPlace.top}px)` }}
        >
          {tag}
        </span>
      )}
      {/* 클릭 막이: 보이지 않고, 짚는 자리만 뚫어 그 자리는 실제로 눌린다. 읽기만 하는 자리는 뚫지 않는다. */}
      <div
        aria-hidden="true"
        className="tut-veil"
        style={open && action.kind !== 'look' ? { clipPath: holePath(hole, viewport) } : undefined}
      />

      {phase === 'play' && action.kind === 'unity' && (
        <div className="tut-scene">
          <div className="tut-scene-frame">
            <UnityScene key={action.stage} onAdvance={next} stage={action.stage} />
          </div>
          {callout}
        </div>
      )}
      {phase === 'play' && lines !== null && (
        <div className="tut-scene">
          <McpScene key={flat} lines={lines} />
          {callout}
        </div>
      )}
      {!scene && callout}

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
    </div>,
    document.body,
  )
}

/**
 * 화면 전체를 덮고 고리 자리만 뚫는 모양. 꼭짓점 수가 늘 같아서 자리가 바뀔 때 CSS 전환으로 부드럽게 옮겨 간다.
 */
function holePath(hole: Box, viewport: { width: number; height: number }): string {
  const l = hole.left
  const t = hole.top
  const r = hole.left + hole.width
  const b = hole.top + hole.height
  return `polygon(evenodd, 0 0, ${viewport.width}px 0, ${viewport.width}px ${viewport.height}px, 0 ${viewport.height}px, 0 0, ${l}px ${t}px, ${l}px ${b}px, ${r}px ${b}px, ${r}px ${t}px, ${l}px ${t}px)`
}

function sameBox(a: Box, b: Box): boolean {
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height
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

function useSize(ref: React.RefObject<HTMLElement | null>, initial = { width: 380, height: 240 }) {
  const [size, setSize] = useState(initial)
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return undefined
    const observer = new ResizeObserver(() => setSize({ width: element.offsetWidth, height: element.offsetHeight }))
    observer.observe(element)
    return () => observer.disconnect()
  })
  return size
}
