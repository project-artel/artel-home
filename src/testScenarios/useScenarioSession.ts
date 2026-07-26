import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { ProjectApiError } from '../projects/projectApi'
import {
  getTestScenario,
  listScenarioMessages,
  parseStreamEvent,
  scenarioStreamUrl,
  sendScenarioMessage,
  updateScenario,
} from './scenarioApi'
import { closureFromSendFailure, closureFromStreamFailure, type ChatClosure } from './chatAvailability'
import {
  EMPTY_SCENARIO_DRAFT,
  isScenarioDraftEqual,
  type ChatMessage,
  type ScenarioDraft,
} from './scenarioTypes'

/**
 * How long the canvas must sit still before an edit is autosaved. Drag-reorder
 * and typing both fire many changes in a burst; waiting for a pause collapses
 * them into one `PUT` instead of one per keystroke or per drag frame.
 */
const AUTOSAVE_DEBOUNCE_MS = 600

/**
 * How many committed scenario states the undo stack keeps.
 *
 * Undo is client-only and in-memory: it does not survive a reload (neither does
 * Google Docs'), and the work itself is never lost because autosave persists the
 * current state regardless. The window is a backstop, not a tuned value — users
 * undo a step or two, each entry is an already-committed state (drag bursts are
 * collapsed into one by the autosave debounce, so the stack never floods), and
 * anything past ~20 is "version history" territory this product does not keep.
 */
