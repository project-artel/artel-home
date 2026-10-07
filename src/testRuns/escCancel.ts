/*
 * ESC 두 번으로 저작 요청을 끊는 규칙(ARTEL-956).
 *
 * 한 번으로 하지 않은 이유가 둘이다. 저작은 한 턴이 수십 초라 그 사이 ESC 가 다른 뜻으로
 * 눌린다(모달을 닫으려고, 입력을 지우려고). 그리고 되돌릴 수 없다 — 끊긴 턴은 이어서 하는
 * 길이 없고 처음부터 다시 보내야 한다. **한 번 눌러 무슨 일이 생기는지 읽고, 한 번 더 눌러
 * 정한다.**
 *
 * 창을 1초로 둔 것은 사용자가 정한 값이다. 길게 두면 한참 전에 누른 ESC 가 지금의 한 번과
 * 짝이 되고, 그건 한 번에 끊기는 것과 다르지 않다.
 *
 * 상태를 컴포넌트 밖에 두는 이유는 이 판단이 **시각 계산 하나**라서다. 화면 없이 검사할 수
 * 있어야 "1.2초 뒤의 두 번째 ESC" 같은 경계를 손으로 눌러 보지 않아도 된다.
 */

/** 두 번 사이의 틈. 넘으면 처음부터다. */
export const ESC_WINDOW_MS = 1000

/** 이 ESC 로 무엇이 일어나는가. */
export type EscVerdict =
  /** 아무 일도 없다 — 끊을 요청이 없었다. */
  | 'ignored'
  /** 물어본 상태가 됐다. 화면이 "한 번 더" 를 띄운다. */
  | 'armed'
  /** 끊는다. */
  | 'cancel'

export type EscPress = {
  verdict: EscVerdict
  /** 다음 판단의 기준 시각. `null` 이면 물어본 상태가 아니다. */
  armedAt: number | null
}

/**
 * ESC 한 번을 받는다.
 *
 * @param armedAt 앞서 눌린 때. `null` 이면 이번이 첫 번째다.
 * @param now 지금.
 * @param inFlight 끊을 요청이 도는 중인가. 아니면 ESC 는 아무 뜻이 없다 — 한가한 화면에서
 *   ESC 를 눌러 "한 번 더 누르면 종료" 가 뜨면 무엇이 종료되는지 알 수 없다.
 */
export function pressEscape(armedAt: number | null, now: number, inFlight: boolean): EscPress {
  if (!inFlight) return { verdict: 'ignored', armedAt: null }
  // 시계가 뒤로 갔거나 창을 넘겼다. 둘 다 **처음부터** 다 — 모르면 묻는 쪽이 안전하다.
  const within = armedAt !== null && now >= armedAt && now - armedAt <= ESC_WINDOW_MS
  if (within) return { verdict: 'cancel', armedAt: null }
  return { verdict: 'armed', armedAt: now }
}
