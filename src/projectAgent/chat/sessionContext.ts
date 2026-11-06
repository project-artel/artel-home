import { createContext, useContext, useMemo, useSyncExternalStore } from 'react'
import type { AgentSessionStore, SessionState } from './sessionStore'
import { currentView, sessionBadge, type CurrentView, type SessionBadge } from './sessionView'

export const AgentSessionContext = createContext<AgentSessionStore | null>(null)

export type AgentSession = {
  store: AgentSessionStore
  state: SessionState
  view: CurrentView
  badge: SessionBadge
}

const subscribeNothing = () => () => {}
const snapshotNothing = () => null

/** `AgentSessionProvider` 밖이거나 기능 flag 가 꺼져 있으면 null. */
export function useAgentSession(): AgentSession | null {
  const store = useContext(AgentSessionContext)
  const state = useSyncExternalStore<SessionState | null>(
    store?.subscribe ?? subscribeNothing,
    store?.getSnapshot ?? snapshotNothing,
  )
  return useMemo(
    () =>
      store === null || state === null
        ? null
        : { store, state, view: currentView(state), badge: sessionBadge(state) },
    [store, state],
  )
}
