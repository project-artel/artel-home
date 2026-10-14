import type { UsageTotals } from './llmUsageTypes'

/** 값이 없다는 표시. QA 화면과 같은 글자를 쓴다. */
export const EMPTY_MARK = '—'

/**
 * 이 묶음이 쓴 토큰.
 *
 * 캐시 입력과 reasoning을 **더하지 않는다.** provider가 주는 숫자에서 둘은 이미 입력·출력의
 * 부분집합이다 — `cached_input_tokens`는 입력 중 캐시에서 읽은 몫이고, `reasoning_tokens`는
 * 출력 중 모델이 생각하는 데 쓴 몫이다. 더하면 같은 토큰을 두 번 세어 총량이 부풀고, 그 값이
 * 청구서와 안 맞는데 왜 안 맞는지 화면에서 알 수 없다.
 */
export function totalTokens(totals: UsageTotals): number {
  return totals.inputTokens + totals.outputTokens
}

/**
 * 전체 대비 비중.
 *
 * 분모가 0이면 null이다 — 0%로 쓰면 "안 썼다"와 "쓴 것이 하나도 없어 비중을 낼 수 없다"가 같은
 * 글자가 된다.
 */
export function share(value: number, total: number): number | null {
  return total === 0 ? null : value / total
}

/**
 * 금액이 실제 지출의 하한인지.
 *
 * 단가를 모르는 호출이 섞여 있으면 합계는 아는 것만 더한 값이다. 화면은 이 경우 금액 옆에 그
 * 사실을 붙여야 한다 — 안 붙이면 절반이 미상인 합계가 전체 지출로 읽힌다.
 */
export function isPartiallyPriced(totals: UsageTotals): boolean {
  return totals.pricedCalls < totals.calls
}

/**
 * 축 줄을 지출 큰 순으로 세운다.
 *
 * 금액이 아니라 토큰으로 세우는 이유는 단가 미상 줄이 섞이기 때문이다 — 금액으로 세우면 단가를
 * 모르는 줄이 전부 바닥으로 내려가고, 실제로 가장 많이 쓴 축이 표 아래에 숨는다.
 */
export function byTokensDesc<T>(rows: T[], totalsOf: (row: T) => UsageTotals): T[] {
  return [...rows].sort((left, right) => totalTokens(totalsOf(right)) - totalTokens(totalsOf(left)))
}

/** 여러 줄을 하나로 합친다. 표의 합계 행이 쓴다. */
export function sumTotals(rows: UsageTotals[]): UsageTotals {
  return rows.reduce<UsageTotals>(
    (accumulated, row) => ({
      inputTokens: accumulated.inputTokens + row.inputTokens,
      outputTokens: accumulated.outputTokens + row.outputTokens,
      cachedInputTokens: accumulated.cachedInputTokens + row.cachedInputTokens,
      reasoningTokens: accumulated.reasoningTokens + row.reasoningTokens,
      // null + 값 = 값이다. "모른다"가 합계를 통째로 null로 만들면, 한 줄만 단가 미상이어도
      // 나머지 줄의 아는 지출까지 화면에서 사라진다.
      costUsd:
        row.costUsd === null
          ? accumulated.costUsd
          : (accumulated.costUsd ?? 0) + row.costUsd,
      calls: accumulated.calls + row.calls,
      pricedCalls: accumulated.pricedCalls + row.pricedCalls,
    }),
    {
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      costUsd: null,
      calls: 0,
      pricedCalls: 0,
    },
  )
}

/**
 * 일별 줄을 하루도 빠뜨리지 않고 채운 배열.
 *
 * 서버는 호출이 없던 날에 줄을 안 준다. 그대로 그리면 지출이 없던 주가 폭이 좁아져 사라지고,
 * 막대 사이 간격이 시간 간격과 어긋나 추이가 실제보다 고르게 보인다.
 *
 * @param days 이미 `zone` 기준으로 잘린 `YYYY-MM-DD` 줄들. 순서는 상관없다.
 * @param from,to 창의 경계. `to`는 배타다.
 */
export function fillDays(
  days: { date: string; totals: UsageTotals }[],
  from: Date,
  to: Date,
): { date: string; totals: UsageTotals | null }[] {
  const known = new Map(days.map((day) => [day.date, day.totals]))
  const filled: { date: string; totals: UsageTotals | null }[] = []

  // 로컬 달력으로 하루씩 민다. UTC로 밀면 서머타임이 없는 한국에서도 서버 `zone`이 다를 때
  // 하루가 어긋난다.
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate())

  // 상한을 둔다. 서버가 창을 366일로 자르므로 여기 닿을 일은 없지만, 경계 계산이 틀렸을 때
  // 브라우저가 멈추는 대신 표가 짧게 나오는 편이 낫다.
  for (let guard = 0; cursor < end && guard < 400; guard += 1) {
    const date = toDateKey(cursor)
    filled.push({ date, totals: known.get(date) ?? null })
    cursor.setDate(cursor.getDate() + 1)
  }

  return filled
}

/** 서버가 주는 `YYYY-MM-DD`와 같은 모양. 로컬 달력 기준이라 UTC로 자르면 하루가 밀린다. */
export function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}
