/*
 * `discriminator` 원문을 사람이 읽는 줄로 옮기는 일.
 *
 * 이 값은 이 화면이 이 화면임을 판정하는 pulse 관측 조건이고, 실제로 오는 모양은
 * `[{"selector":"Canvas[2]/continue[2]","active":true}]` 이다. 이름이 없는 화면이 보통이므로
 * **두 화면이 왜 둘인지를 말하는 것은 거의 언제나 이 값 하나뿐이다.** 그것을 JSON 덩어리 한 줄로
 * 두면 사람은 대괄호와 따옴표를 눈으로 걷어내며 읽어야 한다.
 *
 * ## 그런데 모양을 못 박을 수 없다
 *
 * 서버는 이 값을 **읽지 않고 그대로 옮긴다**. 관측 쪽이 조건 어휘를 늘리는 날 새 키가 섞여 들어오고,
 * 그때 아는 두 키만 그리면 화면은 서버가 말한 조건의 일부만 보여 주면서 전부인 척한다. 그 줄을 읽은
 * QA 는 실제로는 세 조건이 걸린 화면을 두 조건짜리로 이해한다.
 *
 * 그래서 갈래를 둘로만 둔다. **아는 모양이면 목록으로, 하나라도 어긋나면 원문 그대로.** 중간이
 * 없다 — 반쯤 읽은 것을 다 읽은 것처럼 그리지 않는다.
 */

/** 절 하나. selector 가 가리키는 것이 켜져 있어야 하나 꺼져 있어야 하나. */
export type DiscriminatorClause = {
  selector: string
  active: boolean
}

/**
 * 화면을 판정하는 조건, 화면이 그릴 수 있는 모양으로.
 *
 * `none` 은 `raw` 와 다르다. 앞은 서버가 아무 조건도 싣지 않은 것이고 뒤는 실었는데 이 빌드가
 * 읽을 줄 모르는 것이다. 둘을 합치면 "조건이 없는 화면"과 "조건을 못 읽은 화면"이 한 모양이 된다.
 */
export type ScreenDiscriminator =
  | { form: 'clauses'; clauses: DiscriminatorClause[] }
  | { form: 'raw'; text: string }
  | { form: 'none' }

/** 이 빌드가 아는 절의 키. 이 둘만 있는 객체여야 절로 읽는다. */
const CLAUSE_KEYS = ['selector', 'active']

function asClause(value: unknown): DiscriminatorClause | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  // 아는 키가 다 있고 **모르는 키가 하나도 없을** 때만 절이다. 남는 키를 조용히 버리면 화면이
  // 서버가 말한 조건에 대해 거짓말을 한다.
  if (keys.length !== CLAUSE_KEYS.length) return null
  if (!CLAUSE_KEYS.every((key) => keys.includes(key))) return null

  const { selector, active } = record
  if (typeof selector !== 'string' || selector.length === 0) return null
  if (typeof active !== 'boolean') return null

  return { selector, active }
}

/**
 * 원문 한 줄을 절 목록으로 읽는다.
 *
 * 빈 배열은 `none` 이다. 빈 목록을 절 0 개로 그리면 "이 화면은 아무 조건 없이 판정된다"가 되는데,
 * 그런 화면은 없다 — 조건이 없으면 화면이 갈리지 않는다.
 */
export function readDiscriminator(text: string): ScreenDiscriminator {
  const trimmed = text.trim()
  if (trimmed.length === 0) return { form: 'none' }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return { form: 'raw', text: trimmed }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) return { form: 'raw', text: trimmed }

  const clauses: DiscriminatorClause[] = []
  for (const raw of parsed) {
    const clause = asClause(raw)
    if (clause === null) return { form: 'raw', text: trimmed }
    clauses.push(clause)
  }

  return { form: 'clauses', clauses }
}

/**
 * selector 의 마지막 마디.
 *
 * 한 씬의 화면들은 selector 앞부분이 대체로 같다. 목록에서 두 화면을 가르는 것은 끝마디이므로,
 * 좁은 줄에서는 그쪽을 남긴다. 전체 경로는 인스펙터가 그대로 함께 보인다.
 */
export function selectorTail(selector: string): string {
  const cut = selector.lastIndexOf('/')
  return cut === -1 || cut === selector.length - 1 ? selector : selector.slice(cut + 1)
}
