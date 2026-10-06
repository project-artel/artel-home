import { createContext } from 'react'
import type { ChatRef } from './runChatApi'

/** The refs of the line being drawn. Set by the message body around its content. */
export const ChatRefsContext = createContext<ChatRef[]>([])

/** Where a TS chip goes. Set once by the chat panel; without it a TS chip is plain text. */
export const ChatLinkContext = createContext<{ projectId: string; runId: string | null } | null>(null)
