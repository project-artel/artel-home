import { parseViewerMessage } from './streamApi'
import { decodeStreamJpeg } from './jpegFrame'
import { STREAM_TRANSPORT, VIEWER_CLOSE_CODE, type GameStreamFailure, type GameStreamStatus, type StreamFrameMessage } from './streamTypes'

export const RENEW_INTERVAL_MS = 10_000
export const FRAME_TIMEOUT_MS = 5_000
const FIRST_FRAME_TIMEOUT_MS = 15_000
const OFFLINE_RETRY_MS = 5_000

export type ViewerTimers = {
  schedule(callback: () => void, milliseconds: number): number
  cancel(id: number): void
}

export type ViewerConnectionOptions = {
  socket: WebSocket
  timers: ViewerTimers
  onState(status: GameStreamStatus, failure: GameStreamFailure | null, errorCode?: string): void
  onFrame(frame: ImageBitmap): void
  onLive(): void
  onRetry(): void
  reconnectDelay(): number
  decode?: (jpeg: string) => Promise<ImageBitmap>
}

/** socket 하나의 수명과 frame 하나의 decode만 소유한다. 재연결은 hook이 새로 시작한다. */
export function connectViewer({ socket, timers, onState, onFrame, onLive, onRetry, reconnectDelay, decode = decodeStreamJpeg }: ViewerConnectionOptions): () => void {
  let active = true
  let settled = false
  let streamId: string | null = null
  let generation = 0
  let lastFrameId = 0
  let pending: StreamFrameMessage | null = null
  let decoding = false
  let renewTimer: number | null = null
  let frameTimer: number | null = null
  let retryTimer: number | null = null

  function cancel(id: number | null) { if (id !== null) timers.cancel(id) }
  function send(type: 'STOP' | 'RENEW') {
    if (socket.readyState === 1) socket.send(JSON.stringify({ type }))
  }
  function stopTimers() {
    cancel(renewTimer)
    cancel(frameTimer)
    renewTimer = null
    frameTimer = null
  }
  function settle(status: GameStreamStatus, failure: GameStreamFailure | null, errorCode?: string): boolean {
    if (!active || settled) return false
    settled = true
    generation += 1
    pending = null
    stopTimers()
    socket.close()
    onState(status, failure, errorCode)
    return true
  }
  function retryAfter(delay: number) {
    retryTimer = timers.schedule(() => { if (active) onRetry() }, delay)
  }
  function reconnect() {
    if (settle('reconnecting', null)) retryAfter(reconnectDelay())
  }
  function expectFrame(delay: number) {
    cancel(frameTimer)
    frameTimer = timers.schedule(reconnect, delay)
  }
  function renew() {
    if (!active || settled) return
    send('RENEW')
    renewTimer = timers.schedule(renew, RENEW_INTERVAL_MS)
  }

  async function decodePending() {
    if (decoding) return
    decoding = true
    try {
      while (active && !settled && pending !== null) {
        const message = pending
        pending = null
        const decodingGeneration = generation
        let bitmap: ImageBitmap | null = null
        try {
          bitmap = await decode(message.jpeg)
          if (!active || settled || decodingGeneration !== generation || message.streamId !== streamId) continue
          onFrame(bitmap)
          onLive()
          onState('live', null)
          expectFrame(FRAME_TIMEOUT_MS)
        } catch {
          // 일시적인 손상 frame은 버리고 다음 frame을 기다린다. frame timeout은 그대로 둔다.
        } finally {
          bitmap?.close()
        }
      }
    } finally {
      decoding = false
    }
  }

  socket.addEventListener('message', (event) => {
    if (!active || settled || typeof event.data !== 'string') return
    const message = parseViewerMessage(event.data)
    if (message === null) return
    if (message.type === 'STREAM_ERROR' || message.type === 'ERROR') {
      if (message.streamId === null || message.streamId === streamId) settle('error', 'signalling', message.code)
      return
    }
    if (message.type === 'STREAM_READY') {
      if (message.transport !== STREAM_TRANSPORT) {
        settle('error', 'signalling', 'SERVER_TRANSPORT_MISMATCH')
        return
      }
      generation += 1
      streamId = message.streamId
      lastFrameId = 0
      pending = null
      stopTimers()
      onState('connecting', null)
      renewTimer = timers.schedule(renew, RENEW_INTERVAL_MS)
      // capability 오류가 도착할 여유를 두고, 실제 재생 뒤에는 5초 정지를 감지한다.
      expectFrame(FIRST_FRAME_TIMEOUT_MS)
      return
    }
    if (message.streamId !== streamId) return
    if (message.type === 'STREAM_FRAME') {
      if (message.frameId <= lastFrameId) return
      lastFrameId = message.frameId
      // decode가 느리면 대기 중인 이전 frame을 버려 최신 화면 하나만 남긴다.
      pending = message
      void decodePending()
      return
    }
    if (message.type === 'STREAM_STATE' && message.state === 'FAILED') {
      reconnect()
      return
    }
    if (message.type === 'STREAM_STATE' && message.state === 'STOPPED' && settle('offline', null)) retryAfter(OFFLINE_RETRY_MS)
  })

  socket.addEventListener('close', (event) => {
    if (!active || settled) return
    if (event.code === VIEWER_CLOSE_CODE.takenOver) { settle('takenOver', null); return }
    if (event.code === VIEWER_CLOSE_CODE.notPermitted) { settle('error', 'notPermitted'); return }
    if (event.code === VIEWER_CLOSE_CODE.malformedInstance) { settle('error', 'signalling'); return }
    if (event.code === VIEWER_CLOSE_CODE.gameOffline) {
      if (settle('offline', null)) retryAfter(OFFLINE_RETRY_MS)
      return
    }
    reconnect()
  })

  expectFrame(FIRST_FRAME_TIMEOUT_MS)
  return () => {
    active = false
    generation += 1
    pending = null
    stopTimers()
    cancel(retryTimer)
    send('STOP')
    socket.close()
  }
}
