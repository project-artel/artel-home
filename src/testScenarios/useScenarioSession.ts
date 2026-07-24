import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { ProjectApiError } from '../projects/projectApi'
import {
  getTestScenario,
  listScenarioMessages,
  parseStreamEvent,
  scenarioStreamUrl,
  sendScenarioMessage,
} from './scenarioApi'
import { closureFromSendFailure, closureFromStreamFailure, type ChatClosure } from './chatAvailability'
import {
  EMPTY_SCENARIO_DRAFT,
  isScenarioDraftEqual,
  type ChatMessage,
  type ScenarioDraft,
} from './scenarioTypes'

type SessionStatus = 'loading' | 'ready' | 'missing' | 'error'

type SessionState = {
  status: SessionStatus
  /** The scenario as the server last described it. The canvas edits a copy. */
  saved: ScenarioDraft
  messages: ChatMessage[]
}

const loadingState: SessionState = {
  status: 'loading',
  saved: EMPTY_SCENARIO_DRAFT,
  messages: [],
}

function load(testScenarioId: number, signal?: AbortSignal) {
  return Promise.all([
    getTestScenario(testScenarioId, signal),
    listScenarioMessages(testScenarioId, signal),
  ])
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/**
 * Owns one scenario conversation: the stored transcript, the agent's stream,
 * the canvas draft the user edits, and whether the chat is still open.
 *
 * The stream is the only path an agent reply arrives on — a send returns as
 * soon as the relay is accepted — so the transport and the transcript cannot be
 * separated into two hooks without the screen having to reconcile them.
 */
export function useScenarioSession(testScenarioId: number) {
  const { t } = useI18n()
  const [state, setState] = useState<SessionState>(loadingState)
  const [draft, setDraft] = useState<ScenarioDraft>(EMPTY_SCENARIO_DRAFT)
  const [closure, setClosure] = useState<ChatClosure | null>(null)
  const [sending, setSending] = useState(false)
  const [awaitingReply, setAwaitingReply] = useState(false)
  const [sendFailure, setSendFailure] = useState<string | null>(null)
  // A subscription is assumed live until the transport says otherwise; see the
  // `open` listener for why it cannot be the thing that proves it.
  const [connected, setConnected] = useState(true)

  const savedRef = useRef(EMPTY_SCENARIO_DRAFT)
  useEffect(() => {
    savedRef.current = state.saved
  }, [state.saved])

  const applyLoaded = useCallback(([scenario, messages]: Awaited<ReturnType<typeof load>>) => {
    setState({ status: 'ready', saved: scenario.payload, messages })
    // The canvas follows the server on a full read. Anything the user had typed
    // into it belongs to a screen that is being rebuilt from scratch.
    setDraft(scenario.payload)
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    load(testScenarioId, controller.signal)
      .then(applyLoaded)
      .catch((error: unknown) => {
        if (isAbort(error)) return
        setState({
          ...loadingState,
          status: error instanceof ProjectApiError && error.isNotFound ? 'missing' : 'error',
        })
      })

    return () => controller.abort()
  }, [testScenarioId, applyLoaded])

  /**
   * Re-reads both halves after a gap in the stream.
   *
   * The stream has no replay buffer: an event emitted while nothing was
   * subscribed is dropped by the server, and the subscription is torn down the
   * moment the connection breaks. The `payload` and the transcript are stored,
   * though, so re-reading them recovers the outcome of anything that was
   * missed. A failure here is left alone — what is on screen is still valid,
   * just older than the user hoped.
   *
   * Unlike a full read, this keeps unsent canvas edits. The user made them and
   * nothing has replaced them: a dropped connection is not an answer, and
   * discarding work over a blip the user never saw would be its own bug.
   */
  const recover = useCallback(() => {
    load(testScenarioId)
      .then(([scenario, messages]) => {
        setDraft((current) =>
          isScenarioDraftEqual(current, savedRef.current) ? scenario.payload : current,
        )
        setState({ status: 'ready', saved: scenario.payload, messages })
      })
      .catch(() => undefined)
  }, [testScenarioId])

  // A closed conversation drops the stream. `EventSource` would otherwise keep
  // reconnecting to a session that can no longer produce anything, and the
  // screen has already committed to being an archive until the user reloads.
  useEffect(() => {
    if (state.status !== 'ready' || closure !== null) return undefined

    const source = new EventSource(scenarioStreamUrl(testScenarioId), { withCredentials: true })
    /*
     * `open` cannot be used to mean "subscribed". The server commits the SSE
     * response on its first element, so on a quiet stream the headers — and
     * therefore `open` — do not arrive until the agent says something. Treating
     * that as "not connected yet" would flag a healthy screen as reconnecting
     * for as long as the user takes to type, and would delay recovery until an
     * event that may never come.
     *
     * So the subscription is assumed live, and only a transport failure moves
     * it. `open` is what clears that state again.
     */
    let live = true

    source.addEventListener('open', () => {
      live = true
      setConnected(true)
    })

    source.addEventListener('result', (event: Event) => {
      if (!(event instanceof MessageEvent)) return

      const parsed = parseStreamEvent(event.data)
      if (parsed === null || parsed.type !== 'result') return

      setAwaitingReply(false)
      setState((previous) => ({
        ...previous,
        saved: parsed.scenario ?? previous.saved,
        messages: [
          ...previous.messages.map((message) => ({ ...message, pending: false })),
          {
            id: `reply-${previous.messages.length}`,
            role: 'ASSISTANT' as const,
            content: parsed.message,
            createdAt: null,
            pending: false,
          },
        ],
      }))

      // The agent answered the draft it was given, so its revision supersedes
      // whatever the canvas held. Keeping local edits here would show a
      // scenario that neither side agreed to.
      if (parsed.scenario !== null) {
        setDraft(parsed.scenario)
      }
    })

    /*
     * `error` is two different things on one listener. The server names its
     * failure event `error`, and `EventSource` reports transport failures under
     * the same name; only the server's arrives as a `MessageEvent` with a body.
     *
     * A transport failure is not a closed session — `EventSource` reconnects on
     * its own. Only the server's own failure closes the chat.
     *
     * Recovery runs the moment the gap is noticed rather than when the socket
     * returns: the scenario and the transcript are stored, so re-reading them
     * does not depend on the stream coming back. `live` keeps that to once per
     * gap, since `EventSource` reports a failure on every retry.
     */
    source.addEventListener('error', (event: Event) => {
      if (!(event instanceof MessageEvent)) {
        setConnected(false)
        if (live) {
          live = false
          recover()
        }
        return
      }

      const parsed = parseStreamEvent(event.data)
      if (parsed === null || parsed.type !== 'error') return

      setAwaitingReply(false)
      setState((previous) => ({
        ...previous,
        messages: previous.messages.map((message) => ({ ...message, pending: false })),
      }))
      setClosure(closureFromStreamFailure(parsed))
    })

    return () => {
      source.close()
      setConnected(false)
    }
  }, [closure, state.status, testScenarioId, recover])

  /**
   * Sends one message and appends it to the thread immediately.
   *
   * The reply arrives on the stream, so the message stays `pending` after the
   * request resolves — the send being accepted is not the agent having
   * answered, and a thread that looked settled at that point would be lying.
   *
   * The canvas travels with every message, changed or not. There is no endpoint
   * that stores a draft, so this is the only way one reaches the agent — and
   * sending it unconditionally keeps the agent anchored to the scenario on
   * screen rather than to whatever its own history window still holds.
   */
  const send = useCallback(
    async (message: string) => {
      const trimmed = message.trim()
      if (trimmed.length === 0 || sending || closure !== null) return false

      setSending(true)
      setSendFailure(null)

      setState((previous) => ({
        ...previous,
        messages: [
          ...previous.messages,
          {
            id: `sent-${previous.messages.length}`,
            role: 'USER' as const,
            content: trimmed,
            createdAt: null,
            pending: true,
          },
        ],
      }))
      setAwaitingReply(true)

      try {
        await sendScenarioMessage(testScenarioId, trimmed, draft)
        return true
      } catch (error: unknown) {
        setAwaitingReply(false)
        setState((previous) => ({
          ...previous,
          // The message never reached the agent, so it is taken back off the
          // thread rather than left sitting there as though it had.
          messages: previous.messages.filter((existing) => !existing.pending),
        }))

        const closed = closureFromSendFailure(error)
        if (closed !== null) {
          setClosure(closed)
        } else {
          setSendFailure(
            error instanceof ProjectApiError ? error.message : t.scenarios.chat.sendFailed,
          )
        }
        return false
      } finally {
        setSending(false)
      }
    },
    [closure, draft, sending, testScenarioId, t],
  )

  const reload = useCallback(() => {
    setState(loadingState)
    setClosure(null)
    setSendFailure(null)
    load(testScenarioId)
      .then(applyLoaded)
      .catch((error: unknown) => {
        setState({
          ...loadingState,
          status: error instanceof ProjectApiError && error.isNotFound ? 'missing' : 'error',
        })
      })
  }, [testScenarioId, applyLoaded])

  return {
    status: state.status,
    messages: state.messages,
    saved: state.saved,
    draft,
    /** Canvas edits that no message has carried to the agent yet. */
    dirty: !isScenarioDraftEqual(draft, state.saved),
    closure,
    connected,
    sending,
    awaitingReply,
    sendFailure,
    editDraft: setDraft,
    send,
    reload,
  }
}
