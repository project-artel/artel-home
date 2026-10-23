import { apiFetch, orchestrationUrlFor } from '../../auth/authApi'
import { asRecord, asString, jsonRequest, ProjectApiError, readJson, toApiError } from '../../projects/projectApi'
import type { WirePageCatalog } from '../catalog'
import type { PageSnapshot, ToolStatus } from '../registry/types'
import type { ToolResultBody } from './toolTypes'

/*
 * project agent 대화 API. 계약은 workspace 저장소
 * `.plan/general/2026-10-20-project-agent-wire-contract.md` 2절이다.
 *
 * `runChatApi.ts` 와 같은 모양이다. 모든 호출은 `apiFetch` 를 거치고(cookie 인증, 401 처리),
 * SSE stream 만 `EventSource` 의 `withCredentials` 로 cookie 를 싣는다.
 */

export const CONVERSATION_STATUSES = ['IDLE', 'RUNNING', 'AWAITING_TOOL', 'ERROR'] as const
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number]

export const MESSAGE_ROLES = ['USER', 'ASSISTANT', 'TOOL_RESULT', 'EVENT', 'NOTICE'] as const
export type MessageRole = (typeof MESSAGE_ROLES)[number]

const TOOL_STATUSES: readonly ToolStatus[] = ['ok', 'error', 'rejected', 'unavailable', 'cancelled']

export type Conversation = {
  id: number
  projectId: number
  title: string | null
  status: ConversationStatus
  createdAt: string
  lastMessageAt: string
}

/** ASSISTANT 메시지가 실은 tool 호출 하나. args 는 model 이 보낸 그대로라 열린 JSON 이다. */
export type ToolCall = {
  callId: string
  tool: string
  args: Record<string, unknown>
}

export type ToolResultRecord = {
  callId: string
  status: ToolStatus
  error: string | null
}

/**
 * 저장된 메시지 하나. role 마다 쓰는 칸이 다르다.
 * - ASSISTANT: `toolCalls`
 * - TOOL_RESULT: `toolResult`
 * - EVENT, NOTICE: `kind`
 * - NOTICE: `cause`, `model`, `keySource` (실패 원인. 없는 서버에서는 null)
 */
export type AgentMessage = {
  id: number
  conversationId: number
  role: MessageRole
  content: string
  createdAt: string
  toolCalls: ToolCall[]
  toolResult: ToolResultRecord | null
  kind: string | null
  cause: string | null
  model: string | null
  keySource: 'platform' | 'user' | null
}

/** 숫자 id 를 읽는다. Long 이 문자열로 오는 경우도 받는다. */
function asId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  return null
}

function asStatus(value: unknown): ConversationStatus | null {
  return CONVERSATION_STATUSES.find((status) => status === value) ?? null
}

export function parseConversation(data: unknown): Conversation | null {
  const record = asRecord(data)
  if (record === null) return null
  const id = asId(record.id)
  const status = asStatus(record.status)
  if (id === null || status === null) return null
  const title = asString(record.title)
  return {
    id,
    projectId: asId(record.projectId) ?? 0,
    title: title.length > 0 ? title : null,
    status,
    createdAt: asString(record.createdAt),
    lastMessageAt: asString(record.lastMessageAt),
  }
}

function parseToolCalls(value: unknown): ToolCall[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const record = asRecord(entry)
    if (record === null) return []
    const callId = asString(record.callId)
    const tool = asString(record.tool)
    if (callId.length === 0 || tool.length === 0) return []
    return [{ callId, tool, args: asRecord(record.args) ?? {} }]
  })
}

function parseToolResult(payload: Record<string, unknown> | null): ToolResultRecord | null {
  if (payload === null) return null
  const callId = asString(payload.callId)
  const status = TOOL_STATUSES.find((one) => one === payload.status)
  if (callId.length === 0 || status === undefined) return null
  const error = asString(payload.error)
  return { callId, status, error: error.length > 0 ? error : null }
}

/** 모르는 role 이나 id 가 없는 메시지는 버린다. 화면에 빈 줄을 그리지 않게 한다. */
export function parseMessage(data: unknown): AgentMessage | null {
  const record = asRecord(data)
  if (record === null) return null
  const id = asId(record.id)
  const role = MESSAGE_ROLES.find((one) => one === record.role)
  if (id === null || role === undefined) return null
  const payload = asRecord(record.payload)
  const kind = asString(payload?.kind)
  const isNotice = role === 'NOTICE'
  const cause = asString(payload?.cause)
  const model = asString(payload?.model)
  return {
    id,
    conversationId: asId(record.conversationId) ?? 0,
    role,
    content: asString(record.content),
    createdAt: asString(record.createdAt),
    toolCalls: role === 'ASSISTANT' ? parseToolCalls(payload?.toolCalls) : [],
    toolResult: role === 'TOOL_RESULT' ? parseToolResult(payload) : null,
    kind: (role === 'EVENT' || role === 'NOTICE') && kind.length > 0 ? kind : null,
    cause: isNotice && cause.length > 0 ? cause : null,
    model: isNotice && model.length > 0 ? model : null,
    keySource: isNotice && (payload?.keySource === 'platform' || payload?.keySource === 'user') ? payload.keySource : null,
  }
}

