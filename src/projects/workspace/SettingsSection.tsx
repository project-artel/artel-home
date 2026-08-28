import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import { apiErrorMessage } from '../apiErrorMessage'
import { DeleteProjectDialog } from '../DeleteProjectDialog'
import { formatDate } from '../formatters'
import { ProjectApiError, updateProject } from '../projectApi'
import { ProjectForm } from '../ProjectForm'
import type { ProjectDetail, ProjectDraft } from '../projectTypes'
import { TrackerLinkPanel } from '../../tracker/TrackerLinkPanel'
import { useWorkspace } from './workspaceContext'

function toDraft(project: ProjectDetail): ProjectDraft {
  return {
    name: project.name,
    description: project.description ?? '',
    genre: project.genre,
  }
}

/**
 * What the project *is*, and how to end it.
 *
 * The editable fields and the delete sit together because both change the
 * project rather than what it has found. Delete keeps its own bordered block:
 * the one irreversible control on the screen should not read as the last item
 * in a form.
 */
export function SettingsSection() {
  const { applyProject, project } = useWorkspace()
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
      applyProject(updated)
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
    <div className="section-columns">
      <section className="panel" aria-labelledby="information-title">
        <header className="panel-header panel-header--split">
          <h2 id="information-title">{t.projects.workspace.generalTitle}</h2>
          {/* Read first, edit on request: a form left permanently open makes
              the whole screen read as unsaved work. */}
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

      <TrackerLinkPanel />

      {/* Members have no path to becoming an owner in this release, so a
          disabled control would be permanently dead UI. */}
      {project.myRole === 'OWNER' && (
        <section className="panel panel--danger" aria-labelledby="danger-title">
          <header className="panel-header">
            <h2 id="danger-title">{t.projects.workspace.dangerTitle}</h2>
          </header>
          <p className="section-intro">{t.projects.workspace.dangerCopy}</p>
          <button
            className="button button--danger-quiet"
            onClick={() => setDeleting(true)}
            type="button"
          >
            {t.projects.detail.deleteProject}
          </button>
        </section>
      )}

      {deleting && (
        <DeleteProjectDialog
          onClose={() => setDeleting(false)}
          onDeleted={() => navigate('/projects', { replace: true })}
          projectId={project.id}
          projectName={project.name}
        />
      )}
    </div>
  )
}
