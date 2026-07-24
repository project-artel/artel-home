import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DeleteProjectDialog } from './DeleteProjectDialog'
import { DocumentPanel } from './DocumentPanel'
import { formatDate } from './formatters'
import { GameBuildPanel } from './GameBuildPanel'
import { GameInstancePanel } from './GameInstancePanel'
import { useI18n } from '../i18n/useI18n'
import { apiErrorMessage } from './apiErrorMessage'
import { ProjectApiError, updateProject } from './projectApi'
import { ProjectForm } from './ProjectForm'
import type { ProjectDetail, ProjectDraft } from './projectTypes'
import { StartScenarioPanel } from '../testScenarios/StartScenarioPanel'
import type { GameBuild, GameInstance } from './gameTypes'
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
  const {
    applyBuild,
    applyInstance,
    applyNewDocument,
    applyNewInstance,
    applyProject,
    builds,
    documents,
    instances,
    project,
    refreshGameState,
    reload,
    removeInstance,
    status,
  } = useProject(projectId)
  const { t } = useI18n()

  if (status === 'loading') {
    return (
      <section className="page" aria-busy="true">
        <p className="panel-empty">{t.projects.detail.loading}</p>
      </section>
    )
  }

  if (status === 'missing') {
    return (
      <section className="page">
        <div className="panel-message">
          <h1>{t.projects.detail.notFoundTitle}</h1>
          <p className="panel-message-copy">{t.projects.shared.missingCopy}</p>
          <Link className="button button--secondary" to="/projects">
            {t.projects.shared.backToProjects}
          </Link>
        </div>
      </section>
    )
  }

  if (status === 'error' || project === null) {
    return (
      <section className="page">
        <div className="panel-message" role="alert">
          <p>{t.projects.detail.loadFailed}</p>
          <button className="button button--secondary" onClick={reload} type="button">
            {t.projects.shared.retry}
          </button>
        </div>
      </section>
    )
  }

  return (
    <ProjectDetailView
      builds={builds}
      documents={documents}
      instances={instances}
      onBuildSaved={applyBuild}
      onInstanceCreated={applyNewInstance}
      onInstanceRefresh={refreshGameState}
      onInstanceRemoved={removeInstance}
      onInstanceSaved={applyInstance}
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
  instances,
  builds,
  onSaved,
  onNewDocument,
  onInstanceCreated,
  onInstanceRefresh,
  onInstanceRemoved,
  onInstanceSaved,
  onBuildSaved,
}: {
  project: ProjectDetail
  documents: Parameters<typeof DocumentPanel>[0]['documents']
  instances: GameInstance[]
  builds: GameBuild[]
  onSaved: (project: ProjectDetail) => void
  onNewDocument: Parameters<typeof DocumentPanel>[0]['onUploaded']
  onInstanceCreated: (instance: GameInstance) => void
  onInstanceRefresh: () => Promise<void>
  onInstanceRemoved: (instanceId: string) => void
  onInstanceSaved: (instance: GameInstance) => void
  onBuildSaved: (build: GameBuild) => void
}) {
  const [draft, setDraft] = useState<ProjectDraft>(() => toDraft(project))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [syncedFrom, setSyncedFrom] = useState(project)
  const navigate = useNavigate()
  const { t } = useI18n()

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

  /** Leaving edit mode discards the draft, so nothing half-typed survives unseen. */
  function cancelEditing() {
    setDraft(toDraft(project))
    setFieldErrors({})
    setFailure(null)
    setEditing(false)
  }

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
      setEditing(false)
      setAnnouncement(t.projects.detail.savedAnnouncement)
    } catch (error: unknown) {
      if (error instanceof ProjectApiError) {
        setFieldErrors(error.fields)
        setFailure(Object.keys(error.fields).length > 0 ? null : apiErrorMessage(error, t))
      } else {
        setFailure(t.projects.detail.saveFailed)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="page" aria-labelledby="project-title">
      <header className="page-header">
        <div>
          <Link className="back-link" to="/projects">{t.projects.detail.backToList}</Link>
          <h1 id="project-title">{project.name}</h1>
          <p className="page-subtitle">
            <span className="badge">{t.projects.genreLabels[project.genre]}</span>
            <span aria-hidden="true">·</span>
            <span>{t.projects.shared.updated(formatDate(project.updatedAt))}</span>
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
            {t.projects.detail.deleteProject}
          </button>
        )}
      </header>

      <div className="detail-columns">
        <section className="panel" aria-labelledby="information-title">
          <header className="panel-header panel-header--split">
            <h2 id="information-title">{t.projects.detail.informationTitle}</h2>
            {/* Read first, edit on request. The project tab will gain more
                panels, and a form left permanently open would make the whole
                page read as a settings screen. */}
            {!editing && (
              <button
                className="button button--secondary button--compact"
                onClick={() => setEditing(true)}
                type="button"
              >
                {t.projects.shared.edit}
              </button>
            )}
          </header>

          {editing ? (
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
                    className="button button--secondary"
                    disabled={saving}
                    onClick={cancelEditing}
                    type="button"
                  >
                    {t.projects.shared.cancel}
                  </button>
                  <button
                    className="button button--primary"
                    disabled={!dirty || saving || draft.name.trim().length === 0}
                    type="submit"
                  >
                    {saving ? t.projects.shared.saving : t.projects.shared.saveChanges}
                  </button>
                </div>
              </ProjectForm>
            </form>
          ) : (
            <dl className="detail-fields">
              <dt>{t.projects.shared.nameLabel}</dt>
              <dd>{project.name}</dd>

              <dt>{t.projects.form.genreLabel}</dt>
              <dd>{t.projects.genreLabels[project.genre]}</dd>

              <dt>{t.projects.form.descriptionLabel}</dt>
              <dd>
                {project.description !== null && project.description.length > 0 ? (
                  project.description
                ) : (
                  <span className="detail-empty">{t.projects.detail.noDescription}</span>
                )}
              </dd>

              <dt>{t.projects.detail.createdField}</dt>
              <dd>{formatDate(project.createdAt)}</dd>
            </dl>
          )}

          <p aria-live="polite" className="visually-hidden">{announcement}</p>
        </section>

        <DocumentPanel
          documents={documents}
          onUploaded={onNewDocument}
          projectId={project.id}
        />

        {/* Both panels join the existing two-column grid and wrap into a second
            row, giving 2×2 at ≥1024px and a single column below it. Their rows
            are short, so a full-width row for either would leave most of the
            width empty at 1440px. */}
        <GameInstancePanel
          instances={instances}
          onCreated={onInstanceCreated}
          onRefresh={onInstanceRefresh}
          onRemoved={onInstanceRemoved}
          onSaved={onInstanceSaved}
          projectId={project.id}
        />

        <GameBuildPanel builds={builds} onSaved={onBuildSaved} projectId={project.id} />

        <StartScenarioPanel projectId={project.id} />
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
