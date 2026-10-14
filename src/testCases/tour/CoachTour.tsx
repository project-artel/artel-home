import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../i18n/useI18n'
import { holeClipPath, holeOf, placeBubble, type Rect } from './tourGeometry'

export type TourStep = {
  id: string
  /** 밝게 남길 요소의 CSS 선택자. 없거나 화면에 없으면 말풍선만 가운데에 뜬다. */
  target?: string
  title: string
  body: string
}

/**
 * 게임 튜토리얼 같은 안내(ARTEL-1033). 화면을 흐리게 덮고 설명할 기능만 뚫어 밝게 두며, 그 옆 말풍선이 무엇인지
 * 말한다.
 *
 * - 말풍선 머리에 "3 / 13" 과 진행 점이 있다. 점을 누르면 그 단계로 간다.
 * - 이전 · 이 단계 건너뛰기 · 다음(마지막은 완료) 과 튜토리얼 건너뛰기가 있다. ← → 와 Esc 도 같다.
 * - 대상이 움직이면(스크롤 · 크기 변경 · 창 접기) 따라간다.
 */
export function CoachTour({
  index,
  onFinish,
  onIndex,
  steps,
}: {
  index: number
  onFinish: (how: 'done' | 'skipped') => void
  onIndex: (index: number) => void
  steps: readonly TourStep[]
}) {
  const { t } = useI18n()
  const m = t.testCases.tour.controls
  const step = steps[index]
  const [hole, setHole] = useState<Rect | null>(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [bubbleSize, setBubbleSize] = useState({ width: 360, height: 220 })
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const last = index === steps.length - 1

  const measure = useCallback(() => {
    const view = { width: window.innerWidth, height: window.innerHeight }
    setViewport(view)
    const element = step?.target === undefined ? null : document.querySelector<HTMLElement>(step.target)
    if (element === null) {
      setHole(null)
      return
    }
    const rect = element.getBoundingClientRect()
    setHole(rect.width === 0 && rect.height === 0 ? null : holeOf({ left: rect.left, top: rect.top, width: rect.width, height: rect.height }, view))
  }, [step])

  // 단계가 바뀌면 대상을 화면 안으로 데려오고 말풍선에 초점을 준다. 재기는 아래의 프레임 루프가 한다.
  useLayoutEffect(() => {
    const element = step?.target === undefined ? null : document.querySelector<HTMLElement>(step.target)
    element?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    bubbleRef.current?.focus()
  }, [step])

  // 말풍선 크기가 바뀌면(단계마다 글 길이가 다르다) 자리를 다시 잡는다.
  useEffect(() => {
    const bubble = bubbleRef.current
    if (bubble === null) return undefined
    const observer = new ResizeObserver(() => setBubbleSize({ width: bubble.offsetWidth, height: bubble.offsetHeight }))
    observer.observe(bubble)
    return () => observer.disconnect()
  }, [])

  // 대상이 움직이면 따라간다. 접기 움직임처럼 이벤트 없이 바뀌는 것도 있어 한동안 프레임마다 잰다.
  useEffect(() => {
    let frame = 0
    let frames = 0
    const tick = () => {
      measure()
      if (++frames < 30) frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    // 단계가 바뀔 때마다 다시 30 프레임을 잰다(measure 가 step 에 묶여 있어 이 효과가 다시 돈다). 화면이 안 보이는
    // 탭에서는 프레임이 멈추므로 한 번은 타이머로도 잰다.
    const timer = window.setTimeout(measure, 0)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [measure])

  const go = useCallback((next: number) => {
    if (next < 0) return
    if (next >= steps.length) onFinish('done')
    else onIndex(next)
  }, [steps.length, onFinish, onIndex])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onFinish('skipped')
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        go(index + 1)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        go(index - 1)
      }
    }
    // 라이브러리의 다른 단축키(⌘Z, 표 화살표)보다 먼저 받는다.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [go, index, onFinish])

  if (step === undefined) return null
  const placed = placeBubble(hole, bubbleSize, viewport.width === 0 ? { width: window.innerWidth, height: window.innerHeight } : viewport)

  return createPortal(
    <div className="tour" role="presentation">
      <div className="tour-veil" style={{ clipPath: holeClipPath(hole) }} />
      {hole !== null && (
        <div
          aria-hidden="true"
          className="tour-ring"
          style={{ left: hole.left, top: hole.top, width: hole.width, height: hole.height }}
        />
      )}
      <div
        aria-describedby={`tour-body-${step.id}`}
        aria-labelledby={`tour-title-${step.id}`}
        aria-modal="true"
        className={`tour-bubble tour-bubble--${placed.side}`}
        ref={bubbleRef}
        role="dialog"
        style={{ left: placed.left, top: placed.top, '--tour-arrow': `${placed.arrow}px` } as React.CSSProperties}
        tabIndex={-1}
      >
        <div className="tour-head">
          <span className="tour-count">{m.count(index + 1, steps.length)}</span>
          <button className="tour-link" onClick={() => onFinish('skipped')} type="button">{m.skipAll}</button>
        </div>
        <div aria-hidden="true" className="tour-progress">
          <span style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
        </div>
        <h2 className="tour-title" id={`tour-title-${step.id}`}>{step.title}</h2>
        <p className="tour-body" id={`tour-body-${step.id}`}>{step.body}</p>
        <div className="tour-dots" role="tablist" aria-label={m.steps}>
          {steps.map((one, dot) => (
            <button
              aria-label={m.goTo(dot + 1, one.title)}
              aria-selected={dot === index}
              className={'tour-dot' + (dot === index ? ' is-current' : dot < index ? ' is-done' : '')}
              key={one.id}
              onClick={() => onIndex(dot)}
              role="tab"
              type="button"
            />
          ))}
        </div>
        <div className="tour-actions">
          <button className="button button--secondary button--compact" disabled={index === 0} onClick={() => go(index - 1)} type="button">
            {m.previous}
          </button>
          <span className="tour-spacer" />
          {!last && (
            <button className="tour-link" onClick={() => go(index + 1)} title={m.skipStepTitle} type="button">
              {m.skipStep}
            </button>
          )}
          <button className="button button--primary button--compact" onClick={() => go(index + 1)} type="button">
            {last ? m.done : m.next}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
