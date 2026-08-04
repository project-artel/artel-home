import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../testScenarios/scenarioTypes'
import {
  closeRunChat,
  commitRunScenarios,
  listRunChatMessages,
  parseRunStreamEvent,
  runChatStreamUrl,
  sendRunChatMessage,
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
    source.addEventListener('error', (event: Event) => {
      if (event instanceof MessageEvent) {
        // A server `error` frame closes the session.
        const parsed = parseRunStreamEvent(event.data)
        if (parsed !== null && parsed.type === 'error') {
          setClosed(true)
          setAwaitingReply(false)
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
      try {
        await sendRunChatMessage(projectId, runId, trimmed, autoApply)
        return true
      } catch {
        // Drop the optimistic pending message and surface the failure.
        setMessages((previous) => previous.filter((m) => !m.pending))
        setAwaitingReply(false)
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
    } catch {
      // Best-effort teardown; the session expires on its own if this fails.
    }
  }, [projectId, runId])

  return {
    active: runId !== null,
    messages,
    proposals,
    connected,
    awaitingReply,
    sending,
    sendFailure,
    closed,
    applying,
    autoApply,
    setAutoApply,
    send,
    applyProposals,
    dropProposal,
    close,
  }
}
