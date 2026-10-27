import { orchestrationUrlFor } from '../auth/authApi'
import { asRecord, isOneOf, projectPath } from '../projects/projectApi'

/*
 * The project change stream (`/api/projects/{projectId}/events`, ARTEL-1123).
 *
 * The server sends no data, only which kind of data moved: `event: changed`
 * carries `{"topic": "..."}` and the screen re-reads that kind itself. Every
 * connection, including each automatic reconnect, starts with `event: ready`,
 * which means "re-read everything once" — it covers whatever changed while the
 * tab was not connected.
 *
 * One `EventSource` per project per tab, shared by every subscriber. A screen
 * can have five hooks watching the same project; five connections would be five
 * server-side subscriptions repeating the same frames. The registry is a module
 * rather than a React provider because subscribers also live outside the
 * project workspace tree (the QA run page is its own route).
 */

export const PROJECT_CHANGE_TOPICS = [
  'GAME_INSTANCES',
  'GAME_BUILDS',
  'MACROS',
  'ISSUES',
  'KNOWLEDGE',
  'TEST_CASES',
  'TEST_RUNS',
  'USAGE',
  'QA_RUNS',
  'QA_QUESTIONS',
] as const

export type ProjectChangeTopic = (typeof PROJECT_CHANGE_TOPICS)[number]

/** How long a subscriber waits after the first frame of a burst before it re-reads. */
export const PROJECT_CHANGE_DEBOUNCE_MS = 300

/** `EventSource.CLOSED`, spelled out so this module loads where `EventSource` is not defined. */
const CLOSED = 2

export function projectEventsUrl(projectId: string): string {
  return orchestrationUrlFor(projectPath(projectId, '/events'))
}

export function isProjectChangeTopic(value: unknown): value is ProjectChangeTopic {
  return isOneOf(value, PROJECT_CHANGE_TOPICS)
}

/**
 * `event: changed`. A topic this build does not know yet returns `null`, and
 * the frame is dropped: the server may add topics before every screen reads them.
 */
export function parseProjectChangedEvent(data: string): ProjectChangeTopic | null {
  try {
    const record = asRecord(JSON.parse(data))
    return isProjectChangeTopic(record?.topic) ? record.topic : null
  } catch {
    return null
  }
}

/** The part of `EventSource` the registry uses, so a test can hand it a fake. */
export type EventSourceLike = {
  readonly readyState: number
  addEventListener(type: string, listener: (event: Event) => void): void
  close(): void
}

export type ProjectChangeSubscriber = {
  topics: readonly ProjectChangeTopic[]
  onChange: () => void
}

type Subscription = ProjectChangeSubscriber & { timer: ReturnType<typeof setTimeout> | null }

type Connection = {
  source: EventSourceLike
  subscriptions: Set<Subscription>
  live: boolean
}

export type ProjectEventsRegistry = {
  /** Opens the project's connection on its first subscriber. The returned function unsubscribes. */
  subscribe(projectId: string, subscriber: ProjectChangeSubscriber): () => void
  /** True after `open` or `ready`, false after an error, and false with no connection. */
  isLive(projectId: string): boolean
  /** Calls `listener` whenever `isLive(projectId)` changes. Does not open a connection. */
  watchLive(projectId: string, listener: () => void): () => void
}

export function createProjectEventsRegistry(
  openSource: (url: string) => EventSourceLike,
  debounceMs = PROJECT_CHANGE_DEBOUNCE_MS,
): ProjectEventsRegistry {
  const connections = new Map<string, Connection>()
  const liveListeners = new Map<string, Set<() => void>>()

  const setLive = (projectId: string, connection: Connection, live: boolean) => {
    if (connection.live === live) return
    connection.live = live
    liveListeners.get(projectId)?.forEach((listener) => listener())
  }

  // A burst of frames within `debounceMs` becomes one re-read per subscriber.
  const schedule = (subscription: Subscription) => {
    if (subscription.timer !== null) return
    subscription.timer = setTimeout(() => {
      subscription.timer = null
      subscription.onChange()
    }, debounceMs)
  }

  const open = (projectId: string): Connection => {
    const source = openSource(projectEventsUrl(projectId))
    const connection: Connection = { source, subscriptions: new Set(), live: false }

    source.addEventListener('open', () => setLive(projectId, connection, true))

    source.addEventListener('ready', () => {
      setLive(projectId, connection, true)
      connection.subscriptions.forEach(schedule)
    })

    source.addEventListener('changed', (event: Event) => {
      if (!(event instanceof MessageEvent) || typeof event.data !== 'string') return
      const topic = parseProjectChangedEvent(event.data)
      if (topic === null) return
      connection.subscriptions.forEach((subscription) => {
        if (subscription.topics.includes(topic)) schedule(subscription)
      })
    })

    // Any error drops to not-live so the callers' polling takes over. A
    // CONNECTING source is reconnecting by itself and will say `open` again; a
    // CLOSED one (404 for a non-member, or an expired cookie) never will, and it
    // stays closed until the last subscriber leaves.
    source.addEventListener('error', () => {
      setLive(projectId, connection, false)
      if (source.readyState === CLOSED) source.close()
    })

    connections.set(projectId, connection)
    return connection
  }

  return {
    subscribe(projectId, subscriber) {
      const connection = connections.get(projectId) ?? open(projectId)
      const subscription: Subscription = { ...subscriber, timer: null }
      connection.subscriptions.add(subscription)

      return () => {
        if (subscription.timer !== null) clearTimeout(subscription.timer)
        subscription.timer = null
        connection.subscriptions.delete(subscription)
        if (connection.subscriptions.size > 0 || connections.get(projectId) !== connection) return
        connection.source.close()
        connections.delete(projectId)
        setLive(projectId, connection, false)
      }
    },

    isLive(projectId) {
      return connections.get(projectId)?.live ?? false
    },

    watchLive(projectId, listener) {
      const listeners = liveListeners.get(projectId) ?? new Set<() => void>()
      liveListeners.set(projectId, listeners)
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) liveListeners.delete(projectId)
      }
    },
  }
}

/** The tab's registry. Nothing connects until a hook subscribes. */
export const projectEvents = createProjectEventsRegistry(
  (url) => new EventSource(url, { withCredentials: true }),
)
