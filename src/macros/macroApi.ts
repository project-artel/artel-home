import { apiFetch } from '../auth/authApi'
import { ProjectApiError, asRecord, asString, readJson } from '../projects/projectApi'
import type { MacroDetail, MacroParameter, MacroScreen, MacroSummary } from './macroTypes'

/*
 * 빌드에 등록된 macro 를 읽는 호출 둘 (ARTEL-941).
 *
 *   GET /api/projects/:projectId/game-builds/:gameBuildId/macros
 *   GET /api/projects/:projectId/game-builds/:gameBuildId/macros/:number
 *
 * 읽기 전용이다. macro 는 agent 가 `register_macro` 와 `edit_macro` 로 쓰고, 이
 * 콘솔에서 쓰는 경로는 없다.
 *
 * 목록에는 `source` 가 없다. 상세를 열어야 온다. 그 둘을 나눈 것이 설계이므로 목록에서
 * source 를 기대하지 않는다.
 *
 * ## 서버가 아직 없다
 *
 * 이 endpoint 둘은 ARTEL-943 이 지금 만들고 있고 아직 머지되지 않았다. 아래 추측이
 * 실제 응답과 어긋날 수 있다. **어긋나면 여기를 고친다 — 화면 쪽에는 계약이 한 조각도
 * 새어 있지 않다.**
 *
 * 추측으로 메운 자리:
 *
 *   1. 목록 응답의 봉투. 배열 자체인지 `{ macros: [...] }` 인지 명세에 없다. 둘 다
 *      받는다 — 어느 쪽이 와도 화면이 선다.
 *   2. `number` 의 JSON 타입. 숫자인지 문자열인지 명세에 없다. 둘 다 받아 문자열
 *      하나로 정규화한다.
 *   3. `screens[]` 항목의 모양. `{ id, name }` 으로 보고 읽는다. `id` 도 숫자/문자열
 *      양쪽을 받는다. 이 추측이 틀리면 `screen` 뱃지가 비거나 id 만 남는다.
 *   4. `parameters[].type` 이 열린 문자열이라는 것. 좁히지 않고 그대로 보여 준다.
 *   5. macro 가 없는 빌드가 404 가 아니라 200 + 빈 배열이라는 것. 404 라면 빈 상태
 *      대신 오류 상태가 뜬다.
 *
 * ## 관대하게 읽는다
 *
 * `knowledgeApi.ts` 와 같은 규칙이다. 이 화면이 존재하는 이유가 "빌드에 어떤 macro 가
 * 있는지 아무 데서도 볼 수 없다" 는 것인데, 필드 하나가 비었다고 응답 전체를 버리면
 * 사용자는 정확히 그 상태로 되돌아간다. 그래서 항목을 식별하지 못할 때만 그 항목을
 * 버리고, 나머지는 전부 화면이 감출 줄 아는 값으로 낮춘다.
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

/**
 * `parameter` 하나, 또는 아무것도.
 *
 * 이름이 없는 parameter 는 서명에 쓸 수 없다. `type` 이 비는 것은 다르다 — 서버가 아직
 * 안 싣거나 추론하지 못한 경우이고, 이름만으로도 서명은 읽히므로 살린다.
 */
function parseMacroParameter(data: unknown): MacroParameter | null {
  const record = asRecord(data)
  if (record === null) return null

  const name = asString(record.name).trim()
  if (name.length === 0) return null

  return { name, type: asString(record.type).trim() }
}

/** 순서를 지킨다. 선언 순서가 곧 호출 순서라 정렬하거나 섞으면 안 된다. */
function parseMacroParameters(value: unknown): MacroParameter[] {
  const parameters: MacroParameter[] = []
  for (const raw of toArray(value)) {
    const parameter = parseMacroParameter(raw)
    if (parameter !== null) parameters.push(parameter)
  }
  return parameters
}

/**
 * 이어진 `screen` 하나, 또는 아무것도.
 *
 * `id` 가 없으면 가리키는 곳이 없는 관계라 버린다. `name` 은 `null` 이 보통이다.
 */
function parseMacroScreen(data: unknown): MacroScreen | null {
  const record = asRecord(data)
  if (record === null) return null

  const id = asId(record.id)
  if (id === null) return null

  const name = asString(record.name).trim()
  return { id, name: name.length > 0 ? name : null }
}

/**
 * 이어진 `screen` 들. 같은 id 가 두 번 오면 하나로 합친다.
 *
 * 중복을 남기면 뱃지가 둘 보이고, 사람은 서버가 하나라고 말한 관계를 둘로 읽는다.
 */
