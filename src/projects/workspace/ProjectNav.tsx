import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import { readNavCollapsed, storeNavCollapsed } from './navCollapse'
import { sectionHref, WORKSPACE_SECTIONS, type WorkspaceSectionId } from './sections'

/**
 * Line icons at 15px, drawn from `currentColor` so a section's icon takes the
 * same colour as its label in every state without a second rule per state.
 */
const ICON_PATHS: Record<WorkspaceSectionId, string[]> = {
  dashboard: ['M2.5 2.5h4.7v4.7H2.5z', 'M8.8 2.5h4.7v4.7H8.8z', 'M2.5 8.8h4.7v4.7H2.5z', 'M8.8 8.8h4.7v4.7H8.8z'],
  documents: ['M4 2h5.3L12 4.7V14H4z', 'M9.3 2v2.7H12', 'M6 8h4', 'M6 10.5h4'],
  testRuns: ['M5.2 3.4l7 4.6-7 4.6z'],
  qa: ['M8.8 2L4 9h3.4l-.9 5L12 7H8.4z'],
  qaHistory: ['M3 4.2h10', 'M3 8h10', 'M3 11.8h6.5'],
  // A box holding two smaller boxes, with a line leaving it: a scene container,
  // the screens inside it, and a transition out. The drawing's own shape, small.
  contentMap: ['M2.2 3h7.6v7.6H2.2z', 'M3.8 4.6h1.9v1.9H3.8z', 'M6.4 4.6h1.9v1.9H6.4z', 'M9.8 6.8h2.6v6.4H6.6'],
  performance: ['M2.5 12.5l3.2-3.4 2.5 1.8 5.3-7', 'M10.8 3.9h2.7v2.7'],
  issues: ['M4 14V2.7', 'M4 3h8l-1.8 2.8L12 8.6H4'],
  // Three nodes and the lines between them: the graph's own shape, small.
  knowledge: ['M4 4.6l4.4 2.2', 'M8.4 6.8L12 11.4', 'M4 4.6l1.6 6.8', 'M5.6 11.4h6.4'],
  // 사람 둘. 한 명은 앞에, 한 명은 뒤에 반쯤 가려 서서 "혼자가 아니다" 를 15px 안에서 말한다.
  members: ['M6.2 8.6a3.4 3.4 0 1 1 0-5.2', 'M2.2 13.4c0-2.2 1.8-3.4 4-3.4s4 1.2 4 3.4', 'M10.4 4a2.8 2.8 0 0 1 0 4.4', 'M11.4 10.3c1.5.4 2.4 1.5 2.4 3.1'],
  settings: ['M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M12.4 3.6L11 5M5 11l-1.4 1.4'],
}

function SectionIcon({ id }: { id: WorkspaceSectionId }) {
  return (
    <svg
      aria-hidden="true"
      className="nav-icon"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.3}
      viewBox="0 0 16 16"
    >
      {id === 'settings' && <circle cx={8} cy={8} r={2.2} />}
      {ICON_PATHS[id].map((d) => (
        <path d={d} key={d} />
      ))}
    </svg>
  )
}

/**
 * 접기 방향을 그대로 가리키는 갈매기 하나. 펼쳐진 레일에서는 왼쪽을, 접힌
 * 레일에서는 오른쪽을 향해 버튼이 무엇을 할지 라벨을 읽기 전에 보여 준다.
 */
function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="nav-icon"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      viewBox="0 0 16 16"
    >
      <path d={collapsed ? 'M6.2 3.5L10.5 8l-4.3 4.5' : 'M9.8 3.5L5.5 8l4.3 4.5'} />
    </svg>
  )
}

/**
 * The project's left rail.
 *
 * Counts are the reason the rail is worth its width: they answer "is there
 * anything in there" without a visit. A count is omitted rather than shown as
 * `0` while its read is still in flight, so a number never appears, changes,
 * and reflows the row under the pointer.
 *
 * 접으면 아이콘만 남는 48px 레일이 된다. 폭을 내주고 싶지 않은 화면에서 쓰라고
 * 둔 것이라 label 은 화면에서만 사라질 뿐 DOM 에는 남는다 — 접힌 레일도 스크린
 * 리더에게는 펼친 레일과 똑같이 읽힌다.
 */
