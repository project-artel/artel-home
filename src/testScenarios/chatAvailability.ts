import { ProjectApiError } from '../projects/projectApi'
import type { ScenarioFailure } from './scenarioTypes'

/**
 * When the conversation stops being usable, and what to tell the user.
 *
 * The two halves of a scenario have different lifetimes. Messages are stored
 * per user and outlive everything, but the agent session behind them expires on
 * a TTL the client cannot see and cannot renew. Once it is gone the server
 * cannot carry the conversation forward, while the transcript it produced is
 * still worth reading.
 *
 * So there is no error state for chat here — the screen degrades to a readable
 * archive instead. The thread and the canvas stay on screen; only the controls
 * that would send something new are withdrawn.
 *
 * The server has no dedicated "session expired" signal yet. Until it does, any
 * abnormal response is read as a closed session, because the failure that is
 * expensive to get wrong is the other one: an input that looks live, accepts a
 * message, and drops it. This module is the only place that decides, so
 * adopting the real signal is a change to `closureFrom*` and nothing else.
 */
export type ChatClosure = {
  /** Shown to the user in place of the composer. */
  reason: string
}

const EXPIRED_SESSION_REASON =
  'This conversation is closed. The agent session behind it is no longer available, so no new messages can be sent. The transcript and the scenario below stay readable.'

/**
 * A relay failure. `502` is the documented one — the orchestration server could
 * not reach the agent — and an expired session surfaces the same way today.
 *
 * `401` is deliberately excluded: `apiFetch` throws `UnauthorizedError` for it
 * and returns the app to the login boundary, so it never reaches this code as a
 * `ProjectApiError`. A `404` means the scenario itself is gone, which the
 * screen's `missing` status already covers.
 */
export function closureFromSendFailure(error: unknown): ChatClosure | null {
  if (error instanceof ProjectApiError && error.status >= 500) {
    return { reason: EXPIRED_SESSION_REASON }
  }
  return null
}

/**
 * A typed `error` event from the agent. `code` and `detail` are shown as the
 * server wrote them when either is present — the operator needs the server's
 * own words to tell an expiry apart from a real fault.
 */
export function closureFromStreamFailure(failure: ScenarioFailure): ChatClosure {
  const described = [failure.code, failure.detail].filter((part) => part.length > 0).join(' — ')

  if (described.length === 0) {
    return { reason: EXPIRED_SESSION_REASON }
  }

  return {
    reason: `This conversation is closed: ${described}. The transcript and the scenario below stay readable.`,
  }
}
