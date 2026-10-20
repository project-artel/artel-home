/** 저작 턴 실패를 대화에 보일 문구(ARTEL-1072). */
export type ChatErrorMessages = {
  llm: string
  catalog: string
  busy: string
  generic: string
}

/**
 * 오류 `code` 로 안내 문구를 고른다. Agent 가 보낸 `detail` 은 모델 호출 예외의 원문
 * (`Error code: 401 - {...}`) 일 수 있어 화면에 내지 않는다. 원문은 서버 로그에 남는다.
 *
 * `turn_timeout` 만 예외다. 그 `detail` 은 오케스트레이션이 사람에게 쓴 안내이고, 같은 문장이
 * 대화 기록에도 저장된다.
 */
export function chatErrorText(code: string, detail: string, messages: ChatErrorMessages): string {
  switch (code) {
    case 'turn_timeout':
      return detail.length > 0 ? detail : messages.generic
    case 'llm_error':
      return messages.llm
    case 'model_catalog_unavailable':
      return messages.catalog
    case 'busy':
      return messages.busy
    default:
      return messages.generic
  }
}
