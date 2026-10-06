import { apiFetch } from '../auth/authApi'
import { ProjectApiError, asNullableString, asRecord, asString, readJson } from '../projects/projectApi'
import type { MacroDetail, MacroParameter, MacroScreen, MacroSummary } from './macroTypes'

/*
 * 빌드에 등록된 macro 를 읽는 호출 둘 (ARTEL-941).
 *
 *   GET /api/projects/:projectId/game-builds/:gameBuildId/macros
 *   GET /api/projects/:projectId/game-builds/:gameBuildId/macros/:macroId
 *
 * 읽기 전용이다. macro 를 만들거나 고치거나 지우는 것은 agent 의 WebSocket frame 뿐이고,
 * 사람이 손으로 정의를 적는 길은 서버에도 없다.
 *
 * ## 계약의 출처
 *
 * 추측이 아니라 `artel-orchestration-server` (ARTEL-943, PR #286) 의
 * `contentmap/dto/MacroViewDtos.kt` 와 `contentmap/controller/ProjectMacroController.kt`
 * 를 읽고 맞춘 것이다. 그쪽이 아직 머지되지 않았으므로, 머지 전에 모양이 더 바뀌면
 * **여기와 `macroTypes.ts` 두 파일만 고치면 된다** — 화면 쪽에는 계약이 한 조각도
 * 새어 있지 않다.
 *
 * 확인한 모양:
 *
 *   - 목록은 `{ "items": [...] }` 다. 최상위 배열이 아니다 — 이 저장소의 목록 응답
 *     관례이고 `GameBuildListResponse` 를 비롯해 여섯이 같다.
 *   - 상세는 **평평한 객체**다. `items` 같은 래퍼가 없고, 목록 한 줄에 `source` 하나가
 *     더해진 모양이다.
 *   - 식별자는 `id` (`Long`) 이고 상세 경로의 마지막 칸이 그 값이다.
 *   - `parameters[].type` 은 **nullable** 이다. 저장된 tree 가 타입을 말하지 않으면
 *     `null` 이고, 그때도 이름과 순서는 남는다.
 *   - `screens[].name` 은 nullable, `screens[].sceneName` 은 **NOT NULL** 이다.
 *   - `definition` (실행용 JSON tree) 은 양쪽 어디에도 없다.
 *   - `source` 는 목록에 **key 자체가 없다.**
 *
 * ## 404 는 한 가지 뜻이다
 *
 * 빌드가 없는 것 · 경로의 `projectId` 가 그 빌드의 것과 다른 것 · 그 macro 가 이
 * 빌드에 없는 것, 셋을 서버가 일부러 가르지 않는다. 가려 주면 id 를 훑어 남의 빌드에
 * 무엇이 있는지 알아낼 수 있기 때문이다. 화면도 가르지 않는다.
 *
 * **macro 가 없는 빌드는 404 가 아니라 `{ "items": [] }` 다.** 빈 상태와 없음은 다른
 * 화면이고, 그 구분이 `MacroReport` 의 분기에 그대로 있다.
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
 * 이름이 없는 parameter 는 서명에 쓸 수 없다. `type` 이 `null` 인 것은 결손이 아니라
 * 계약이 말한 정상이고, 빈 문자열도 `null` 로 접는다 — `name: ` 뒤에 아무것도 없는
 * 타입은 타입이 아니다.
 */
