import type { Messages } from '../../i18n/messages'

/**
 * The sidebar's order, and the single source of truth for a section's path.
 *
 * The nav, the heading above the content, and the dashboard's "see all" links
 * all read from here, so a renamed route cannot leave one of the three
 * pointing at the old address.
 *
 * `members` and `settings` are deliberately not in this list: they sit below
 * the divider at the bottom of the rail and are not part of the main sequence.
 */
export const WORKSPACE_SECTIONS = [
  { id: 'dashboard', path: '' },
  { id: 'documents', path: 'documents' },
  { id: 'testRuns', path: 'test-runs' },
  { id: 'qa', path: 'qa' },
  { id: 'qaHistory', path: 'qa-history' },
  { id: 'contentMap', path: 'content-map' },
  { id: 'performance', path: 'performance' },
  { id: 'issues', path: 'issues' },
  { id: 'knowledge', path: 'knowledge' },
] as const

/**
 * `usage`, `members`, `settings` 는 위 목록에 없다. 셋 다 rail 아래 칸의 관리 화면이고, QA 가
 * 흐르는 순서 사이에 끼우면 그 순서가 깨진다. 지출은 QA 를 돌리는 단계가 아니라 그 결과를
 * 정산하는 자리라 여기에 붙는다.
 */
export type WorkspaceSectionId =
  | (typeof WORKSPACE_SECTIONS)[number]['id']
  | 'usage'
  | 'members'
  | 'settings'

/** Absolute address of one section, for `Link`s and `NavLink`s alike. */
export function sectionHref(projectId: string, path: string): string {
  const base = `/projects/${encodeURIComponent(projectId)}`
  return path.length === 0 ? base : `${base}/${path}`
}

/**
 * Which section a pathname is in. Read for the heading above the content;
 * anything that is not a known section (a deep page opened from one) falls
 * back to the dashboard label rather than rendering an empty heading.
 */
export function sectionIdFromPath(projectId: string, pathname: string): WorkspaceSectionId {
  const base = `/projects/${encodeURIComponent(projectId)}`
  const rest = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\//, '') : ''
  if (rest === 'usage') return 'usage'
  if (rest === 'members') return 'members'
  if (rest === 'settings') return 'settings'
  const match = WORKSPACE_SECTIONS.find((section) => section.path === rest)
  return match?.id ?? 'dashboard'
}

export function sectionLabel(t: Messages, id: WorkspaceSectionId): string {
  return t.projects.workspace.nav[id]
}
