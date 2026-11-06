import { QaLaunch } from '../../qa/launch/QaLaunch'

/**
 * QA 실행(ARTEL-1084). 테스트 런 · 게임 · 에이전트를 골라 돌리는 워크벤치와, 그 실행의 전제(게임
 * 연결 · 빌드)를 다루는 콘솔 관리가 한 화면에 있다 — 화면은 {@link QaLaunch} 가 그린다.
 */
export function QaSection() {
  return <QaLaunch />
}
