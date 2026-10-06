/*
 * 빌드에 등록된 macro 의 view model (ARTEL-941).
 *
 * macro 는 agent 가 성공한 조작을 저장해 둔 script 다. 사람은 이것을 읽기만 한다 —
 * 쓰는 길은 agent 의 WebSocket frame 뿐이고, 사람이 손으로 정의를 적는 경로는 서버에도
 * 없다. 그래서 여기에는 어떤 쓰기 모양도 없다.
 *
 * 계약은 이 파일과 `macroApi.ts` 두 곳에만 산다. 모양은
 * `artel-orchestration-server` 의 `contentmap/dto/MacroViewDtos.kt` (ARTEL-943) 에서
 * 확인한 것이다.
 */

/**
 * `parameter` 하나.
 *
 * **`type` 이 `null` 인 것이 정상이다.** 이름과 순서는 `macro.parameter_names` 에서
 * 오지만 선언 타입은 `definition_json` 의 진입점 `def` 에만 있어서, 저장된 tree 가
 * 그것을 말하지 않으면 `null` 로 떨어진다. 그래도 이름과 순서는 남는다 — 조회가 통째로
 * 깨지는 것보다 낫다는 서버 쪽 판단이고, 화면도 같은 판단을 따라 타입 없이 이름만
 * 그린다.
 */
export type MacroParameter = {
  name: string
  type: string | null
}

/**
 * 이 macro 가 이어진 `screen` 하나.
 *
 * `name` 은 LLM 이 짓는 표시용 값이라 `null` 일 수 있다. `sceneName` 은 NOT NULL 이고,
 * 이름이 없을 때 사람이 그 화면을 알아볼 유일한 값이다. 그래서 화면은 늘 `sceneName`
 * 을 먼저 보여 준다.
 */
export type MacroScreen = {
  id: string
  name: string | null
  sceneName: string
}

/**
 * 목록 항목. **`source` 가 없다 — key 자체가 오지 않는다.**
 *
 * 목록과 상세를 나눈 것이 설계다. source 는 한 건이 최대 20,000자라 목록에 실으면
 * 빌드 하나가 수백 KB 가 된다.
 */
export type MacroSummary = {
  /**
   * `macro.id`. 상세 조회 경로의 마지막 칸이 이 값이다.
   *
   * 서버는 `Long` 으로 보낸다. 숫자를 그대로 들고 다니면 주소에서 읽은 `"7"` 이
   * 목록의 `7` 을 못 찾으므로 문자열 하나로 맞춘다.
   */
  id: string
  /** 진입점 `def` 의 이름. 같은 빌드 안에서 유일하다. */
  name: string
  /** 선언 순서 그대로. 서명을 다시 쓰는 화면이라 순서가 뜻을 가진다. */
  parameters: MacroParameter[]
  /**
   * 이어진 `screen` 들.
   *
   * **빈 배열은 "아직 어디서 쓸지 모른다" 는 뜻이지 "아무 데서나 된다" 가 아니다.**
   * 이 둘을 섞으면 사용자는 미정인 macro 를 어디서나 불러도 되는 것으로 읽는다.
   * 화면이 두 묶음을 갈라 그리는 이유가 이것이고, 그 뜻은 `MacroList` 가 글로도 적는다.
   */
  screens: MacroScreen[]
  /**
   * 정의를 마지막으로 고친 시각. 같은 이름을 다시 등록하면 제자리에서 갱신되므로 이
   * 값만 움직이고 `id` 는 그대로다.
   */
  updatedAt: string
}

/** 목록 항목에 원문이 더해진 **평평한** 객체. 상세 응답에는 래퍼가 없다. */
export type MacroDetail = MacroSummary & {
  /**
   * 저장된 원문 그대로. 서버가 공백을 깎지 않고, 여기서도 깎지 않는다 — 들여쓰기가
   * 문법의 일부라(`if` 몸통) 다듬는 순간 다른 뜻의 글이 된다.
   */
  source: string
}

/**
 * `(card_a: string, repeat)`.
 *
 * 타입을 모르는 parameter 는 이름만 쓴다. `: null` 이나 `: unknown` 을 적으면 서버가
 * 말하지 않은 것을 화면이 지어내는 것이 된다.
 *
 * parameter 가 없으면 `()` 다 — 빈 문자열로 두면 이름 뒤에 아무것도 없어서 "서명을
 * 아직 못 읽었다" 로 보인다.
 */
export function macroSignature(parameters: MacroParameter[]): string {
  const rendered = parameters.map((parameter) =>
    parameter.type === null ? parameter.name : `${parameter.name}: ${parameter.type}`,
  )
  return `(${rendered.join(', ')})`
}

/**
 * `screen` 하나를 사람이 읽는 이름으로. `TurnBattleScene · 손패`.
 *
 * 씬 이름을 늘 앞에 둔다. 화면 이름은 `null` 일 수 있고, 그때 남는 유일한 단서가
 * 씬이다. 이름도 없으면 id 를 붙인다 — 같은 씬의 이름 없는 화면이 둘 달린 macro 에서
 * 씬 이름만 두 번 서면 그 둘이 같은 화면인지 다른 화면인지 아무 말도 하지 않는다.
 *
 * 번역하지 않는다. 양쪽 조각 다 서버가 준 고유명사이고, 그 사이의 가운뎃점은 어느
 * 언어에서도 같다.
 */
export function macroScreenLabel(screen: MacroScreen): string {
  const name = screen.name?.trim() ?? ''
  return name.length > 0 ? `${screen.sceneName} · ${name}` : `${screen.sceneName} · #${screen.id}`
}

/**
 * 목록의 정렬. 이름 오름차순, 같으면 id 오름차순.
 *
 * 서버도 이름 오름차순으로 주지만 화면이 목록을 두 묶음으로 가르면서 다시 늘어놓으므로,
 * 각 묶음 안의 순서를 여기서 정한다. id 는 숫자다 — 문자열로 비교하면 10 이 2 보다
 * 앞에 선다. 숫자로 읽히지 않는 값이 오면 0 으로 보고 이름 순서를 그대로 둔다
 * (`NaN` 을 돌려주면 정렬 결과가 구현에 따라 달라진다).
 */
export function compareMacros(left: MacroSummary, right: MacroSummary): number {
  const byName = left.name.localeCompare(right.name)
  if (byName !== 0) return byName

  const leftId = Number(left.id)
  const rightId = Number(right.id)
  if (!Number.isFinite(leftId) || !Number.isFinite(rightId)) return 0
  return leftId - rightId
}
