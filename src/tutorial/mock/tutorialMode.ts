import { resetTutorialData } from './tutorialMockApi'

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

  close(): void {
    this.readyState = 2
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
  }
  listeners.forEach((listener) => listener())
}

export function exitTutorialMode(): void {
  session = null
  if (typeof window !== 'undefined' && RealEventSource !== undefined) {
    window.EventSource = RealEventSource
  }
  listeners.forEach((listener) => listener())
}

