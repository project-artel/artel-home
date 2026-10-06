import { createContext } from 'react'
import type { ChatRef } from './runChatApi'

/** The refs of the line being drawn. Set by the message body around its content. */
export const ChatRefsContext = createContext<ChatRef[]>([])

/**
 * Where a chip goes. Set once by the chat panel; without it a chip is plain text.
 * `openCase` opens the TC library's detail sheet for that case (ARTEL-940).
 */
export const ChatLinkContext = createContext<{
  projectId: string
  runId: string | null
  openCase?: (caseId: number) => void
} | null>(null)
