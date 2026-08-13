import type { Messages } from '../../i18n/messages'

/**
 * The sidebar's order, and the single source of truth for a section's path.
 *
 * The nav, the heading above the content, and the dashboard's "see all" links
 * all read from here, so a renamed route cannot leave one of the three
 * pointing at the old address.
 *
 * `settings` is deliberately not in this list: it sits below the divider at
 * the bottom of the rail and is not part of the main sequence.
 */
export const WORKSPACE_SECTIONS = [
  { id: 'dashboard', path: '' },
  { id: 'documents', path: 'documents' },
  { id: 'testRuns', path: 'test-runs' },
  { id: 'qa', path: 'qa' },
  { id: 'qaHistory', path: 'qa-history' },
  { id: 'issues', path: 'issues' },
] as const

export type WorkspaceSectionId =
  | (typeof WORKSPACE_SECTIONS)[number]['id']
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
  if (rest === 'settings') return 'settings'
  const match = WORKSPACE_SECTIONS.find((section) => section.path === rest)
  return match?.id ?? 'dashboard'
}

export function sectionLabel(t: Messages, id: WorkspaceSectionId): string {
  return t.projects.workspace.nav[id]
}