function parseMacroScreens(value: unknown): MacroScreen[] {
  const screens: MacroScreen[] = []
  const seen = new Set<string>()
  for (const raw of toArray(value)) {
    const screen = parseMacroScreen(raw)
    if (screen === null || seen.has(screen.id)) continue
    seen.add(screen.id)
    screens.push(screen)
  }
  return screens
}

/**
 * 목록 항목 하나, 또는 아무것도.
 *
 * `number` 만 필수다. 그것이 없으면 상세를 열 주소를 만들 수 없어 행이 눌리지 않는
 * 죽은 줄이 된다. 이름이 없는 macro 는 얇은 항목이지 깨진 응답이 아니다.
 *
 * `screens` 키가 아예 없는 응답은 빈 배열을 실은 응답과 똑같이 읽힌다. 그 둘을 가르면
 * 서버가 이 필드를 싣기 전의 모든 macro 가 "불러오지 못함" 으로 보인다.
 */
export function parseMacroSummary(data: unknown): MacroSummary | null {
  const record = asRecord(data)
  if (record === null) return null

  const number = asId(record.number)
  if (number === null) return null

  return {
    number,
    name: asString(record.name).trim(),
    parameters: parseMacroParameters(record.parameters),
    screens: parseMacroScreens(record.screens),
    updatedAt: asString(record.updatedAt),
  }
}

/**
 * 상세 하나, 또는 아무것도.
 *
 * `source` 는 **그대로 통과한다** — trim 도, 줄바꿈 정리도, 들여쓰기 손질도 없다.
 * 들여쓰기가 macro language 문법의 일부라(`if` 몸통) 앞뒤 공백을 떼는 것조차 첫 줄의
 * 뜻을 바꿀 수 있다. `knowledgeApi.ts` 의 `description` 이 같은 이유로 손대지 않는다.
 */
export function parseMacroDetail(data: unknown): MacroDetail | null {
  const summary = parseMacroSummary(data)
  if (summary === null) return null

  const record = asRecord(data)
  return { ...summary, source: asString(record?.source) }
}

/**
 * 목록 응답을 항목 배열로.
 *
 * 봉투 두 가지를 다 받는다. 배열 자체로 오는 쪽과 `{ macros: [...] }` 로 오는 쪽 중
 * 어느 것인지 명세에 없고, 틀린 쪽을 골라 두면 서버가 머지되는 날 화면이 "macro 가
 * 없습니다" 라는 틀린 사실을 조용히 말한다. 빈 화면보다 나쁜 것은 틀린 빈 화면이다.
 *
 * 같은 `number` 가 두 번 오면 먼저 온 것만 남긴다. 번호가 선택의 키라, 둘을 남기면
 * 하나를 골랐을 때 어느 쪽이 열릴지 알 수 없다.
 */
export function parseMacroList(data: unknown): MacroSummary[] {
  const envelope = Array.isArray(data) ? data : toArray(asRecord(data)?.macros)

  const macros: MacroSummary[] = []
  const seen = new Set<string>()
  for (const raw of envelope) {
    const macro = parseMacroSummary(raw)
    if (macro === null || seen.has(macro.number)) continue
    seen.add(macro.number)
    macros.push(macro)
  }
  return macros
}

function macrosPath(projectId: string, gameBuildId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/game-builds/${encodeURIComponent(gameBuildId)}/macros`
}

/** `GET …/macros` — 이 빌드에 등록된 macro 전부. `source` 는 실려 오지 않는다. */
export async function listBuildMacros(
  projectId: string,
  gameBuildId: string,
  signal?: AbortSignal,
): Promise<MacroSummary[]> {
  const response = await apiFetch(macrosPath(projectId, gameBuildId), { signal })
  return parseMacroList(await readJson(response))
}

/**
 * `GET …/macros/:number` — macro 하나와 그 `source`.
 *
 * 404 는 `readJson` 이 이미 `ProjectApiError` 로 올려 준다. 화면은 왜 실패했는지가
 * 아니라 실패했는지만 가르므로 여기서 따로 다루지 않는다.
 */
export async function getBuildMacro(
  projectId: string,
  gameBuildId: string,
  number: string,
  signal?: AbortSignal,
): Promise<MacroDetail> {
  const path = `${macrosPath(projectId, gameBuildId)}/${encodeURIComponent(number)}`
  const response = await apiFetch(path, { signal })
  const detail = parseMacroDetail(await readJson(response))
  if (detail === null) {
    // `readJson` 이 못 읽은 본문에 쓰는 문구 그대로다. `number` 가 없는 200 은
    // 호출하는 쪽에서 보면 같은 실패다.
    throw new ProjectApiError(
      response.status,
      'The server returned an unreadable response.',
      'CLIENT_UNREADABLE_RESPONSE',
    )
  }
  return detail
}
