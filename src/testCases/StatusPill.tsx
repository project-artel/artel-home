import type { useI18n } from '../i18n/useI18n'
import type { VerificationStatus } from './testCaseTypes'

/** 결과 칸의 pill. 이 버전에 없는 케이스(판정 `null`)는 따로 그린다. 라이브러리 표와 TC 가져오기 창이 함께 쓴다. */
export function StatusPill({
  labels,
  status,
}: {
  labels: ReturnType<typeof useI18n>['t']['testCases']
  status: VerificationStatus | null
}) {
  if (status === null) return <span className="vpill vpill--absent">{labels.versions.absent}</span>
  return (
    <span className={`vpill ${status}`}>
      <span className={`vdot ${status}`} />
      {labels.outcome[status]}
    </span>
  )
}
