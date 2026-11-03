/** 이전 서버의 SDK 오류는 응답 시간 초과일 수도 있으므로 재연결을 제공한다. */
export function streamErrorNotice(code: string | null): { label: string; detail: string; retryLabel: string | null } | null {
  if (code === 'SDK_UPDATE_REQUIRED') {
    return { label: '연결 끊김', detail: '게임 화면 연결이 끊겼습니다.', retryLabel: '재연결 시도' }
  }
  if (code === 'SERVER_TRANSPORT_MISMATCH') {
    return { label: '서버 업데이트 필요', detail: '서버가 이 화면의 영상 전송 방식을 지원하지 않습니다. 서버를 업데이트해 주세요.', retryLabel: null }
  }
  return null
}
