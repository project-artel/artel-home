import { apiFetch } from '../auth/authApi'
import { ProjectApiError, asNullableString, asRecord, asString, readJson } from '../projects/projectApi'
import type {
  DeveloperMacroAuthor,
  DeveloperMacroDetail,
  DeveloperMacroSummary,
} from './developerMacroTypes'

/*
 * 프로젝트의 developer macro 를 읽는 호출 둘 (ARTEL-1102).
 *
 *   GET /api/projects/:projectId/developer-macros
 *   GET /api/projects/:projectId/developer-macros/:name
 *
 * 읽기 전용이다. 검사·등록·삭제(`:check`, `PUT`, `DELETE`)는 MCP 의 몫이고 이 화면은
 * 부르지 않는다.
 *
 * ## 계약의 출처
 *
 * `artel-orchestration-server` (ARTEL-1088) 의 `developermacro/dto/DeveloperMacroDtos.kt`,
 * `DeveloperMacroController.kt`, `docs/api-documentation.md` 의 "Developer macros" 를 읽고
 * 맞춘 것이다. 그쪽이 아직 머지되지 않았으므로, 머지 전에 모양이 바뀌면 **여기와
 * `developerMacroTypes.ts` 두 파일만 고치면 된다.**
 *
 * 확인한 모양:
 *
 *   - 목록은 `{ "items": [...] }` 이고 이름 오름차순이다.
 *   - 상세는 평평한 객체이고, 목록 한 줄에 `source` 하나가 더해진 모양이다.
 *   - 식별자는 `name` 이다. agent macro 처럼 숫자 `id` 가 없다.
 *   - `parameters` 는 **문자열 배열**이다. agent macro 의 `{name, type}` 이 아니다.
 *   - `gameBuildId` 는 문자열 id, `buildLabel` 은 nullable, `version` 은 정수다.
 *   - `updatedBy` 는 `{id, nickname}` 이거나, 그 사용자를 지웠으면 `null` 이다.
 *
 * ## 관대하게 읽는다
 *
 * `macroApi.ts` 와 같은 규칙이다. 이름이 없는 항목만 버린다 — 이름이 없으면 상세를 열
 * 주소를 만들 수 없다. 나머지 칸은 화면이 감출 줄 아는 값으로 낮춘다.
 */

/** 숫자로 와도 문자열로 와도 하나의 문자열 id 로. 빈 문자열은 id 가 아니다. */
function asId(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** 순서를 지킨다. 선언 순서가 곧 호출 순서다. 문자열이 아니거나 빈 이름은 서명에 쓸 수 없어 뺀다. */
function parseParameterNames(value: unknown): string[] {
  const names: string[] = []
  for (const raw of toArray(value)) {
    if (typeof raw !== 'string') continue
    const name = raw.trim()
    if (name.length > 0) names.push(name)
  }
  return names
}

/** 1 이상의 정수만 `version` 으로 친다. 그 밖의 값은 화면에 `v` 를 그리지 않게 `null` 로. */
function parseVersion(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

/**
 * 마지막으로 등록한 사람, 또는 `null`.
 *
 * 서버의 `null` 은 사용자를 지웠다는 뜻이다. 별명이 비어 오면 보여 줄 이름이 없으므로 같은
 * `null` 로 낮춘다 — 빈 이름 뒤에 "등록" 만 남는 줄보다 등록 시각만 있는 줄이 정직하다.
 */
function parseAuthor(value: unknown): DeveloperMacroAuthor | null {
  const record = asRecord(value)
  if (record === null) return null

  const nickname = asString(record.nickname).trim()
  if (nickname.length === 0) return null
  return { id: asId(record.id) ?? '', nickname }
}

/** 목록 한 줄, 또는 아무것도. `name` 만 필수다. */
export function parseDeveloperMacroSummary(data: unknown): DeveloperMacroSummary | null {
  const record = asRecord(data)
  if (record === null) return null

  const name = asString(record.name).trim()
  if (name.length === 0) return null

  const buildLabel = asNullableString(record.buildLabel)?.trim() ?? ''
  return {
    name,
    parameters: parseParameterNames(record.parameters),
    docstring: asString(record.docstring).trim(),
    gameBuildId: asId(record.gameBuildId) ?? '',
    buildVersion: asString(record.buildVersion).trim(),
    buildLabel: buildLabel.length > 0 ? buildLabel : null,
    version: parseVersion(record.version),
    updatedAt: asString(record.updatedAt),
    updatedBy: parseAuthor(record.updatedBy),
  }
}

/** 상세 하나, 또는 아무것도. `source` 는 trim 없이 그대로 통과한다. */
export function parseDeveloperMacroDetail(data: unknown): DeveloperMacroDetail | null {
  const summary = parseDeveloperMacroSummary(data)
  if (summary === null) return null

  return { ...summary, source: asString(asRecord(data)?.source) }
}

/**
 * 목록 응답을 항목 배열로. 최상위 배열도 받아 두는 이유는 `parseMacroList` 와 같다 — 봉투를
 * 못 읽어 "developer macro 가 없습니다" 라는 틀린 사실을 말하지 않으려는 방어다.
 *
 * 같은 이름이 두 번 오면 먼저 온 것만 남긴다. 이름이 선택의 키다.
 */
export function parseDeveloperMacroList(data: unknown): DeveloperMacroSummary[] {
  const envelope = Array.isArray(data) ? data : toArray(asRecord(data)?.items)

  const macros: DeveloperMacroSummary[] = []
  const seen = new Set<string>()
  for (const raw of envelope) {
    const macro = parseDeveloperMacroSummary(raw)
    if (macro === null || seen.has(macro.name)) continue
    seen.add(macro.name)
    macros.push(macro)
  }
  return macros
}

function developerMacrosPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/developer-macros`
}

/** `GET …/developer-macros` — 프로젝트의 developer macro 전부. `source` 는 실려 오지 않는다. */
export async function listDeveloperMacros(
  projectId: string,
  signal?: AbortSignal,
): Promise<DeveloperMacroSummary[]> {
  const response = await apiFetch(developerMacrosPath(projectId), { signal })
  return parseDeveloperMacroList(await readJson(response))
}

/** `GET …/developer-macros/:name` — developer macro 하나와 그 `source`. */
export async function getDeveloperMacro(
  projectId: string,
  name: string,
  signal?: AbortSignal,
): Promise<DeveloperMacroDetail> {
  const path = `${developerMacrosPath(projectId)}/${encodeURIComponent(name)}`
  const response = await apiFetch(path, { signal })
  const detail = parseDeveloperMacroDetail(await readJson(response))
  if (detail === null) {
    // `getBuildMacro` 와 같은 자리, 같은 코드다.
    throw new ProjectApiError(
      response.status,
      'The server returned an unreadable response.',
      'CLIENT_UNREADABLE_RESPONSE',
    )
  }
  return detail
}
