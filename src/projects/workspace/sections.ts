import type { Messages } from '../../i18n/messages'

/** 네비게이션 그룹과 각 화면의 경로를 한곳에서 관리한다. */
export const WORKSPACE_NAV_GROUPS = ['cases', 'qa', 'data', 'management'] as const

export const WORKSPACE_SECTIONS = [
  { id: 'dashboard', path: '', group: null },
  { id: 'chat', path: 'chat', group: null },
  { id: 'testCases', path: 'test-cases', group: 'cases' },
  { id: 'testRuns', path: 'test-runs', group: 'cases' },
  { id: 'macros', path: 'macros', group: 'cases' },
  { id: 'qa', path: 'qa', group: 'qa' },
  { id: 'qaHistory', path: 'qa-history', group: 'qa' },
  { id: 'issues', path: 'issues', group: 'qa' },
  { id: 'performance', path: 'performance', group: 'qa' },
  { id: 'documents', path: 'documents', group: 'data' },
  { id: 'gameBuilds', path: 'game-builds', group: 'data' },
  { id: 'contentMap', path: 'content-map', group: 'data' },
  { id: 'knowledge', path: 'knowledge', group: 'data' },
  { id: 'setup', path: 'setup', group: 'management' },
  { id: 'usage', path: 'usage', group: 'management' },
  { id: 'members', path: 'members', group: 'management' },
  { id: 'settings', path: 'settings', group: 'management' },
] as const satisfies ReadonlyArray<{ id: string; path: string; group: (typeof WORKSPACE_NAV_GROUPS)[number] | null }>

export type WorkspaceSectionId = (typeof WORKSPACE_SECTIONS)[number]['id']

/** Absolute address of one section, for `Link`s and `NavLink`s alike. */
export function sectionHref(projectId: string, path: string): string {
  const base = `/projects/${encodeURIComponent(projectId)}`
  return path.length === 0 ? base : `${base}/${path}`
}

/**
 * 게임 빌드 섹션 안에서 한 빌드의 상세를 여는 query(ARTEL-1105). 화면 지도 · 성능 섹션과 같은 `?build=` 관용구다.
 */
export function gameBuildDetailSearch(buildId: string): string {
  return `?${new URLSearchParams({ build: buildId })}`
}

/** 한 빌드 상세의 절대 주소. 콘솔 dialog 의 빌드 패널처럼 섹션 밖에서 거는 링크가 쓴다. */
export function gameBuildDetailHref(projectId: string, buildId: string): string {
  return `${sectionHref(projectId, 'game-builds')}${gameBuildDetailSearch(buildId)}`
}

/**
 * Which section a pathname is in. Read for the heading above the content;
 * anything that is not a known section (a deep page opened from one) falls
 * back to the dashboard label rather than rendering an empty heading.
 * A section's own sub-page (`qa-history/:qaRunId`, ARTEL-1135) keeps that section's heading.
 */
export function sectionIdFromPath(projectId: string, pathname: string): WorkspaceSectionId {
  const parts = projectPathSegments(projectId, pathname)
  if (parts === null || (parts.length > 1 && !isSectionSubPage(parts))) return 'dashboard'
  return WORKSPACE_SECTIONS.find((section) => section.path === (parts[0] ?? ''))?.id ?? 'dashboard'
}

/**
 * 이 path 가 섹션 화면(머리글이 있는 화면)인가. 아니고 깊은 화면도 아니면 프로젝트 안의 없는 주소다 — 그때는
 * "대시보드" 머리글 없이 404 만 그린다(ARTEL-1162). 끝의 `/` 는 같은 섹션으로 읽는다.
 */
export function isSectionPath(projectId: string, pathname: string): boolean {
  const parts = projectPathSegments(projectId, pathname)
  if (parts === null) return false
  if (isSectionSubPage(parts)) return true
  if (parts.length > 1) return false
  if (parts.length === 0) return true
  const [rest] = parts
  return WORKSPACE_SECTIONS.some((section) => section.path === rest)
}

/**
 * 섹션 머리글 아래에 그리는 섹션의 하위 페이지(ARTEL-1135). 깊은 화면과 달리 자기 머리글이 없다 — QA 히스토리의
 * 판정 근거 페이지는 히스토리 목록에서 열고 같은 머리글 아래 머문다.
 */
const SECTION_SUB_PAGES: ReadonlySet<string> = new Set(['qa-history'])

function isSectionSubPage(parts: readonly string[]): boolean {
  return parts.length === 2 && SECTION_SUB_PAGES.has(parts[0] ?? '')
}

/** 펼친 project rail 의 폭. App.css 의 `.project-workspace` grid 첫 칸과 같은 값이다. */
export const PROJECT_RAIL_PX = 216

/**
 * 이 project 아래 path 를 `/` 로 나눈 segment. index 는 `[]`, 다른 project 의 path 는 `null` 이다.
 * React Router 의 `pathname` 은 인코딩된 채로 오므로 projectId 도 인코딩해 비교한다.
 * 깊은 화면 판단과 대화창 접힘 판단이 모두 이 함수로 path 를 읽는다.
 */
export function projectPathSegments(projectId: string, pathname: string): string[] | null {
  const base = `/projects/${encodeURIComponent(projectId)}`
  if (pathname !== base && !pathname.startsWith(`${base}/`)) return null
  return pathname.slice(base.length).split('/').filter(Boolean)
}

export function sectionLabel(t: Messages, id: WorkspaceSectionId): string {
  return t.projects.workspace.nav[id]
}

/**
 * Whether a pathname is one of the project's deep pages (an instance, a
 * scenario, a test run, a QA run, a performance report) rather than a section.
 * A deep page brings its own header and back link, so the workspace renders it
 * without the section heading.
 *
 * Only paths under this project count; a path of another project, or the
 * redirect-only `game-builds/:buildId/content-map`, is not deep.
 */
export function isDeepPath(projectId: string, pathname: string): boolean {
  const parts = projectPathSegments(projectId, pathname)
  if (parts === null) return false
  const [head, , tail] = parts
  switch (head) {
    case 'instances':
    case 'test-scenarios':
      return parts.length === 2
    case 'test-runs':
      return parts.length === 2 || (parts.length === 3 && tail === 'edit')
    case 'qa-runs':
      return parts.length === 2 || (parts.length === 3 && tail === 'performance')
    case 'game-builds':
      return parts.length === 3 && tail === 'performance'
    default:
      return false
  }
}
