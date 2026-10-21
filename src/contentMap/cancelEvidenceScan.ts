import { apiFetch } from '../auth/authApi'
import { contentMapPath } from './contentMapApi'

/**
 * 도는 근거 스캔을 끊는다(ARTEL-1184).
 *
 * 게임이 쥔 단계에서만 끊을 수 있다. 서버가 올라온 문서를 읽는 중이면 바깥에서 끊을 손잡이가
 * 없어 409 `scan_not_cancellable` 로 답하고, 돌고 있는 스캔이 아예 없어도 409
 * `scan_not_running` 이다. 둘 다 화면이 낡았다는 신호라 조용히 넘기지 않는다.
 *
 * **결과는 이 호출이 돌려주지 않는다.** 서버가 상태를 닫고 SSE `scan` 으로 흘리므로, 화면은
 * 그 프레임을 받아 그린다. 이 빌드를 보고 있는 다른 사람의 화면도 같은 방식으로 함께 바뀐다.
 */
export async function cancelEvidenceScan(options: {
  projectId: string
  gameBuildId: string
}): Promise<void> {
  await apiFetch(contentMapPath(options.projectId, options.gameBuildId, '/scan'), {
    method: 'DELETE',
  })
}
