import type { ProjectSummary } from './projectsApi'

/** 프로젝트를 고르지 않은 상태. 빈 문자열을 쓰면 "아직 안 고름"과 구분되지 않는다. */
export const ALL_PROJECTS = 'all'

/** 선택기 목록의 한 줄. `all` 줄은 프로젝트가 아니라서 [ProjectSummary]로 담지 않는다. */
export interface PickerEntry {
  id: string
  name: string
  mine: boolean
}

/**
 * 선택기에 그릴 목록.
 *
 * 참여 중인 프로젝트가 위로 올라온다. 개발자 등급에게는 남의 프로젝트가 훨씬 많아서, 순서를 서버가
 * 준 그대로 두면 매일 여는 자기 프로젝트가 목록 한가운데 파묻힌다.
 *
 * 같은 무리 안에서는 **서버가 준 순서를 그대로 지킨다**(최근 수정순). 여기서 이름으로 다시 정렬하면
 * 검색어를 지웠을 때 목록이 처음과 다른 순서로 돌아온다.
 */
export function entriesFor(
  projects: ProjectSummary[],
  options: { allowAll?: boolean; allLabel: string } = { allLabel: '' }
): PickerEntry[] {
  const mine = projects.filter((project) => project.mine)
  const others = projects.filter((project) => !project.mine)
  const sorted = [...mine, ...others].map((project) => ({
    id: project.id,
    name: project.name,
    mine: project.mine,
  }))
  if (!options.allowAll) return sorted
  return [{ id: ALL_PROJECTS, name: options.allLabel, mine: false }, ...sorted]
}

/**
 * 입력한 글자로 좁힌 목록.
 *
 * 대소문자를 가리지 않고 이름 어디에 있어도 걸린다. 앞글자만 보면 `상점 시뮬`을 `시뮬`로 못 찾는데,
 * 사람은 기억나는 조각으로 찾는다.
 *
 * 빈 문자열과 공백만 있는 입력은 안 고른 것과 같다. 검색어를 지우는 순간 목록이 비면 고를 것이
 * 사라진 것처럼 보인다.
 */
export function matching(entries: PickerEntry[], query: string): PickerEntry[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return entries
  return entries.filter((entry) => entry.name.toLowerCase().includes(needle))
}

/**
 * 화살표 키가 옮겨 갈 자리.
 *
 * 양 끝에서 감는다 — 목록이 짧을 때 끝에 걸려 멈추면 반대쪽 끝으로 가는 데 목록 길이만큼 눌러야
 * 한다. 빈 목록에서는 0으로 둔다. 그 값은 어차피 아무것도 가리키지 않는다.
 */
export function nextIndex(current: number, step: number, length: number): number {
  if (length === 0) return 0
  return (current + step + length) % length
}
