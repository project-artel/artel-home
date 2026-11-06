/*
 * 대화 SSE 연결. 브라우저의 `EventSource` 는 연결이 끊기면 스스로 다시 잇지만, 다시 이을 때 받은 응답이
 * 2xx 가 아니거나 `text/event-stream` 이 아니면 포기하고 `CLOSED` 로 남는다. 서버가 재시작되는 동안
 * proxy 가 502 를 돌려주면 그렇게 된다. 그 뒤로는 서버가 보낸 결과도 실패 알림도 오지 않아서, 화면은
 * "생각하는 중" 에서 멈춘다. 그래서 `CLOSED` 가 되면 여기서 직접 다시 연다. 다시 열리면 `onOpen` 이
 * 끊긴 사이에 저장된 메시지를 다시 읽는다.
 */

/** 처음 다시 열기까지 기다리는 시간. 실패할 때마다 두 배로 늘린다. */
export const STREAM_RETRY_BASE_MS = 1000

/** 다시 열기 간격의 상한. 서버가 오래 내려가 있어도 이 간격으로 계속 시도한다. */
export const STREAM_RETRY_MAX_MS = 15000

/** `attempt` 번째(0부터) 다시 열기 전에 기다릴 시간. */
export function streamRetryDelay(attempt: number): number {
  return Math.min(STREAM_RETRY_MAX_MS, STREAM_RETRY_BASE_MS * 2 ** Math.max(0, attempt))
}

/** `EventSource` 에서 쓰는 부분. 테스트가 가짜를 넣는다. */
export type StreamSource = {
  readonly readyState: number
  addEventListener: (type: string, listener: (event: MessageEvent) => void) => void
  close: () => void
}

export type StreamListeners = {
  /** 이름이 붙은 SSE event 마다 부른다. */
  onEvent: (type: string, data: string) => void
  onOpen: () => void
}

export type StreamTimers = {
  schedule: (callback: () => void, milliseconds: number) => unknown
  cancel: (handle: unknown) => void
}

/** `EventSource.CLOSED`. 테스트 환경에는 `EventSource` 가 없어서 값을 직접 둔다. */
const CLOSED = 2

const BROWSER_TIMERS: StreamTimers = {
  schedule: (callback, milliseconds) => setTimeout(callback, milliseconds),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

/**
 * `eventTypes` 의 event 를 받는 연결을 열고, `CLOSED` 가 되면 `streamRetryDelay` 만큼 기다렸다 다시 연다.
 * 돌려준 함수를 부르면 연결을 닫고 다시 열기도 멈춘다.
 */
export function connectWithRetry(
  open: () => StreamSource,
  eventTypes: readonly string[],
  listeners: StreamListeners,
  timers: StreamTimers = BROWSER_TIMERS,
): () => void {
  let source: StreamSource | null = null
  let pending: unknown = null
  let attempt = 0
  let stopped = false

  const connect = (): void => {
    pending = null
    const current = open()
    source = current
    for (const type of eventTypes) {
      current.addEventListener(type, (event) => listeners.onEvent(type, String(event.data)))
    }
    current.addEventListener('open', () => {
      attempt = 0
      listeners.onOpen()
    })
    current.addEventListener('error', () => {
      // `CONNECTING` 이면 브라우저가 다시 잇는 중이다. `CLOSED` 일 때만 직접 다시 연다.
      if (stopped || current !== source || current.readyState !== CLOSED) return
      current.close()
      pending = timers.schedule(connect, streamRetryDelay(attempt))
      attempt += 1
    })
  }

  connect()
  return () => {
    stopped = true
    if (pending !== null) timers.cancel(pending)
    source?.close()
  }
}
