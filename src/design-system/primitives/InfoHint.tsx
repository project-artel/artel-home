import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../i18n/useI18n'

/** tooltip 상자의 모서리와 아이콘 사이의 세로 간격. */
const GAP_PX = 4
/** tooltip 이 viewport 가장자리에 붙지 않도록 남기는 여백. */
const EDGE_PX = 8
/** pointer 가 아이콘에서 tooltip 으로 넘어가는 동안 닫히지 않게 기다리는 시간. */
const CLOSE_DELAY_MS = 120

/** 아이콘 쪽에 놓인 상자의 모서리. CSS 가 이 모서리만 둥글기를 줄인다. */
type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

type Placement = { top: number; left: number; corner: Corner }

/**
 * 원 안에 i 가 그려진 아이콘. 마우스를 올리거나 keyboard focus 가 닿으면 `children` 을 tooltip 으로 띄운다.
 *
 * 기능을 설명하는 고정 문구를 화면에 늘 펼쳐 두는 대신 제목 옆에 이 아이콘을 둔다. 빈 상태, 오류, 저장 중처럼
 * 지금 상태를 알리는 문구는 이 아이콘에 넣지 않는다. 그런 문구는 사용자가 찾아서 열어 보지 않으므로 화면에
 * 그대로 보여야 한다.
 *
 * tooltip 은 `document.body` 로 portal 된다. content map 의 inspector 처럼 `overflow: hidden` 인 pane 안에
 * 두면 tooltip 이 pane 경계에서 잘리기 때문이다. 위치는 아이콘의 `getBoundingClientRect` 로 계산한다.
 * 상자의 한 모서리가 아이콘의 가로 가운데에 오도록 놓는다. 기본은 아이콘 아래 오른쪽으로 펼치는 왼쪽 위 모서리다.
 * 오른쪽 공간이 모자라면 왼쪽으로 펼치고, 아래 공간이 모자라면 위로 펼친다. 아이콘 아래 가운데에 놓으면
 * 상자 위쪽 변의 가운데에 아이콘이 걸려서, 상자가 어느 아이콘에서 나왔는지 눈에 덜 들어온다.
 *
 * 스크린 리더는 portal 된 tooltip 을 읽지 않는다. 같은 문구를 아이콘 옆 `hidden` span 에 늘 두고
 * `aria-describedby` 로 연결한다. `aria-describedby` 는 `hidden` 인 요소의 글도 읽는다. `visually-hidden` 으로
 * 두면 이 아이콘을 품은 heading 의 accessible name 에 설명 문구 전체가 붙는다.
 *
 * 터치 화면에는 hover 가 없으므로 눌러서 연다. 바깥을 누르면 blur 로 닫히고, `Escape` 도 열린 tooltip 을 닫는다.
 */
export function InfoHint({
  children,
  label,
  className,
}: {
  children: ReactNode
  /** 아이콘 버튼의 `aria-label`. 주지 않으면 공통 문구 "설명 보기" 를 쓴다. */
  label?: string
  className?: string
}) {
  const { t } = useI18n()
  const descriptionId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const bubble = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<number | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<Placement | null>(null)

  const cancelClose = useCallback(() => {
    window.clearTimeout(closeTimer.current)
  }, [])

  const show = useCallback(() => {
    cancelClose()
    setOpen(true)
  }, [cancelClose])

  const hide = useCallback(() => {
    cancelClose()
    setOpen(false)
    setPlacement(null)
  }, [cancelClose])

  const hideSoon = useCallback(() => {
    cancelClose()
    closeTimer.current = window.setTimeout(hide, CLOSE_DELAY_MS)
  }, [cancelClose, hide])

  useEffect(() => cancelClose, [cancelClose])

  const place = useCallback(() => {
    const anchor = trigger.current?.getBoundingClientRect()
    const tip = bubble.current?.getBoundingClientRect()
    if (anchor === undefined || tip === undefined) return

    const below = anchor.bottom + GAP_PX
    const fitsBelow = below + tip.height <= window.innerHeight - EDGE_PX
    const top = fitsBelow ? below : Math.max(EDGE_PX, anchor.top - GAP_PX - tip.height)

    const corner = anchor.left + anchor.width / 2
    const fitsRight = corner + tip.width <= window.innerWidth - EDGE_PX
    const left = Math.max(EDGE_PX, fitsRight ? corner : corner - tip.width)

    setPlacement({ top, left, corner: `${fitsBelow ? 'top' : 'bottom'}-${fitsRight ? 'left' : 'right'}` })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    place()
  }, [open, place])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') hide()
    }
    // scroll 은 capture 로 받는다. 아이콘이 들어 있는 pane 이 따로 scroll 되면 window 에는 scroll 이 오지 않는다.
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, hide, place])

  return (
    <span className={className === undefined ? 'info-hint' : `info-hint ${className}`}>
      <button
        aria-describedby={descriptionId}
        aria-expanded={open}
        aria-label={label ?? t.common.shell.moreInfo}
        className="info-hint__trigger"
        onBlur={hide}
        onClick={(event) => {
          // `<summary>` 나 `<label>` 안에 놓이면 click 이 details 를 접거나 input 으로 focus 를 옮긴다. 아이콘을 누른 것은 설명을 보려는 것뿐이다.
          event.preventDefault()
          event.stopPropagation()
          // toggle 하지 않는다. click 보다 먼저 오는 pointerenter 와 focus 가 이미 열어 두었으므로, toggle 하면 누른 순간 닫힌다.
          // 닫는 것은 바깥을 눌러 생기는 blur, pointer 가 떠나는 것, `Escape` 가 맡는다.
          show()
        }}
        onFocus={show}
        onPointerEnter={show}
        onPointerLeave={hideSoon}
        ref={trigger}
        type="button"
      >
        <svg aria-hidden="true" className="info-hint__icon" fill="none" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth={1.25} />
          <path d="M8 7.2v4" stroke="currentColor" strokeLinecap="round" strokeWidth={1.4} />
          <circle cx="8" cy="5" fill="currentColor" r="0.85" />
        </svg>
      </button>
      <span hidden id={descriptionId}>
        {children}
      </span>
      {open &&
        createPortal(
          <div
            aria-hidden="true"
            className="info-hint__bubble"
            onPointerEnter={cancelClose}
            onPointerLeave={hideSoon}
            ref={bubble}
            data-corner={placement?.corner}
            style={placement === null ? { visibility: 'hidden', top: 0, left: 0 } : { top: placement.top, left: placement.left }}
          >
            {children}
          </div>,
          document.body,
        )}
    </span>
  )
}
