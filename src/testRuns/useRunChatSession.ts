import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../testScenarios/scenarioTypes'
import {
  closeRunChat,
  commitRunScenarios,
  listRunChatMessages,
  parseRunStreamEvent,
  runChatStreamUrl,
  sendRunChatMessage,
  TERMINAL_STAGES,
  type AuthoringStage,
  type ScenarioProposal,
} from './runChatApi'

/*
 * Run-scoped authoring chat (ARTEL-206 Step 6). The conversation belongs to the
 * run, so this hook keeps the messaging + SSE parts of the old per-scenario chat
 * but drops its single step-draft/undo — scenario bodies are the case
 * composition, a separate hook. The agent's results surface as proposal cards;
 * whether they were already saved depends on the autoApply toggle sent with the
 * message.
 */

// Default OFF = card review ON (the user reviews before anything is written).
const AUTO_APPLY_KEY = 'artel.run-chat.autoApply'

function readAutoApply(): boolean {
  try {
    return window.localStorage.getItem(AUTO_APPLY_KEY) === 'true'
  } catch {
    return false
  }
}

function writeAutoApply(value: boolean): void {
  try {
    window.localStorage.setItem(AUTO_APPLY_KEY, String(value))
  } catch {
    // Storage can be unavailable (private mode); the toggle just won't persist.
  }
}

export type RunChatSession = ReturnType<typeof useRunChatSession>

/**
 * @param projectId owning project (string id).
 * @param runId the run whose conversation this is, or null when the studio was
 *   opened outside a run — then the chat is inert (no run to author into).
 * @param onApplied called after scenarios are written (auto-apply or a card
 *   commit) so the page can reload the composition/rail to reflect them.
 */
