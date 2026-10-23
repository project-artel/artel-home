import type { ProjectSummary } from './projectTypes'

/** 한 쪽에 프로젝트 7개 + 늘 마지막 칸인 "새 프로젝트" = 8칸(ARTEL-1208). */
export const PROJECTS_PER_PAGE = 7

export type ProjectSort = 'recent' | 'name'

/** (즐겨찾기만) → 찾기 → 정렬. 즐겨찾기는 정렬과 상관없이 늘 앞에 온다. */
export function arrangeProjects(
  projects: readonly ProjectSummary[],
  {
    query,
    sort,
    favorites,
    favoritesOnly = false,
  }: { query: string; sort: ProjectSort; favorites: ReadonlySet<string>; favoritesOnly?: boolean },
): ProjectSummary[] {
  const needle = query.trim().toLowerCase()
  const matched = projects.filter(
    (project) =>
      (!favoritesOnly || favorites.has(project.id)) &&
      (needle === '' || `${project.name} ${project.description ?? ''}`.toLowerCase().includes(needle)),
  )
  return [...matched].sort((a, b) => {
    const favorite = Number(favorites.has(b.id)) - Number(favorites.has(a.id))
    if (favorite !== 0) return favorite
    return sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt.localeCompare(a.updatedAt)
  })
}

/** 쪽 수. 프로젝트가 없어도 "새 프로젝트" 칸이 있는 한 쪽은 있다. */
export function pageCount(count: number): number {
  return Math.max(1, Math.ceil(count / PROJECTS_PER_PAGE))
}

export function pageSlice<T>(items: readonly T[], page: number): T[] {
  return items.slice(page * PROJECTS_PER_PAGE, (page + 1) * PROJECTS_PER_PAGE)
}
