import type { Messages } from '../../i18n/messages'

/**
 * The sidebar's order, and the single source of truth for a section's path.
 *
 * The nav, the heading above the content, and the dashboard's "see all" links
 * all read from here, so a renamed route cannot leave one of the three
 * pointing at the old address.
 *
 * `setup`, `usage`, `members`, and `settings` are deliberately not in this
 * list: they sit below the divider at the bottom of the rail and are not part
 * of the main sequence.
 */
export const WORKSPACE_SECTIONS = [
  { id: 'dashboard', path: '' },
  { id: 'documents', path: 'documents' },
  { id: 'testCases', path: 'test-cases' },
  { id: 'testRuns', path: 'test-runs' },
  { id: 'qa', path: 'qa' },
  { id: 'qaHistory', path: 'qa-history' },
  { id: 'gameBuilds', path: 'game-builds' },
  { id: 'contentMap', path: 'content-map' },
  { id: 'macros', path: 'macros' },
  { id: 'performance', path: 'performance' },
  { id: 'issues', path: 'issues' },
  { id: 'knowledge', path: 'knowledge' },
] as const

/**
 * `usage`, `members`, `settings` 는 위 목록에 없다. 셋 다 rail 아래 칸의 관리 화면이고, QA 가
 * 흐르는 순서 사이에 끼우면 그 순서가 깨진다. 지출은 QA 를 돌리는 단계가 아니라 그 결과를
 * 정산하는 자리라 여기에 붙는다. `setup` 도 같은 칸에 둔다. SDK 와 CLI 설치는 머신마다 한 번
 * 하는 준비 작업이지 QA 순서의 한 단계가 아니다.
 */
export type WorkspaceSectionId =
  | (typeof WORKSPACE_SECTIONS)[number]['id']
  | 'setup'
  | 'usage'
  | 'members'
  | 'settings'

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
 */
export function sectionIdFromPath(projectId: string, pathname: string): WorkspaceSectionId {
  const base = `/projects/${encodeURIComponent(projectId)}`
  const rest = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\//, '') : ''
  if (rest === 'setup') return 'setup'
  if (rest === 'usage') return 'usage'
  if (rest === 'members') return 'members'
  if (rest === 'settings') return 'settings'
  const match = WORKSPACE_SECTIONS.find((section) => section.path === rest)
  return match?.id ?? 'dashboard'
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