export function ProjectNav({
  counts,
  genreLabel,
  projectId,
  projectName,
}: {
  counts: Partial<Record<WorkspaceSectionId, number | null>>
  genreLabel: string
  projectId: string
  projectName: string
}) {
  const { t } = useI18n()
  const workspace = t.projects.workspace
  const nav = workspace.nav
  const [collapsed, setCollapsed] = useState(readNavCollapsed)

  const toggleLabel = collapsed ? workspace.expandNav : workspace.collapseNav

  return (
    <nav
      aria-label={workspace.navLabel}
      className={collapsed ? 'project-nav project-nav--collapsed' : 'project-nav'}
    >
      <div className="project-nav-head">
        <div className="project-nav-head-row">
          <p className="project-nav-eyebrow">{workspace.projectEyebrow}</p>
          <button
            aria-label={toggleLabel}
            className="nav-collapse-toggle"
            onClick={() => {
              const next = !collapsed
              setCollapsed(next)
              storeNavCollapsed(next)
            }}
            title={toggleLabel}
            type="button"
          >
            <CollapseIcon collapsed={collapsed} />
          </button>
        </div>
        <div className="project-nav-identity">
          <span className="project-nav-name" title={projectName}>{projectName}</span>
          <span className="badge">{genreLabel}</span>
        </div>
        {/* 접힌 레일에 이름이 들어갈 자리는 없지만, 어느 프로젝트를 보고 있는지는
            남아야 한다. 머리글자 하나가 그 자리를 대신한다. */}
        <span
          aria-label={projectName}
          className="project-nav-initial"
          role="img"
          title={projectName}
        >
          {projectName.slice(0, 1).toUpperCase()}
        </span>
      </div>

      <ul className="project-nav-list">
        {WORKSPACE_SECTIONS.map((section) => (
          <li key={section.id}>
            <NavLink
              className={({ isActive }) =>
                isActive ? 'nav-item nav-item--active' : 'nav-item'
              }
              // Without this the dashboard's own link stays active on every
              // child route, since its path is a prefix of all of them.
              end={section.path.length === 0}
              title={collapsed ? nav[section.id] : undefined}
              to={sectionHref(projectId, section.path)}
            >
              <SectionIcon id={section.id} />
              <span className={collapsed ? 'nav-label visually-hidden' : 'nav-label'}>
                {nav[section.id]}
              </span>
              <NavCount
                alert={section.id === 'issues'}
                value={counts[section.id] ?? null}
              />
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="project-nav-foot">
        <NavLink
          className={({ isActive }) => (isActive ? 'nav-item nav-item--active' : 'nav-item')}
          title={collapsed ? nav.members : undefined}
          to={sectionHref(projectId, 'members')}
        >
          <SectionIcon id="members" />
          <span className={collapsed ? 'nav-label visually-hidden' : 'nav-label'}>
            {nav.members}
          </span>
        </NavLink>
        <NavLink
          className={({ isActive }) => (isActive ? 'nav-item nav-item--active' : 'nav-item')}
          title={collapsed ? nav.settings : undefined}
          to={sectionHref(projectId, 'settings')}
        >
          <SectionIcon id="settings" />
          <span className={collapsed ? 'nav-label visually-hidden' : 'nav-label'}>
            {nav.settings}
          </span>
        </NavLink>
      </div>
    </nav>
  )
}

/**
 * Issues wear the critical tint only when there is at least one: a zero in
 * red would read as a problem the user has to go and look at.
 */
function NavCount({ alert, value }: { alert: boolean; value: number | null }) {
  if (value === null) return null

  const tone = alert && value > 0 ? 'nav-count nav-count--alert' : 'nav-count'
  return <span className={tone}>{value}</span>
}
