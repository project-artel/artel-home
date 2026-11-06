import { useLayoutEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { AgentHighlight } from '../AgentHighlight'
import { createActionRegistry } from './createActionRegistry'
import { ActionRegistryContext } from './registryContext'
import { AgentRegistryDevPanel } from './AgentRegistryDevPanel'
import { derivePage } from './pageFromPath'

/**
 * project workspace 하나에 registry 하나를 둔다. 지금 페이지는 URL 에서 읽고, 강조 표시 overlay 와
 * (개발 빌드에서만) 수동 호출 panel 도 여기서 그린다.
 */
export function ActionRegistryProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const [registry] = useState(() => createActionRegistry())
  const { pathname, search } = useLocation()

  useLayoutEffect(() => {
    const derived = derivePage(projectId, pathname, search)
    registry.setLocation(derived.page, derived.params)
  }, [registry, projectId, pathname, search])

  return (
    <ActionRegistryContext.Provider value={registry}>
      {children}
      <AgentHighlight />
      {import.meta.env.DEV && <AgentRegistryDevPanel />}
    </ActionRegistryContext.Provider>
  )
}
