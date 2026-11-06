import { versionName } from '../testCases/testCaseVersions'
import { useTestCaseVersionList } from '../testCases/useTestCaseVersions'

/**
 * 빌드 버전 고르기(ARTEL-1114). 팀 공유 글의 버전 칸 · 게시판의 버전 거르기 · 이슈 연결 창이 같이 쓴다. 이름은 케이스
 * 라이브러리와 같다(`versionName`). 숨긴 버전은 지금 고른 값일 때만 보인다. 빈 값은 [emptyLabel] 이다.
 */
export function BuildVersionSelect({
  projectId,
  value,
  onChange,
  emptyLabel,
  label,
  id,
  className = 'dc-input',
  disabled = false,
}: {
  projectId: string
  value: string | null
  onChange: (gameBuildId: string | null) => void
  emptyLabel: string
  label: string
  id?: string
  className?: string
  disabled?: boolean
}) {
  const { versions, status } = useTestCaseVersionList(projectId)
  const shown = versions.filter((version) => !version.hidden || version.gameBuildId === value)
  return (
    <select
      aria-label={label}
      className={`${className} bvs`}
      disabled={disabled || status === 'loading'}
      id={id}
      onChange={(event) => onChange(event.target.value || null)}
      value={value ?? ''}
    >
      <option value="">{emptyLabel}</option>
      {shown.map((version) => (
        <option key={version.gameBuildId} value={version.gameBuildId}>
          {versionName(version)}
          {version.latest ? ' ★' : ''}
        </option>
      ))}
    </select>
  )
}
