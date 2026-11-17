import { resetTutorialData, tutorialData } from './tutorialMockApi'
import { attachPlayback } from './tutorialPlayback'

/**
 * 튜토리얼 모드(ARTEL-1461). 켜져 있는 동안 화면은 실제 서비스 그대로 그려지지만, 서버 대신 미리 준비한 목데이터가 답한다.
 *
 * - `apiFetch` 가 여기를 보고 목데이터로 돌린다. 쓰기 요청도 서버로 가지 않고 브라우저 안의 목데이터에만 쌓인다.
 * - 실시간 스트림(EventSource)은 열지 않는다. 목데이터에는 흘려보낼 사건이 없다.
 * - 끝나면 원래 보던 주소로 새로 들어간다. 목데이터를 읽어 둔 화면 상태가 실제 화면에 남지 않게 하려는 것이다.
 *
 * 모듈 하나에 둔 상태다. 화면 트리 밖의 `apiFetch` 가 읽어야 해서 React 상태로 둘 수 없다.
 */

export type TutorialSession = {
  /** 튜토리얼이 들어가 있는 프로젝트. 사용자의 프로젝트면 그 이름 · 장르만 실제로 읽고, 나머지는 목데이터다. */
  projectId: string
  /** 사용자의 실제 프로젝트인지. 아니면 목데이터의 예시 프로젝트다. */
  realProject: boolean
  locale: 'ko' | 'en'
  /** 목데이터의 멤버 · 실행자로 쓰는 지금 사용자. 실제 계정 정보 그대로다. */
  user: { id: string; displayName: string; email: string | null; nickname: string; userTag: string }
}

let session: TutorialSession | null = null
const listeners = new Set<() => void>()
const RealEventSource = typeof window === 'undefined' ? undefined : window.EventSource
const RealWebSocket = typeof window === 'undefined' ? undefined : window.WebSocket

/**
 * 게임 화면 소켓은 튜토리얼 동안 열리지 않은 채로 둔다. 실제 게임이 없어서, 그 자리에는 튜토리얼이 예시 게임 화면을
 * 그린다. 다른 소켓은 그대로 연다.
 */
function TutorialWebSocket(this: unknown, url: string | URL, protocols?: string | string[]) {
  if (RealWebSocket === undefined || !String(url).includes('/ws/viewer')) {
    return new (RealWebSocket as typeof WebSocket)(url, protocols)
  }
  const idle = new EventTarget() as EventTarget & Record<string, unknown>
  Object.assign(idle, {
    url: String(url),
    readyState: 0,
    binaryType: 'blob',
    bufferedAmount: 0,
    protocol: '',
    extensions: '',
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send: () => undefined,
    close: () => {
      idle.readyState = 3
    },
  })
  return idle
}

const sources = new Set<SilentEventSource>()

/**
 * 서버 대신 서는 스트림. 프로젝트 변경 스트림(`/events`)은 열린 것으로 알리고, 목데이터에 쓰기가 일어나면
 * `changed` 를 보내 화면이 다시 읽게 한다. 나머지 스트림은 아무것도 보내지 않는다.
 */
class SilentEventSource extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2
  readonly CONNECTING = 0
  readonly OPEN = 1
  readonly CLOSED = 2
  readonly url: string
  readonly withCredentials: boolean
  readyState = 0
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  constructor(url: string | URL, init?: EventSourceInit) {
    super()
    this.url = String(url)
    this.withCredentials = init?.withCredentials ?? false
    sources.add(this)
    // QA 실행 화면의 스트림이면 튜토리얼 각본을 튼다. 실제 실행처럼 로그가 한 줄씩 온다.
    const qaTry = /\/api\/qa-tries\/([^/?]+)\/events/.exec(this.url)?.[1]
    const d = tutorialData()
    if (qaTry !== undefined && d !== null) {
      window.setTimeout(() => {
        if (this.readyState === 2) return
        this.readyState = 1
        this.dispatchEvent(new Event('open'))
        this.detach = attachPlayback(
          d,
          qaTry,
          (log) => {
            if (this.readyState === 1) this.dispatchEvent(new MessageEvent('log', { data: JSON.stringify(log) }))
          },
          () => notifyTutorialChange('QA_RUNS'),
        )
      }, 0)
    }
    if (this.isProjectChanges()) {
      window.setTimeout(() => {
        if (this.readyState === 2) return
        this.readyState = 1
        this.dispatchEvent(new Event('open'))
        this.dispatchEvent(new MessageEvent('ready', { data: '{}' }))
      }, 0)
    }
  }

  isProjectChanges(): boolean {
    return /\/api\/projects\/[^/]+\/events(\?|$)/.test(this.url)
  }

  private detach: () => void = () => undefined

  close(): void {
    this.readyState = 2
    this.detach()
    sources.delete(this)
  }
}

/** 목데이터에 쓰기가 일어났다고 화면에 알린다. 실제 서버의 프로젝트 변경 스트림과 같은 모양이다. */
export function notifyTutorialChange(topic: string): void {
  sources.forEach((source) => {
    if (source.readyState === 1 && source.isProjectChanges()) {
      source.dispatchEvent(new MessageEvent('changed', { data: JSON.stringify({ topic }) }))
    }
  })
}

export function tutorialSession(): TutorialSession | null {
  return session
}

/** 셸이 이 값이 바뀔 때 화면을 새로 그려, 실제 데이터를 읽어 둔 화면이 목데이터 화면에 섞이지 않게 한다. */
export function subscribeTutorialMode(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function enterTutorialMode(next: TutorialSession): void {
  session = next
  resetTutorialData(next)
  if (typeof window !== 'undefined') {
    window.EventSource = SilentEventSource as unknown as typeof EventSource
    window.WebSocket = Object.assign(TutorialWebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }) as unknown as typeof WebSocket
  }
  listeners.forEach((listener) => listener())
}

export function exitTutorialMode(): void {
  session = null
  if (typeof window !== 'undefined' && RealEventSource !== undefined) {
    window.EventSource = RealEventSource
  }
  if (typeof window !== 'undefined' && RealWebSocket !== undefined) {
    window.WebSocket = RealWebSocket
  }
  listeners.forEach((listener) => listener())
}

