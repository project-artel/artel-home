import { subscription } from './evaluationApi'

/**
 * QA run 을 시작한 사람이 그 프로젝트의 질문 알림을 받는다. 별도 구독 체크박스는 없다.
 *
 * 권한 요청은 run 생성 요청보다 먼저, 버튼 클릭 직후에 보낸다 — Chrome 은 사용자 동작에서 먼 요청을
 * 조용한 알림으로 낮춘다. 이미 허용·거부된 상태면 브라우저가 창을 띄우지 않고 그대로 답한다.
 */
export function requestQuestionNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return Promise.resolve('denied')
  try { return Notification.requestPermission() } catch { return Promise.resolve('denied') }
}

/** 구독 실패는 QA 시작을 막지 않는다. 질문은 작업공간 화면에서도 보인다. */
export async function subscribeQuestionNotifications(project: string): Promise<void> {
  try { await subscription(project, true) } catch { /* 다음 run 시작 때 다시 구독한다. */ }
}
