/**
 * registry 의 공개 API. 핵심은 React 없이 도는 `createActionRegistry` 이고, hook 과 provider 는
 * 그 위의 얇은 층이다.
 */
export type * from './types'
export { createActionRegistry } from './createActionRegistry'
export type { ActionRegistry, ActionRegistryOptions, HighlightState } from './createActionRegistry'
export { derivePage } from './pageFromPath'
export type { DerivedPage } from './pageFromPath'
export { validateAgainstSchema } from './validateArgs'
export { ActionRegistryProvider } from './ActionRegistryProvider'
export { useAgentAction, useAgentField, useAgentPage } from './useAgentBindings'
export { useActionRegistry, useAgentRegistry } from './registryContext'
