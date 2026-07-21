import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatDate } from './formatters'
import { ProjectCreateDialog } from './ProjectCreateDialog'
import { GENRE_LABELS, type ProjectSummary } from './projectTypes'
import { useProjects } from './useProjects'

export function ProjectListPage() {
  const { status, projects, total, hasMore, loadingMore, loadMore, reload } = useProjects()
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()

  return (
    <section className="page" aria-labelledby="projects-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1 id="projects-title">Projects</h1>
        </div>
        <button
          className="button button--primary"
          onClick={() => setCreating(true)}
          type="button"
        >
          New project
        </button>
      </header>

      {status === 'loading' && (
        <ul className="project-list" aria-busy="true" aria-label="Loading projects">
          {[0, 1, 2].map((row) => (
            <li className="project-row project-row--skeleton" key={row} aria-hidden="true">
              <span className="skeleton-line" />
              <span className="skeleton-line skeleton-line--short" />
            </li>
          ))}
        </ul>
      )}

      {status === 'error' && (
        <div className="panel-message" role="alert">
          <p>The project list could not be loaded.</p>
          <button className="button button--secondary" onClick={reload} type="button">
            Retry
          </button>
        </div>
      )}

      {status === 'ready' && projects.length === 0 && (
        <div className="panel-message">
          <h2>No projects yet</h2>
          <p className="panel-message-copy">
            A project groups the builds, QA sessions, and planning documents for
            one game. Create one to get started.
          </p>
          <button
            className="button button--primary"
            onClick={() => setCreating(true)}
            type="button"
          >
            New project
          </button>
        </div>
      )}

      {status === 'ready' && projects.length > 0 && (
        <>
          <ul className="project-list">
            {projects.map((project) => (
              <ProjectRow key={project.id} project={project} />
            ))}
          </ul>

          <div className="list-footer">
            <p className="list-count">
              Showing {projects.length} of {total}
            </p>
            {hasMore && (
              <button
                className="button button--secondary"
                disabled={loadingMore}
                onClick={loadMore}
                type="button"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
          </div>
        </>
      )}

      {creating && (
        <ProjectCreateDialog
          onClose={() => setCreating(false)}
          onCreated={(project) => navigate(`/projects/${project.id}`)}
        />
      )}
    </section>
  )
}

function ProjectRow({ project }: { project: ProjectSummary }) {
  return (
    <li className="project-row">
      <Link className="project-row-link" to={`/projects/${project.id}`}>
        <span className="project-row-main">
          <span className="project-name">{project.name}</span>
          <span className="badge">{GENRE_LABELS[project.genre]}</span>
        </span>
        {project.description !== null && project.description.length > 0 && (
          <span className="project-description">{project.description}</span>
        )}
        <span className="project-row-meta">
          <DocumentState project={project} />
          <span aria-hidden="true">·</span>
          <span>Updated {formatDate(project.updatedAt)}</span>
        </span>
      </Link>
    </li>
  )
}

/**
 * State is carried by text, never by colour alone: the shape of the label is
 * what distinguishes "has a document" from "has none".
 */
function DocumentState({ project }: { project: ProjectSummary }) {
  if (project.latestDocument === null) {
    return <span className="project-doc project-doc--empty">No planning document</span>
  }

  return (
    <span className="project-doc">
      <span className="mono">v{project.latestDocument.version}</span>
      {' · '}
      {project.latestDocument.fileName}
    </span>
  )
}
