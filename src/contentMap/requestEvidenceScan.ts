import { ProjectApiError } from '../projects/projectApi'

/**
 * 붙어 있는 게임 인스턴스에 근거 스캔을 시킨다.
 *
 * 새 흐름에서 사람은 파일을 고르지 않는다. 이 버튼이 실행 중인 게임에게
 * "지금 콘텐츠를 훑어서 근거 문서를 올려라"라고 시키고, SDK 가 스스로
 * 업로드하고, 서버가 그것을 적재한다. 이 콘솔이 쓰는 경로는 이 호출
 * 하나뿐이다.
 *
 * TODO(ARTEL-492): 트리거 엔드포인트 계약이 아직 없다. 서버 쪽이 정해지면
 * 아래 `notImplemented()` 를 실제 `apiFetch` 호출로 바꾸면 된다 — 화면은
 * 이 함수의 시그니처와 던지는 오류만 보고 있으므로, 계약이 붙어도
 * 컴포넌트는 건드릴 필요가 없다.
 *
 * 모듈이 따로 있는 이유가 그것이다. 아직 없는 계약을 조회 코드 안에 섞어
 * 두면, 나중에 무엇을 바꿔야 하는지가 파일 전체에 흩어진다.
 */
export async function requestEvidenceScan(options: {
  projectId: string
  gameBuildId: string
  gameInstanceId: string
}): Promise<void> {
  // 인자를 받아 두는 것은 계약이 붙었을 때 호출부를 다시 쓰지 않기 위해서다.
  void options
  return notImplemented()
}

/**
 * 아직 서버에 없는 동작임을 정직하게 알린다.
 *
 * 조용히 성공으로 돌려주면 화면은 스캔이 시작된 것처럼 보이고, 아무 일도
 * 일어나지 않은 뒤에도 사용자는 기다리기만 한다. 코드가 있으므로 패널은
 * 이 실패를 다른 서버 실패와 똑같이 문구로 바꿔 보여 줄 수 있다.
 */
function notImplemented(): Promise<never> {
  return Promise.reject(
    new ProjectApiError(
      501,
      'Evidence scanning is not available yet.',
      'CLIENT_SCAN_NOT_IMPLEMENTED',
    ),
  )
}
