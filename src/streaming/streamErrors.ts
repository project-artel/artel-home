/** 다시 연결해도 해결되지 않는 버전 불일치는 필요한 조치를 표시한다. */
export function streamErrorNotice(code: string | null): { label: string; detail: string } | null {
  if (code === 'SDK_UPDATE_REQUIRED') {
    return { label: 'SDK 업데이트 필요', detail: '게임의 ARTEL SDK를 업데이트한 뒤 다시 실행해 주세요.' }
  }
  if (code === 'SERVER_TRANSPORT_MISMATCH') {
    return { label: '서버 업데이트 필요', detail: '서버가 이 화면의 영상 전송 방식을 지원하지 않습니다. 서버를 업데이트해 주세요.' }
  }
  return null
}
