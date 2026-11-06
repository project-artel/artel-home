import type { TelemetrySettings } from './settingsApi'

/**
 * admin 이 아직 사용 통계 전송 여부를 정하지 않았을 때만 true 다.
 * 서버에 endpoint 가 있고(`available`), 값이 admin 설정이 아니라 환경 변수 기본값에서 오며(`source`),
 * 꺼져 있는(`enabled`) 경우가 그렇다. 한 번 정하면 `source` 가 `setting` 이 되므로 다시 묻지 않는다.
 */
export function shouldAskForUsageStats(settings: TelemetrySettings): boolean {
  return settings.available && settings.source === 'environment' && !settings.enabled
}