function parseMacroParameter(data: unknown): MacroParameter | null {
  const record = asRecord(data)
  if (record === null) return null

  const name = asString(record.name).trim()
  if (name.length === 0) return null

  const type = asNullableString(record.type)?.trim() ?? ''
  return { name, type: type.length > 0 ? type : null }
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
 * `id` 가 없으면 가리키는 곳이 없는 관계라 버린다. `sceneName` 은 계약상 NOT NULL
 * 이지만 비어 올 때를 대비해 빈 문자열을 받아 둔다 — 그 한 칸 때문에 관계 전체를
 * 버리면, 이름도 씬도 없는 화면에 달린 macro 가 "아직 screen 미정" 이라는 **틀린**
 * 묶음으로 내려간다. 미정과 "알 수 없음" 은 다른 사실이다.
 */
function parseMacroScreen(data: unknown): MacroScreen | null {
  const record = asRecord(data)
  if (record === null) return null

  const id = asId(record.id)
  if (id === null) return null

  const name = asString(record.name).trim()
  return {
    id,
    name: name.length > 0 ? name : null,
    sceneName: asString(record.sceneName).trim(),
  }
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
 * `id` 만 필수다. 그것이 없으면 상세를 열 주소를 만들 수 없어 행이 눌리지 않는 죽은
 * 줄이 된다. 이름이 없는 macro 는 얇은 항목이지 깨진 응답이 아니다.
 *
 * `screens` 키가 아예 없는 응답은 빈 배열을 실은 응답과 똑같이 읽힌다. 그 둘을 가르면
 * 서버가 이 필드를 싣기 전의 모든 macro 가 "불러오지 못함" 으로 보인다.
 */
export function parseMacroSummary(data: unknown): MacroSummary | null {
  const record = asRecord(data)
  if (record === null) return null

  const id = asId(record.id)
  if (id === null) return null

  return {
    id,
    name: asString(record.name).trim(),
    parameters: parseMacroParameters(record.parameters),
    screens: parseMacroScreens(record.screens),
    updatedAt: asString(record.updatedAt),
  }
}

/**
 * 상세 하나, 또는 아무것도. 목록 항목과 같은 칸에 `source` 하나가 더해진 평평한
 * 객체이므로, 목록 파서를 그대로 쓰고 한 칸만 더 읽는다.
 *
 * `source` 는 **그대로 통과한다** — trim 도, 줄바꿈 정리도, 들여쓰기 손질도 없다.
 * 들여쓰기가 문법의 일부라(`if` 몸통) 앞뒤 공백을 떼는 것조차 첫 줄의 뜻을 바꿀 수
 * 있다. 서버도 같은 이유로 깎지 않는다.
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
 * 봉투는 `{ items: [...] }` 하나다. 최상위 배열도 받아 두는 이유는 호환이 아니라
 * 방어다 — 서버가 아직 머지되지 않아 모양이 한 번 더 움직일 수 있고, 봉투를 못 읽으면
 * 화면은 오류가 아니라 "macro 가 없습니다" 라는 **틀린 사실**을 조용히 말한다. 빈
 * 화면보다 나쁜 것은 틀린 빈 화면이다.
 *
 * 같은 `id` 가 두 번 오면 먼저 온 것만 남긴다. id 가 선택의 키라, 둘을 남기면 하나를
 * 골랐을 때 어느 쪽이 열릴지 알 수 없다.
 */
export function parseMacroList(data: unknown): MacroSummary[] {
  const envelope = Array.isArray(data) ? data : toArray(asRecord(data)?.items)

  const macros: MacroSummary[] = []
  const seen = new Set<string>()
  for (const raw of envelope) {
    const macro = parseMacroSummary(raw)
    if (macro === null || seen.has(macro.id)) continue
    seen.add(macro.id)
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
 * `GET …/macros/:macroId` — macro 하나와 그 `source`.
 *
 * 404 는 `readJson` 이 이미 `ProjectApiError` 로 올려 준다. 서버가 404 의 세 가지
 * 이유를 가르지 않고, 화면도 왜 실패했는지가 아니라 실패했는지만 가르므로 여기서
 * 따로 다루지 않는다.
 */
export async function getBuildMacro(
  projectId: string,
  gameBuildId: string,
  macroId: string,
  signal?: AbortSignal,
): Promise<MacroDetail> {
  const path = `${macrosPath(projectId, gameBuildId)}/${encodeURIComponent(macroId)}`
  const response = await apiFetch(path, { signal })
  const detail = parseMacroDetail(await readJson(response))
  if (detail === null) {
    // `readJson` 이 못 읽은 본문에 쓰는 문구 그대로다. `id` 가 없는 200 은 호출하는
    // 쪽에서 보면 같은 실패이고, `knowledgeApi.ts` 의 `getKnowledgeItem` 도 같은
    // 자리에서 같은 코드를 던진다.
    throw new ProjectApiError(
      response.status,
      'The server returned an unreadable response.',
      'CLIENT_UNREADABLE_RESPONSE',
    )
  }
  return detail
}