const UNDO_WINDOW = 20

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
  // True only while an autosave `PUT` is in flight — not during the debounce
  // wait. `dirty` covers "there are unsaved edits"; this covers "saving now".
  const [saving, setSaving] = useState(false)

  const savedRef = useRef(EMPTY_SCENARIO_DRAFT)
  useEffect(() => {
    savedRef.current = state.saved
  }, [state.saved])

  // The undo stack: committed scenario states (each `saved` transition) with a
  // cursor into them. Kept in refs — moving through them is not itself render
  // state; only whether undo/redo are available is. See the snapshot effect.
  const undoStackRef = useRef<ScenarioDraft[]>([])
  const undoCursorRef = useRef(-1)
  const [undoAvail, setUndoAvail] = useState({ canUndo: false, canRedo: false })

  const syncUndoAvail = useCallback(() => {
    const cursor = undoCursorRef.current
    setUndoAvail({
      canUndo: cursor > 0,
      canRedo: cursor >= 0 && cursor < undoStackRef.current.length - 1,
    })
  }, [])

  const applyLoaded = useCallback(([scenario, messages]: Awaited<ReturnType<typeof load>>) => {
    // A full read is a fresh start: the prior scenario's undo history no longer
    // applies. The snapshot effect records the loaded payload as the new base.
    undoStackRef.current = []
    undoCursorRef.current = -1
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

  /**
   * Autosaves canvas edits on their own, debounced.
   *
   * Reordering a step or editing a field no longer waits for a message: a `PUT`
   * writes the current draft straight to the stored payload. Only genuine,
   * still-open, diverged edits are saved — a draft equal to `saved` (a fresh
   * load, or an agent revision the canvas adopted) has nothing to persist, so it
   * never fires on data the server just handed us. Rapid edits collapse into one
   * write `AUTOSAVE_DEBOUNCE_MS` after the last change.
   */
  useEffect(() => {
    if (state.status !== 'ready' || closure !== null) return undefined
    if (isScenarioDraftEqual(draft, state.saved)) return undefined

    let cancelled = false
    const timer = setTimeout(() => {
      setSaving(true)
      updateScenario(testScenarioId, draft)
        .then((scenario) => {
          // The stored payload becomes the new baseline, clearing `dirty`. Edits
          // made while the write was in flight still differ, so this effect runs
          // again and saves them. Guarded so a save that resolves after the
          // scenario changed does not stamp a stale baseline onto the new one.
          if (!cancelled) {
            setState((previous) => ({ ...previous, saved: scenario.payload }))
          }
        })
        .catch(() => {
          // The draft stays dirty and the next edit retries. Approve/message
          // also persist the draft, so a failed autosave is not a dead end.
        })
        .finally(() => setSaving(false))
    }, AUTOSAVE_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [draft, state.saved, state.status, closure, testScenarioId])

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
   * The canvas travels with every message, changed or not. Autosave persists the
   * draft to the DB, but the agent never reads it back — a message is the only
   * thing that hands the draft to the agent, so sending it unconditionally keeps
   * the agent anchored to the scenario on screen rather than to whatever its own
   * history window still holds.
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

  /**
   * Records every committed scenario state onto the undo stack.
   *
   * The trigger is `saved` changing — the server baseline moves on an autosave
   * `PUT`, an agent `result`, and a stream recovery, and nothing else. That is
   * exactly the granularity we want: one entry per persisted commit, with the
   * autosave debounce already collapsing a burst of drags into a single one, so
   * no extra coalescing is needed and the stack never fills with noise.
   *
   * When an undo/redo lands, `saved` becomes the entry the cursor already points
   * at, so the equality check skips it — that is how navigating the stack does
   * not itself push a new entry. A genuinely new commit (cursor not already on
   * it) drops any redo tail, appends, and trims to the window.
   */
  useEffect(() => {
    if (state.status !== 'ready') return
    const snapshot = state.saved
    const stack = undoStackRef.current
    const cursor = undoCursorRef.current
    if (cursor >= 0 && isScenarioDraftEqual(stack[cursor], snapshot)) return

    const kept = stack.slice(0, cursor + 1)
    kept.push(snapshot)
    const trimmed = kept.length > UNDO_WINDOW ? kept.slice(kept.length - UNDO_WINDOW) : kept
    undoStackRef.current = trimmed
    undoCursorRef.current = trimmed.length - 1
    syncUndoAvail()
  }, [state.saved, state.status, syncUndoAvail])

  // A finalized scenario (approve/decline) ends editing, so its undo history is
  // dropped. The canvas is read-only past this point and cannot undo anyway.
  useEffect(() => {
    if (closure === null) return
    undoStackRef.current = []
    undoCursorRef.current = -1
    syncUndoAvail()
  }, [closure, syncUndoAvail])

  /**
   * Moves the cursor to the adjacent committed state and puts it on the canvas.
   *
   * Persisting the reverted state is left to the normal autosave path: the draft
   * now differs from `saved`, so the debounced `PUT` writes it, and the next
   * agent request's `draft` is built from it — the reverted state becomes the
   * one both sides agree on. The canvas reflects the undo immediately regardless.
   */
  const undo = useCallback(() => {
    if (undoCursorRef.current <= 0) return
    undoCursorRef.current -= 1
    setDraft(undoStackRef.current[undoCursorRef.current])
    syncUndoAvail()
  }, [syncUndoAvail])

  const redo = useCallback(() => {
    if (undoCursorRef.current >= undoStackRef.current.length - 1) return
    undoCursorRef.current += 1
    setDraft(undoStackRef.current[undoCursorRef.current])
    syncUndoAvail()
  }, [syncUndoAvail])

  return {
    status: state.status,
    messages: state.messages,
    saved: state.saved,
    draft,
    /** Canvas edits not yet persisted — autosave is pending, in flight, or failed. */
    dirty: !isScenarioDraftEqual(draft, state.saved),
    /** An autosave `PUT` is in flight right now. */
    saving,
    closure,
    connected,
    sending,
    awaitingReply,
    sendFailure,
    editDraft: setDraft,
    send,
    reload,
    undo,
    redo,
    /** Whether a previous committed state exists to revert to. */
    canUndo: undoAvail.canUndo,
    /** Whether an undone state can be reapplied. */
    canRedo: undoAvail.canRedo,
  }
}
