import { useCallback, useEffect, useRef, useState } from 'react'
import { viewerStreamUrl } from './streamApi'
import { connectViewer } from './viewerConnection'
import type { GameStreamFailure, GameStreamStatus } from './streamTypes'

const LOST_AT_FORMAT = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })

type GameStreamState = {
  instanceId: string
  status: GameStreamStatus
  failure: GameStreamFailure | null
  errorCode: string | null
  hasFrame: boolean
  lostAt: string | null
}

/** React는 연결 상태만 보관하고 JPEG frame은 바로 canvas에 그린다. */
export function useGameStream(instanceId: string, onFrame: (frame: ImageBitmap) => void, stopOnDisconnect = false) {
  const [state, setState] = useState<GameStreamState>({ instanceId, status: 'connecting', failure: null, errorCode: null, hasFrame: false, lostAt: null })
  const [attempt, setAttempt] = useState(0)
  const consecutiveFailures = useRef(0)
  const retry = useCallback(() => {
    consecutiveFailures.current = 0
    setState((previous) => ({ ...previous, status: 'connecting', failure: null, errorCode: null }))
    setAttempt((previous) => previous + 1)
  }, [])

  useEffect(() => connectViewer({
    socket: new WebSocket(viewerStreamUrl(instanceId)),
    timers: { schedule: (callback, delay) => window.setTimeout(callback, delay), cancel: (id) => window.clearTimeout(id) },
    onState: (status, failure, errorCode) => setState((previous) => {
      const currentErrorCode = errorCode ?? null
      const hasFrame = status === 'live' || (previous.instanceId === instanceId && previous.hasFrame)
      const previousLostAt = previous.instanceId === instanceId ? previous.lostAt : null
      const lostAt = status === 'live' ? null : status === 'connecting' ? previousLostAt : previousLostAt ?? LOST_AT_FORMAT.format(new Date())
      if (previous.instanceId === instanceId && previous.status === status && previous.failure === failure && previous.errorCode === currentErrorCode && previous.hasFrame === hasFrame) return previous
      return { instanceId, status, failure, errorCode: currentErrorCode, hasFrame, lostAt }
    }),
    onFrame,
    onLive: () => { consecutiveFailures.current = 0 },
    onRetry: () => { if (!stopOnDisconnect) setAttempt((previous) => previous + 1) },
    reconnectDelay: () => Math.min(1_000 * 2 ** consecutiveFailures.current++, 10_000),
  }), [attempt, instanceId, onFrame, stopOnDisconnect])

  const current = state.instanceId === instanceId ? state : { status: 'connecting' as const, failure: null, errorCode: null, hasFrame: false, lostAt: null }
  return { status: current.status, failure: current.failure, errorCode: current.errorCode, hasFrame: current.hasFrame, lostAt: current.lostAt, retry }
}
