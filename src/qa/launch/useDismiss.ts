import { useEffect, type RefObject } from 'react'

/**
 * 열린 팝오버를 바깥 누르기 · Escape 로 닫는다(ARTEL-1084). 런 피커와 게임 콘솔 목록이 같이 쓴다.
 *
 * `ref` 는 여는 버튼까지 감싼 상자여야 한다. 버튼이 밖에 있으면 버튼을 누르는 순간 닫히고, 같은
 * 클릭이 다시 열어 버린다.
 */
export function useDismiss(open: boolean, ref: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    function onPointer(event: PointerEvent) {
      if (ref.current !== null && !ref.current.contains(event.target as Node)) onClose()
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, ref, onClose])
}
