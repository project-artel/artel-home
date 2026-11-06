import { useCallback, useState } from 'react'
import { hasSeenTour, markTourSeen } from './tourSeen'

/**
 * 튜토리얼을 열고 닫는다(ARTEL-1033). [ready] 가 처음 참이 될 때 아직 본 적 없으면 연다 — 화면이 다 그려지기 전에
 * 열면 밝게 남길 자리가 아직 없다.
 */
export function useTour(tourId: string, ready: boolean) {
  const [state, setState] = useState<{ open: boolean; index: number; decided: boolean }>({
    open: false,
    index: 0,
    decided: false,
  })

  // 렌더 중에 한 번만 정한다(효과 안에서 상태를 바꾸면 한 번 더 그린다).
  if (ready && !state.decided) {
    setState({ open: !hasSeenTour(tourId), index: 0, decided: true })
  }

  const start = useCallback(() => setState((current) => ({ ...current, open: true, index: 0 })), [])
  const setIndex = useCallback((index: number) => setState((current) => ({ ...current, index })), [])
  const finish = useCallback(
    (how: 'done' | 'skipped') => {
      markTourSeen(tourId, how)
      setState((current) => ({ ...current, open: false, index: 0 }))
    },
    [tourId],
  )

  return { open: state.open, index: state.index, start, setIndex, finish }
}