function parseItems<T>(data: unknown, parse: (value: unknown) => T | null): T[] {
  const items = asRecord(data)?.items
  if (!Array.isArray(items)) return []
  return items.map(parse).filter((item): item is T => item !== null)
}

export function parseConversationList(data: unknown): Conversation[] {
  return parseItems(data, parseConversation)
}

export function parseMessageList(data: unknown): AgentMessage[] {
  return parseItems(data, parseMessage)
}

function parseJson(data: string): unknown {
  try {
    return JSON.parse(data)
  } catch {
    return null
  }
}

/** SSE `message` event 의 data. 읽을 수 없으면 null 이고 버린다. */
export function parseMessageEvent(data: string): AgentMessage | null {
  return parseMessage(parseJson(data))
}

/** SSE `conversation` event 의 data. */
export function parseConversationEvent(data: string): Conversation | null {
  return parseConversation(parseJson(data))
}

function conversationsPath(projectId: string, suffix = ''): string {
  return `/api/projects/${encodeURIComponent(projectId)}/agent/conversations${suffix}`
}

function conversationPath(projectId: string, conversationId: number, suffix = ''): string {
  return conversationsPath(projectId, `/${conversationId}${suffix}`)
}

async function readConversation(response: Response): Promise<Conversation> {
  const conversation = parseConversation(await readJson(response))
  if (conversation === null) {
    throw new ProjectApiError(response.status, 'The server returned an unreadable conversation.')
  }
  return conversation
}

async function readMessage(response: Response): Promise<AgentMessage> {
  const message = parseMessage(await readJson(response))
  if (message === null) {
    throw new ProjectApiError(response.status, 'The server returned an unreadable message.')
  }
  return message
}

export async function listConversations(projectId: string, signal?: AbortSignal): Promise<Conversation[]> {
  const response = await apiFetch(conversationsPath(projectId), { signal })
  return parseConversationList(await readJson(response))
}

export async function createConversation(projectId: string, pageCatalog: WirePageCatalog): Promise<Conversation> {
  const response = await apiFetch(conversationsPath(projectId), {
    method: 'POST',
    ...jsonRequest({ pageCatalog }),
  })
  return readConversation(response)
}

export async function getConversation(
  projectId: string,
  conversationId: number,
  signal?: AbortSignal,
): Promise<Conversation> {
  const response = await apiFetch(conversationPath(projectId, conversationId), { signal })
  return readConversation(response)
}

export async function deleteConversation(projectId: string, conversationId: number): Promise<void> {
  const response = await apiFetch(conversationPath(projectId, conversationId), { method: 'DELETE' })
  if (!response.ok) throw await toApiError(response)
}

export async function listMessages(
  projectId: string,
  conversationId: number,
  signal?: AbortSignal,
): Promise<AgentMessage[]> {
  const response = await apiFetch(conversationPath(projectId, conversationId, '/messages'), { signal })
  return parseMessageList(await readJson(response))
}

export async function sendMessage(
  projectId: string,
  conversationId: number,
  body: { text: string; pageCatalog: WirePageCatalog; page: PageSnapshot },
): Promise<AgentMessage> {
  const response = await apiFetch(conversationPath(projectId, conversationId, '/messages'), {
    method: 'POST',
    ...jsonRequest(body),
  })
  return readMessage(response)
}

export async function sendToolResult(
  projectId: string,
  conversationId: number,
  callId: string,
  body: ToolResultBody,
): Promise<AgentMessage> {
  const response = await apiFetch(conversationPath(projectId, conversationId, '/tool-results'), {
    method: 'POST',
    ...jsonRequest({ callId, ...body }),
  })
  return readMessage(response)
}

export async function sendEvent(
  projectId: string,
  conversationId: number,
  body: { kind: string; summary: string; data?: unknown },
): Promise<AgentMessage> {
  const response = await apiFetch(conversationPath(projectId, conversationId, '/events'), {
    method: 'POST',
    ...jsonRequest(body),
  })
  return readMessage(response)
}

export async function cancelConversation(projectId: string, conversationId: number): Promise<Conversation> {
  const response = await apiFetch(conversationPath(projectId, conversationId, '/cancel'), { method: 'POST' })
  return readConversation(response)
}

/** SSE stream 의 절대 URL. EventSource 는 `apiFetch` 를 거칠 수 없다. */
export function conversationStreamUrl(projectId: string, conversationId: number): string {
  return orchestrationUrlFor(conversationPath(projectId, conversationId, '/stream'))
}

/**
 * 409 인지. `conversation_busy` 와 `not_pending` 둘 다 409 로 온다. 둘 다 다른 탭이나 멈추기가
 * 먼저 처리했다는 뜻이라 화면에 오류로 띄우지 않는다.
 */
export function isConflict(error: unknown): boolean {
  return error instanceof ProjectApiError && error.status === 409
}
