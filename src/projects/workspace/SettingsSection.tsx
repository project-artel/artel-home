import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import { useActionBinding, useFieldBinding } from '../../projectAgent/bindings'
import { requireKnownId } from '../../projectAgent/specs/fieldWriters'
import {
  SETTINGS_DESCRIPTION_FIELD,
  SETTINGS_GENRE_FIELD,
  SETTINGS_NAME_FIELD,
  SETTINGS_OPEN_DELETE_ACTION,
  createOpenDeleteRunner,
  SETTINGS_SAVE_ACTION,
} from '../../projectAgent/specs/settings'
import { apiErrorMessage } from '../apiErrorMessage'
import { DeleteProjectDialog } from '../DeleteProjectDialog'
import { formatDate } from '../formatters'
import { ProjectApiError, updateProject } from '../projectApi'
import { ProjectForm } from '../ProjectForm'
import { GENRES, type Genre, type ProjectDetail, type ProjectDraft } from '../projectTypes'
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

  /**
   * 폼을 저장한다. 저장 버튼과 project agent 의 action 이 같이 부른다. 실패는 폼에 보이는 문장으로
   * 돌려주고, 성공이면 null 이다.
   */
  async function submit(): Promise<string | null> {
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
      return null
    } catch (error: unknown) {
      if (error instanceof ProjectApiError) {
        setFieldErrors(error.fields)
        const message = apiErrorMessage(error, t)
        setFailure(Object.keys(error.fields).length > 0 ? null : message)
        return Object.keys(error.fields).length > 0 ? Object.values(error.fields).join(' ') : message
      }
      setFailure(t.projects.detail.saveFailed)
      return t.projects.detail.saveFailed
    } finally {
      setSaving(false)
    }
  }

  function save(event: React.FormEvent) {
    event.preventDefault()
    void submit()
  }

  const saveBlockedReason = !editing
    ? 'The edit form is closed. Set a field first.'
    : saving
      ? t.projects.shared.saving
      : draft.name.trim().length === 0
        ? 'The name is empty.'
        : !dirty
          ? 'Nothing has changed.'
          : null
  const fieldInput = (name: string) => () =>
    document.querySelector<HTMLElement>(`[data-agent-target="settings.${name}"]`) ??
    document.querySelector<HTMLElement>('[data-agent-target="settings.edit"]')

  useActionBinding(SETTINGS_SAVE_ACTION, {
    target: () => document.querySelector<HTMLElement>('[data-agent-target="settings.save"]'),
    blocked: () => saveBlockedReason,
    run: async () => {
      const message = await submit()
      if (message !== null) throw new Error(message)
      return { name: draft.name.trim(), genre: draft.genre, description: draft.description.trim() }
    },
  })
  useActionBinding(SETTINGS_OPEN_DELETE_ACTION, {
    target: () => document.querySelector<HTMLElement>('[data-agent-target="settings.delete"]'),
    blocked: () => (project.myRole !== 'OWNER' ? t.projects.deleteDialog.forbidden : null),
    run: createOpenDeleteRunner(() => setDeleting(true)),
  })
  // 칸을 쓰면 폼이 열린다. 폼이 닫혀 있는 동안의 강조는 "수정" 버튼에 한다.
  useFieldBinding(SETTINGS_NAME_FIELD, {
    target: fieldInput('name'),
    read: () => draft.name,
    write: (value) => {
      if (typeof value !== 'string') throw new Error('settings.name must be a string.')
      setEditing(true)
      setDraft((current) => ({ ...current, name: value }))
    },
  })
  useFieldBinding(SETTINGS_GENRE_FIELD, {
    target: fieldInput('genre'),
    read: () => draft.genre,
    options: () => GENRES.map((genre) => ({ value: genre, label: t.projects.genreLabels[genre] })),
    write: (value) => {
      const genre = requireKnownId('settings.genre', value, GENRES) as Genre
      setEditing(true)
      setDraft((current) => ({ ...current, genre }))
    },
  })
  useFieldBinding(SETTINGS_DESCRIPTION_FIELD, {
    target: fieldInput('description'),
    read: () => draft.description,
    write: (value) => {
      if (typeof value !== 'string') throw new Error('settings.description must be a string.')
      setEditing(true)
      setDraft((current) => ({ ...current, description: value }))
    },
  })

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
              data-agent-target="settings.edit"
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
                  data-agent-target="settings.save"
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
            data-agent-target="settings.delete"
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
