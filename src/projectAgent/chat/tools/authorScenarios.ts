import type { ToolHandler } from '../toolTypes'

/** `author_scenarios`. ARTEL-1130 이 실제 구현으로 바꾼다. */
export const authorScenarios: ToolHandler = async () => ({
  status: 'error',
  error: 'author_scenarios is not available yet',
})
