import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DeleteProjectDialog } from './DeleteProjectDialog'
import { DocumentPanel } from './DocumentPanel'
import { formatDate } from './formatters'
import { ProjectApiError, updateProject } from './projectApi'
import { ProjectForm } from './ProjectForm'
import { GENRE_LABELS, type ProjectDetail, type ProjectDraft } from './projectTypes'
import { useProject } from './useProject'

/**
 * Keyed by the project id so switching projects remounts rather than reusing
 * the previous project's loaded state and edited form.
 */
export function ProjectDetailRoute() {
  const { projectId = '' } = useParams()
  return <ProjectDetailPage key={projectId} projectId={projectId} />
}

function ProjectDetailPage({ projectId }: { projectId: string }) {
  const { status, project, documents, reload, applyProject, applyNewDocument } =
    useProject(projectId)

  if (status === 'loading') {
    return (
      <section className="page" aria-busy="true">
        <p className="panel-empty">Loading project…</p>
      </section>
    )
  }

  if (status === 'missing') {
    return (
      <section className="page">
        <div className="panel-message">
          <h1>Project not found</h1>
          <p className="panel-message-copy">
            It may have been deleted, or you may not have access to it.
          </p>
          <Link className="button button--secondary" to="/projects">Back to projects</Link>
        </div>
      </section>
    )
  }

  if (status === 'error' || project === null) {
    return (
      <section className="page">
        <div className="panel-message" role="alert">
          <p>This project could not be loaded.</p>
          <button className="button button--secondary" onClick={reload} type="button">
            Retry
          </button>
        </div>
      </section>
    )
  }

  return (
    <ProjectDetailView
      documents={documents}
      onNewDocument={applyNewDocument}
      onSaved={applyProject}
      project={project}
    />
  )
}

function toDraft(project: ProjectDetail): ProjectDraft {
  return {
    name: project.name,
    description: project.description ?? '',
    genre: project.genre,
  }
}

function ProjectDetailView({
  project,
  documents,
  onSaved,
  onNewDocument,
}: {
  project: ProjectDetail
  documents: Parameters<typeof DocumentPanel>[0]['documents']
  onSaved: (project: ProjectDetail) => void
  onNewDocument: Parameters<typeof DocumentPanel>[0]['onUploaded']
}) {
  const [draft, setDraft] = useState<ProjectDraft>(() => toDraft(project))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [syncedFrom, setSyncedFrom] = useState(project)
  const navigate = useNavigate()

  // A save replaces the server copy; the form follows it during render so the
  // inputs never show a value the server has already superseded. Adjusting
  // state while rendering is what React prefers over an effect that would
  // paint the stale value first.
  if (syncedFrom !== project) {
    setSyncedFrom(project)
    setDraft(toDraft(project))
  }

  const saved = toDraft(project)
  const dirty =
    draft.name !== saved.name ||
    draft.description !== saved.description ||
    draft.genre !== saved.genre

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setFailure(null)
    setFieldErrors({})

    try {
      const updated = await updateProject(project.id, {
        name: draft.name.trim(),
        description: draft.description.trim(),
        genre: draft.genre,
      })
      onSaved(updated)
      setAnnouncement('Project saved.')
    } catch (error: unknown) {
      if (error instanceof ProjectApiError) {
        setFieldErrors(error.fields)
        setFailure(Object.keys(error.fields).length > 0 ? null : error.message)
      } else {
        setFailure('The project could not be saved. Please try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="page" aria-labelledby="project-title">
      <header className="page-header">
        <div>
          <Link className="back-link" to="/projects">← Projects</Link>
          <h1 id="project-title">{project.name}</h1>
          <p className="page-subtitle">
            <span className="badge">{GENRE_LABELS[project.genre]}</span>
            <span aria-hidden="true">·</span>
            <span>Updated {formatDate(project.updatedAt)}</span>
          </p>
        </div>
        {/* Members have no path to becoming an owner in this release, so a
            disabled control would be permanently dead UI. */}
        {project.myRole === 'OWNER' && (
          <button
            className="button button--danger-quiet"
            onClick={() => setDeleting(true)}
            type="button"
          >
            Delete project
          </button>
        )}
      </header>

      <div className="detail-columns">
        <section className="panel" aria-labelledby="information-title">
          <header className="panel-header">
            <h2 id="information-title">Information</h2>
          </header>

          <form onSubmit={save} noValidate>
            {failure !== null && (
              <div className="inline-error" role="alert">
                <span aria-hidden="true">!</span>
                {failure}
              </div>
            )}

            <ProjectForm
              draft={draft}
              onChange={setDraft}
              fieldErrors={fieldErrors}
              disabled={saving}
            >
              <div className="form-actions">
                <button
                  className="button button--primary"
                  disabled={!dirty || saving || draft.name.trim().length === 0}
                  type="submit"
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </ProjectForm>
          </form>

          <p aria-live="polite" className="visually-hidden">{announcement}</p>
        </section>

        <DocumentPanel
          documents={documents}
          onUploaded={onNewDocument}
          projectId={project.id}
        />
      </div>

      {deleting && (
        <DeleteProjectDialog
          onClose={() => setDeleting(false)}
          onDeleted={() => navigate('/projects', { replace: true })}
          projectId={project.id}
          projectName={project.name}
        />
      )}
    </section>
  )
}
