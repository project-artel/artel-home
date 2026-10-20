import type { ToolHandler } from '../toolTypes'

/** `watch_job`. ARTEL-1130 이 실제 구현으로 바꾼다. */
export const watchJob: ToolHandler = async () => ({ status: 'error', error: 'watch_job is not available yet' })
