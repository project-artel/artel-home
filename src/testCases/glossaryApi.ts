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
  setBy: Record<'kind' | 'meaning' | 'options' | 'start', TermSource>
  issues: TermIssue[]
  /** 이 이름을 필요 · 남김으로 쓰는 TC 수. */
  usedBy: number
}

/** 사람이 고친 칸만 보낸다. */
export type GlossaryTermEdit = {
  name: string
  kind?: string
  meaning?: string
  options?: string[]
  start?: string
  aliases?: string[]
}

function root(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/case-glossary`
}

export async function fetchGlossary(projectId: string, signal?: AbortSignal): Promise<GlossaryTerm[]> {
  const response = await apiFetch(root(projectId), { signal })
  if (!response.ok) throw await toApiError(response)
  const body = asRecord(await readJson(response))
  const terms = Array.isArray(body?.terms) ? body.terms : []
  return terms.map(parseGlossaryTerm).filter((term): term is GlossaryTerm => term !== null)
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
    setBy: { kind: asSource(setBy.kind), meaning: asSource(setBy.meaning), options: asSource(setBy.options), start: asSource(setBy.start) },
    issues: strings(record.issues).filter((issue): issue is TermIssue => ISSUES.includes(issue as TermIssue)),
    usedBy: typeof record.usedBy === 'number' ? record.usedBy : 0,
  }
}
