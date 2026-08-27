import { NavLink } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
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
 * The project's left rail.
 *
 * Counts are the reason the rail is worth its width: they answer "is there
 * anything in there" without a visit. A count is omitted rather than shown as
 * `0` while its read is still in flight, so a number never appears, changes,
 * and reflows the row under the pointer.
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
  const nav = t.projects.workspace.nav

  return (
    <nav aria-label={t.projects.workspace.navLabel} className="project-nav">
      <div className="project-nav-head">
        <p className="project-nav-eyebrow">{t.projects.workspace.projectEyebrow}</p>
        <div className="project-nav-identity">
          <span className="project-nav-name" title={projectName}>{projectName}</span>
          <span className="badge">{genreLabel}</span>
        </div>
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
              to={sectionHref(projectId, section.path)}
            >
              <SectionIcon id={section.id} />
              <span className="nav-label">{nav[section.id]}</span>
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
          to={sectionHref(projectId, 'settings')}
        >
          <SectionIcon id="settings" />
          <span className="nav-label">{nav.settings}</span>
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
