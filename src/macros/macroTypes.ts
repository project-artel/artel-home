import type { Messages } from '../i18n/messages'

/*
 * 빌드에 등록된 macro 의 view model (ARTEL-941).
 *
 * macro 는 agent 가 성공한 조작을 저장해 둔 script 다. 사람은 이것을 읽기만 한다 —
 * 고치는 길은 agent 의 `edit_macro` 와 `register_macro` 뿐이라, 여기에는 어떤 쓰기
 * 모양도 없다.
 *
 * 계약은 이 파일과 `macroApi.ts` 두 곳에만 산다. 서버(ARTEL-943)가 아직 머지되지
 * 않아 어긋날 수 있고, 어긋났을 때 고칠 자리가 한 군데여야 한다.
 */

/**
 * `parameter` 하나. `type` 은 선언된 타입이고 **열린 문자열이다** — 이 build 가 모르는
 * 타입 이름이 와도 그대로 보여 준다. 아는 목록으로 좁히면 macro language 가 타입을
 * 하나 늘리는 날 이 화면이 먼저 거짓말을 한다.
 */
export type MacroParameter = {
  name: string
  type: string
}

/**
 * 이 macro 가 달린 `screen` 하나.
 *
 * `name` 이 `null` 인 것은 결손이 아니라 보통이다. `screen` 이름은 LLM 이 짓는 표시용
 * 값이고 아직 아무도 안 지은 화면이 흔하다 — `contentMapTypes.ts` 의 `ContentMapScreen`
 * 과 같은 규칙이다.
 */
export type MacroScreen = {
  id: string
  name: string | null
}

/**
 * 목록 항목. **`source` 가 없다.**
 *
 * 목록과 상세를 나눈 것이 설계다. source 는 길고, 빌드에 쌓인 macro 를 전부 싣고
 * 시작하면 목록이 source 무게만큼 느려진다. `src/knowledge/*` 가 같은 모양이고
 * (ARTEL-753/754), 거기서도 목록이 `description` 을 일부러 뺀다.
 */
export type MacroSummary = {
  /**
   * 이 빌드 안에서 macro 를 가리키는 번호. 상세 경로의 마지막 조각이기도 하다.
   *
   * 서버가 숫자로 보내든 문자열로 보내든 여기서는 문자열 하나다. 숫자를 그대로 들고
   * 다니면 `1` 과 `"1"` 이 서로 다른 Map 키가 되어, 주소에서 읽은 선택이 목록의 항목을
   * 못 찾는다.
   */
  number: string
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
  updatedAt: string
}

/** 목록 항목에 원문이 더해진 것. 상세 endpoint 만 `source` 를 싣는다. */
export type MacroDetail = MacroSummary & {
  /**
   * agent 가 쓴 글자 그대로. 줄바꿈도 들여쓰기도 손대지 않는다 — 들여쓰기가 macro
   * language 문법의 일부라(`if` 몸통) 다듬는 순간 읽을 수 없는 글이 된다.
   */
  source: string
}

/**
 * `(slot: int, name: string)`.
 *
 * 목록과 상세가 둘 다 쓴다. parameter 가 없으면 `()` 다 — 빈 문자열로 두면 이름 뒤에
 * 아무것도 없어서 "서명을 아직 못 읽었다" 로 보인다.
 */
export function macroSignature(parameters: MacroParameter[]): string {
  return `(${parameters.map((parameter) => `${parameter.name}: ${parameter.type}`).join(', ')})`
}

/**
 * `screen` 하나를 사람이 읽는 이름으로.
 *
 * `contentMap/screenLabels.ts` 의 `screenLabel` 과 같은 규칙이다. 이름이 없으면 id 를
 * 붙여 부른다 — 이름 없는 화면이 둘 이상 달린 macro 에서 "이름 없는 screen" 이 두 번
 * 나오면 그 둘이 같은 화면인지 다른 화면인지 아무 말도 하지 않는다.
 */
export function macroScreenLabel(t: Messages, screen: MacroScreen): string {
  const name = screen.name?.trim() ?? ''
  return name.length > 0 ? name : t.macros.list.unnamedScreen(screen.id)
}

/**
 * 목록의 정렬. 이름 오름차순, 같으면 번호 오름차순.
 *
 * 서버 순서를 믿지 않는다. 명세가 순서를 말하지 않았고, 사람이 이름으로 찾는 목록이
 * 읽을 때마다 다른 순서로 서면 "그 macro 가 사라졌나" 를 매번 의심하게 된다.
 * 번호는 동점을 가르는 자리에서만 쓰므로 숫자로 비교한다 — 문자열로 두면 10 이 2 보다
 * 앞에 선다.
 */
export function compareMacros(left: MacroSummary, right: MacroSummary): number {
  const byName = left.name.localeCompare(right.name)
  if (byName !== 0) return byName
  return Number(left.number) - Number(right.number)
}
