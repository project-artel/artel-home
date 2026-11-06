import { createContext, useContext } from 'react'
import { createActionRegistry, type ActionRegistry } from './createActionRegistry'
import type { AgentRegistryApi } from './types'

/** provider 밖에서 hook 을 불러도 죽지 않게 하는 빈 registry. 등록은 받지만 아무도 읽지 않는다. */
const DETACHED_REGISTRY = createActionRegistry()
export const ActionRegistryContext = createContext<ActionRegistry>(DETACHED_REGISTRY)

/** overlay 와 dev panel 이 쓰는 전체 registry. */
export function useActionRegistry(): ActionRegistry {
  return useContext(ActionRegistryContext)
}

export function useAgentRegistry(): AgentRegistryApi {
  return useContext(ActionRegistryContext)
}
