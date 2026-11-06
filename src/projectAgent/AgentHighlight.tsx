import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useI18n } from '../i18n/useI18n'
import { useActionRegistry } from './registry/registryContext'
import './agentHighlight.css'

type Box = { top: number; left: number; width: number; height: number }

const POPOVER_WIDTH_PX = 280
const VIEWPORT_MARGIN_PX = 8

/**
 * 에이전트가 만지는 element 를 viewport 위에 고정된 ring 으로 가리킨다. 실행 직전(`acting`)에는
 * 보라색 ring 과 라벨, 승인 대기(`approval`)에는 점선 ring 과 승인/거절 popover 를 보인다.
 * 라벨은 `aria-live` 영역에도 옮겨 보조 기술이 읽게 한다.
 */
export function AgentHighlight() {
  const { t } = useI18n()
  const registry = useActionRegistry()
  const highlight = useSyncExternalStore(registry.subscribe, registry.highlight)
  const [box, setBox] = useState<Box | null>(null)
  const approveButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (highlight === null) return
    const measure = () => {
      const element = highlight.target()
      if (element === null) return setBox(null)
      const rect = element.getBoundingClientRect()
      setBox({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })
    }
    highlight.target()?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    measure()
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [highlight])

  const isApproval = highlight?.mode === 'approval'
  useEffect(() => {
    if (isApproval) approveButton.current?.focus()
  }, [isApproval, highlight])

  const approval = isApproval ? registry.pendingApproval() : null
  const strings = t.projectAgent.highlight

  return (
    <>
      <div aria-live="polite" className="visually-hidden" role="status">
        {highlight === null ? '' : isApproval ? strings.approvalAnnouncement(highlight.label) : highlight.label}
      </div>
      {highlight !== null && box !== null && (
        <div
          aria-hidden="true"
          className={`agent-highlight agent-highlight--${highlight.mode}`}
          style={{ top: box.top - 3, left: box.left - 3, width: box.width + 6, height: box.height + 6 }}
        >
          <span className={`agent-highlight__label${box.top < 32 ? ' is-below' : ''}`}>{highlight.label}</span>
        </div>
      )}
      {approval !== null && (
        <div
          aria-label={strings.approvalTitle}
          className="agent-highlight__popover"
          onKeyDown={(event) => {
            if (event.key === 'Escape') approval.reject()
          }}
          role="dialog"
          style={popoverPosition(box)}
        >
          <p className="agent-highlight__summary">{approval.summary}</p>
          <div className="agent-highlight__actions">
            <button className="button button--primary" onClick={approval.approve} ref={approveButton} type="button">
              {strings.approve}
            </button>
            <button className="button button--secondary" onClick={approval.reject} type="button">
              {strings.reject}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

/** element 아래에 붙이고, 아래가 모자라면 위로 올린다. element 가 없으면 화면 아래 가운데에 둔다. */
function popoverPosition(box: Box | null): React.CSSProperties {
  if (box === null) return { left: '50%', bottom: 24, transform: 'translateX(-50%)' }
  const left = Math.max(
    VIEWPORT_MARGIN_PX,
    Math.min(box.left, window.innerWidth - POPOVER_WIDTH_PX - VIEWPORT_MARGIN_PX),
  )
  const below = box.top + box.height + 10
  const fitsBelow = below + 110 < window.innerHeight
  return fitsBelow ? { left, top: below } : { left, bottom: window.innerHeight - box.top + 10 }
}
