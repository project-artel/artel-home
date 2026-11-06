import { apiFetch } from '../auth/authApi'
import { asRecord, asString, jsonRequest, readJson, toApiError } from '../projects/projectApi'

/** 용어 칸을 정한 쪽(ARTEL-1313). 사람이 정한 칸은 AI · MCP 가 덮지 않는다. */
export type TermSource = 'ai' | 'mcp' | 'user'

export type TermKind = 'has' | 'value' | 'counter'

export const TERM_KINDS: readonly TermKind[] = ['has', 'value', 'counter']

/** 사람이 확인할 이유. 서버가 정한다. */
export type TermIssue = 'NO_MEANING' | 'NO_START' | 'START_MISMATCH'

export type GlossaryTerm = {
  name: string
  kind: string
  meaning: string
  options: string[]
  /** 새 게임을 시작할 때 값. 모르면 `unknown`. */
  start: string
  aliases: string[]
  setBy: Record<'kind' | 'meaning' | 'options' | 'start' | 'gameVariable', TermSource>
  issues: TermIssue[]
  /** 이 이름을 필요 · 남김으로 쓰는 TC 수. */
  usedBy: number
  /** 이 이름에 이은 게임 변수(SDK 가 알려 준 변수 이름, ARTEL-1396). 없으면 null. */
  gameVariable: string | null
}

/** 화면 이동 하나(ARTEL-1396). [source] 는 알려 준 쪽, QA 가 지나가며 본 것은 null. */
export type GlossaryExit = { from: string; to: string; by: string; source: TermSource | null }

export type GlossaryBook = { terms: GlossaryTerm[]; exits: GlossaryExit[] }

/** 사람이 고친 칸만 보낸다. */
export type GlossaryTermEdit = {
  name: string
  kind?: string
  meaning?: string
  options?: string[]
  start?: string
  aliases?: string[]
  /** 빈 값이면 연결을 끊는다. */
  gameVariable?: string
}

function root(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/case-glossary`
}

export async function fetchGlossary(projectId: string, signal?: AbortSignal): Promise<GlossaryTerm[]> {
  return (await fetchGlossaryBook(projectId, signal)).terms
}

/** 상태 이름과 화면 이동을 함께 읽는다(게임 사전, ARTEL-1396). */
export async function fetchGlossaryBook(projectId: string, signal?: AbortSignal): Promise<GlossaryBook> {
  const response = await apiFetch(root(projectId), { signal })
  if (!response.ok) throw await toApiError(response)
  return parseGlossaryBook(await readJson(response))
}

export function parseGlossaryBook(data: unknown): GlossaryBook {
  const body = asRecord(data)
  const terms = Array.isArray(body?.terms) ? body.terms : []
  const exits = Array.isArray(body?.exits) ? body.exits : []
  return {
    terms: terms.map(parseGlossaryTerm).filter((term): term is GlossaryTerm => term !== null),
    exits: exits.flatMap((value): GlossaryExit[] => {
      const record = asRecord(value)
      const from = asString(record?.from)
      const to = asString(record?.to)
      if (record === null || from.length === 0 || to.length === 0) return []
      const source = SOURCES.includes(record.source as TermSource) ? (record.source as TermSource) : null
      return [{ from, to, by: asString(record.by), source }]
    }),
  }
}

export async function editGlossaryTerm(projectId: string, edit: GlossaryTermEdit): Promise<GlossaryTerm> {
  const response = await apiFetch(`${root(projectId)}/terms`, { method: 'PUT', ...jsonRequest(edit) })
  if (!response.ok) throw await toApiError(response)
  const term = parseGlossaryTerm(await readJson(response))
  if (term === null) throw new Error('용어 응답을 읽지 못했습니다.')
  return term
}

const SOURCES: readonly TermSource[] = ['ai', 'mcp', 'user']
const ISSUES: readonly TermIssue[] = ['NO_MEANING', 'NO_START', 'START_MISMATCH']

function asSource(value: unknown): TermSource {
  return SOURCES.includes(value as TermSource) ? (value as TermSource) : 'ai'
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function parseGlossaryTerm(value: unknown): GlossaryTerm | null {
  const record = asRecord(value)
  if (record === null) return null
  const name = asString(record.name)
  if (name.length === 0) return null
  const setBy = asRecord(record.setBy) ?? {}
  return {
    name,
    kind: asString(record.kind),
    meaning: asString(record.meaning),
    options: strings(record.options),
    start: asString(record.start) || 'unknown',
    aliases: strings(record.aliases),
    setBy: {
      kind: asSource(setBy.kind),
      meaning: asSource(setBy.meaning),
      options: asSource(setBy.options),
      start: asSource(setBy.start),
      gameVariable: asSource(setBy.game_variable),
    },
    issues: strings(record.issues).filter((issue): issue is TermIssue => ISSUES.includes(issue as TermIssue)),
    usedBy: typeof record.usedBy === 'number' ? record.usedBy : 0,
    gameVariable: typeof record.gameVariable === 'string' && record.gameVariable.length > 0 ? record.gameVariable : null,
  }
}
