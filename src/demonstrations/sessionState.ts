import type { DemonstrationSession } from './types'

/** INTERRUPTED도 남은 ACTION_RESULT를 정리해 sourceHash가 생길 때까지 다시 읽는다. */
export function shouldPollDemonstration(session: Pick<DemonstrationSession, 'status' | 'sourceHash'> | null): boolean {
  return session !== null && (session.status === 'RECORDING' || session.status === 'FINALIZING'
    || (session.status === 'INTERRUPTED' && session.sourceHash === null))
}