export function useRunChatSession(
  projectId: string,
  runId: string | null,
  onApplied?: () => void,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [proposals, setProposals] = useState<ScenarioProposal[]>([])
  const [connected, setConnected] = useState(false)
  const [awaitingReply, setAwaitingReply] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendFailure, setSendFailure] = useState<string | null>(null)
  const [closed, setClosed] = useState(false)
  const [applying, setApplying] = useState(false)
  const [autoApply, setAutoApplyState] = useState(readAutoApply)

  // Stages of the turn in flight (ARTEL-419), in arrival order. Empty = nothing to
  // show: either no turn is running or the one that was has reached its end.
  const [stages, setStages] = useState<AuthoringStage[]>([])
  // When the current turn was sent, so the wait can be counted out loud. Elapsed
  // time is what separates "slow" from "stuck" while the server has nothing new
  // to report — and having nothing to report is the normal case between stages.
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null)

  // The autoApply value sent with the in-flight message decides how its result is
  // handled, even if the user toggles before the reply lands.
  const inFlightAutoApply = useRef(autoApply)
  const onAppliedRef = useRef(onApplied)
  useEffect(() => {
    onAppliedRef.current = onApplied
  }, [onApplied])

  const setAutoApply = useCallback((value: boolean) => {
    setAutoApplyState(value)
    writeAutoApply(value)
  }, [])

  // Load the run's thread and open the SSE stream. Re-runs if the run changes.
  // runId is stable for the studio's lifetime, so there's no value→null reset to do.
  useEffect(() => {
    if (runId === null) return
    const controller = new AbortController()
    let source: EventSource | null = null

    void listRunChatMessages(projectId, runId, controller.signal)
      .then((loaded) => setMessages(loaded))
      .catch(() => {
        // A fresh run has no thread yet; leave it empty.
      })

    source = new EventSource(runChatStreamUrl(projectId, runId), { withCredentials: true })
    source.addEventListener('open', () => setConnected(true))
    source.addEventListener('result', (event: Event) => {
      if (!(event instanceof MessageEvent)) return
      const parsed = parseRunStreamEvent(event.data)
      if (parsed === null || parsed.type !== 'result') return
      setAwaitingReply(false)
      setMessages((previous) => [
        ...previous.map((message) => ({ ...message, pending: false })),
        {
          id: `reply-${previous.length}`,
          role: 'ASSISTANT' as const,
          content: parsed.message,
          createdAt: null,
          pending: false,
        },
      ])
      // In card-review mode the result IS the end of the turn — no audit runs, so
      // no terminal stage will arrive and the indicator has to close itself here.
      // Under auto-apply, checking/saved still follow: leave it up.
      if (!inFlightAutoApply.current) {
        setStages([])
        setTurnStartedAt(null)
      }
      if (parsed.scenarios.length > 0) {
        if (inFlightAutoApply.current) {
          // Server already reconciled these; reflect them in the composition/rail.
          onAppliedRef.current?.()
        } else {
          // Card-review mode: surface as proposals for the user to apply or drop.
          setProposals((previous) => [...previous, ...parsed.scenarios])
        }
      }
    })
    source.addEventListener('progress', (event: Event) => {
      if (!(event instanceof MessageEvent)) return
      const parsed = parseRunStreamEvent(event.data)
      if (parsed === null || parsed.type !== 'progress') return
      const { stage } = parsed
      if (TERMINAL_STAGES.includes(stage)) {
        // The turn is over. What happened is already in the thread (the agent's
        // reply, or the notice explaining the refusal) — keeping a spent stepper
        // on screen would just be one more thing to read.
        setStages([])
        setTurnStartedAt(null)
        return
      }
      // A repair turn was sent back to the agent, so another reply is coming. The
      // `result` that triggered it already cleared the waiting state; restore it,
      // or the wait that follows looks like nothing is happening.
      if (stage === 'repairing') setAwaitingReply(true)
      setStages((previous) =>
        previous[previous.length - 1] === stage ? previous : [...previous, stage],
      )
    })
    source.addEventListener('notice', (event: Event) => {
      if (!(event instanceof MessageEvent)) return
      const parsed = parseRunStreamEvent(event.data)
      if (parsed === null || parsed.type !== 'notice' || parsed.message.length === 0) return
      setMessages((previous) => [
        ...previous,
        {
          id: `notice-${previous.length}`,
          role: 'ASSISTANT' as const,
          content: parsed.message,
          createdAt: null,
          pending: false,
        },
      ])
    })
    source.addEventListener('error', (event: Event) => {
      if (event instanceof MessageEvent) {
        // A server `error` frame is a failed turn, not a dead session: clear the
        // pending state and surface the reason as an assistant message so the user
        // can just try again (do NOT close the chat).
        const parsed = parseRunStreamEvent(event.data)
        if (parsed !== null && parsed.type === 'error') {
          setAwaitingReply(false)
          setStages([])
          setTurnStartedAt(null)
          setMessages((previous) => [
            ...previous.map((m) => ({ ...m, pending: false })),
            {
              id: `err-${previous.length}`,
              role: 'ASSISTANT' as const,
              content: parsed.detail.length > 0 ? parsed.detail : '요청을 처리하지 못했습니다. 다시 시도해 주세요.',
              createdAt: null,
              pending: false,
            },
          ])
        }
        return
      }
      // Transport hiccup: mark disconnected; EventSource retries on its own.
      setConnected(false)
    })

    return () => {
      controller.abort()
      source?.close()
    }
  }, [projectId, runId])

  const send = useCallback(
    async (message: string): Promise<boolean> => {
      const trimmed = message.trim()
      if (runId === null || trimmed.length === 0 || sending) return false
      setSending(true)
      setSendFailure(null)
      inFlightAutoApply.current = autoApply
      setMessages((previous) => [
        ...previous,
        {
          id: `user-${previous.length}`,
          role: 'USER' as const,
          content: trimmed,
          createdAt: null,
          pending: true,
        },
      ])
      setAwaitingReply(true)
      // A new turn starts its own history; the previous turn's stages are done.
      setStages([])
      setTurnStartedAt(Date.now())
      try {
        await sendRunChatMessage(projectId, runId, trimmed, autoApply)
        return true
      } catch {
        // Drop the optimistic pending message and surface the failure.
        setMessages((previous) => previous.filter((m) => !m.pending))
        setAwaitingReply(false)
        setStages([])
        setTurnStartedAt(null)
        setSendFailure('send-failed')
        return false
      } finally {
        setSending(false)
      }
    },
    [projectId, runId, sending, autoApply],
  )

  const applyProposals = useCallback(
    async (toApply: ScenarioProposal[]): Promise<boolean> => {
      if (runId === null || toApply.length === 0 || applying) return false
      setApplying(true)
      try {
        await commitRunScenarios(projectId, runId, toApply)
        setProposals((previous) => previous.filter((p) => !toApply.includes(p)))
        onAppliedRef.current?.()
        return true
      } catch {
        return false
      } finally {
        setApplying(false)
      }
    },
    [projectId, runId, applying],
  )

  const dropProposal = useCallback((proposal: ScenarioProposal) => {
    setProposals((previous) => previous.filter((p) => p !== proposal))
  }, [])

  const close = useCallback(async () => {
    if (runId === null) return
    try {
      await closeRunChat(projectId, runId)
      setClosed(true)
    } catch {
      // Best-effort teardown; the session expires on its own if this fails.
    }
  }, [projectId, runId])

  return {
    active: runId !== null,
    // 커버리지를 읽는 쪽이 이 세션 안에 있다(RunChat). 파라미터로 이미 들고 있는 값을
    // 밖으로 내보내 프롭을 하나 더 엮지 않는다.
    projectId,
    messages,
    proposals,
    connected,
    awaitingReply,
    sending,
    sendFailure,
    closed,
    applying,
    autoApply,
    stages,
    turnStartedAt,
    setAutoApply,
    send,
    applyProposals,
    dropProposal,
    close,
  }
}
