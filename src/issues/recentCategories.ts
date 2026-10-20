import type { IssueCategory } from './issueTypes'

/**
 * 최근에 쓴 카테고리(ARTEL-1114). 거르기 줄에는 몇 개만 칩으로 두고 나머지는 "+N" 에서 고른다 — 그 몇 개는 이 브라우저에서
 * 최근에 거르거나 붙인 것이고, 아직 없으면 많이 쓰인 순서다. 서버에 남기지 않는 화면 편의라 브라우저 저장소에 둔다.
 */
const KEY = (projectId: string) => `artel.issues.recentCategories.${projectId}`
const LIMIT = 20

function read(projectId: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY(projectId)) ?? '[]')
    return Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string') : []
  } catch {
    return []
  }
}

export function touchCategories(projectId: string, ids: readonly string[]) {
  if (ids.length === 0) return
  const next = [...ids, ...read(projectId).filter((id) => !ids.includes(id))].slice(0, LIMIT)
  try {
    localStorage.setItem(KEY(projectId), JSON.stringify(next))
  } catch {
    // 저장소가 막혀 있으면 많이 쓰인 순서로만 보인다.
  }
}

/** 최근에 쓴 것 먼저, 그다음 많이 쓰인 순서. */
export function orderByRecent(projectId: string, categories: readonly IssueCategory[]): IssueCategory[] {
  const recent = read(projectId)
  const rank = (category: IssueCategory) => {
    const index = recent.indexOf(category.id)
    return index < 0 ? Number.MAX_SAFE_INTEGER : index
  }
  return [...categories].sort(
    (a, b) => rank(a) - rank(b) || b.issueCount + b.discussionCount - (a.issueCount + a.discussionCount) || a.name.localeCompare(b.name),
  )
}
