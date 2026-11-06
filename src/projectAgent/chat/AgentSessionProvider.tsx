import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAgentRegistry } from '../registry'
import { AgentSessionContext } from './sessionContext'
import { AgentSessionStore } from './sessionStore'

/**
 * project agent 대화를 대화창보다 위에 둔다. 대화창을 닫아도 실행 중인 tool, stream, event 대기열은
 * 그대로 돈다. registry 를 읽으므로 `ActionRegistryProvider` 안에 있어야 한다.
 */
export function AgentSessionProvider({
  projectId,
  enabled,
  panelOpen,
  children,
}: {
  projectId: string
  enabled: boolean
  panelOpen: boolean
  children: ReactNode
}) {
  if (!enabled) return <>{children}</>
  return (
    <EnabledAgentSession panelOpen={panelOpen} projectId={projectId}>
      {children}
    </EnabledAgentSession>
  )
}

function EnabledAgentSession({
  projectId,
  panelOpen,
  children,
}: {
  projectId: string
  panelOpen: boolean
  children: ReactNode
}) {
  const registry = useAgentRegistry()
  const navigate = useNavigate()
  const [store] = useState(() => new AgentSessionStore({ projectId, registry, navigate }))

  useEffect(() => {
    store.setDependencies({ projectId, registry, navigate })
  }, [store, projectId, registry, navigate])

  useEffect(() => {
    store.start()
    return () => store.dispose()
  }, [store])

  useEffect(() => {
    store.setPanelOpen(panelOpen)
  }, [store, panelOpen])

  return <AgentSessionContext.Provider value={store}>{children}</AgentSessionContext.Provider>
}
