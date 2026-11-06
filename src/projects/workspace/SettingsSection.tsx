import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import { SettingsScreenFill, SettingsTabs, type SettingsTab } from '../../layouts/SettingsTabs'
import { BuildSketch, ModelChipSketch, ReviewSketch, TrackerSketch } from '../../emptyStates/sketches'
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
import { ReviewSettingsPanel } from '../../issues/discussions/ReviewSettingsPanel'
import '../../issues/discussions/discussions.css'
import { ProjectAgentModelPanel } from './ProjectAgentModelPanel'
import { sectionHref } from './sections'
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
  const { applyProject, builds, coverage, documents, models, openIssues, project, runs, trackerLink, tries } = useWorkspace()
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

  const w = t.projects.workspace
  const owner = project.myRole === 'OWNER'
  const qaRunIds = new Set(tries.map((qaTry) => qaTry.qaRunId))
  const failedRuns = new Set(tries.filter((qaTry) => qaTry.status === 'FAILED').map((qaTry) => qaTry.qaRunId))
  const latestBuild = [...builds].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null
  const stats = [
    { key: 'testCases', label: w.settingsStats.cases, value: coverage.total, sub: w.settingsStats.casesSub(coverage.authored), path: 'test-cases' },
    { key: 'testRuns', label: w.settingsStats.runs, value: runs.length, sub: w.settingsStats.runsSub(builds.length), path: 'test-runs' },
    { key: 'qaHistory', label: w.settingsStats.qa, value: qaRunIds.size, sub: w.settingsStats.qaSub(failedRuns.size), path: 'qa-history' },
    { key: 'issues', label: w.settingsStats.issues, value: openIssues.length, sub: null, path: 'issues' },
    { key: 'documents', label: w.settingsStats.documents, value: documents.length, sub: null, path: 'documents' },
  ]

  // 일반 탭(ARTEL-1380). 읽을 때는 큰 머리 + 숫자 칸 + 정보 표로 화면을 채우고, 고칠 때는 예전 폼 그대로다.
  const general = (
    <>
      <section className="panel" aria-labelledby="information-title">
        {editing ? (
          <>
            <header className="panel-header panel-header--split">
              <h2 id="information-title">{w.generalTitle}</h2>
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
          </>
        ) : (
          <div className="settings-hero">
            <span aria-hidden="true" className="settings-hero-mark">{project.name.slice(0, 1).toUpperCase()}</span>
            <div className="settings-hero-body">
              <div className="settings-hero-name">
                <h2 id="information-title">{project.name}</h2>
                <span className="badge">{t.projects.genreLabels[project.genre]}</span>
              </div>
              <p className="settings-hero-desc">
                {project.description !== null && project.description.length > 0 ? (
                  project.description
                ) : (
                  <span className="detail-empty">{t.projects.detail.noDescription}</span>
                )}
              </p>
              <span className="settings-hero-meta">
                {t.projects.detail.createdField} {formatDate(project.createdAt)} · {t.projects.roles[project.myRole]}
              </span>
            </div>
            {/* Read first, edit on request: a form left permanently open makes
                the whole screen read as unsaved work. */}
            <button
              className="button button--secondary button--compact"
              data-agent-target="settings.edit"
              onClick={() => setEditing(true)}
              type="button"
            >
              {t.projects.shared.edit}
            </button>
          </div>
        )}
        <p aria-live="polite" className="visually-hidden">{announcement}</p>
      </section>

      <div className="settings-stats">
        {stats.map((stat) => (
          <Link className="settings-stat" key={stat.key} to={sectionHref(project.id, stat.path)}>
            <span className="settings-stat-label">{stat.label}</span>
            <span className="settings-stat-value">{stat.value}</span>
            {stat.sub !== null && <span className="settings-stat-sub">{stat.sub}</span>}
          </Link>
        ))}
      </div>

      <section className="panel" aria-labelledby="settings-facts-title">
        <header className="panel-header">
          <h2 id="settings-facts-title">{w.settingsFacts.title}</h2>
        </header>
        <dl className="settings-facts">
          <div><dt>{t.projects.shared.nameLabel}</dt><dd>{project.name}</dd></div>
          <div><dt>{t.projects.form.genreLabel}</dt><dd>{t.projects.genreLabels[project.genre]}</dd></div>
          <div><dt>{w.settingsFacts.id}</dt><dd className="mono">{project.id}</dd></div>
          <div><dt>{t.projects.detail.createdField}</dt><dd>{formatDate(project.createdAt)}</dd></div>
          <div><dt>{w.settingsFacts.latestBuild}</dt><dd className="mono">{latestBuild === null ? w.settingsFacts.noBuild : (latestBuild.label ?? latestBuild.version)}</dd></div>
          <div><dt>{w.settingsFacts.tracker}</dt><dd>{trackerLink?.repository ?? w.settingsFacts.trackerNone}</dd></div>
        </dl>
      </section>
      <SettingsScreenFill body={w.settingsScreens.general} sketch={<BuildSketch />} title={w.generalTitle} />
    </>
  )

  const tabs: SettingsTab[] = [
    { id: 'general', label: w.generalTitle, content: general },
    {
      id: 'tracker',
      label: t.tracker.panel.title,
      content: (
        <>
          <TrackerLinkPanel />
          <SettingsScreenFill body={w.settingsScreens.tracker} sketch={<TrackerSketch />} title={t.tracker.panel.title} />
        </>
      ),
    },
    {
      id: 'review',
      label: w.reviewToc,
      content: (
        <>
          <ReviewSettingsPanel canEdit={owner} projectId={project.id} />
          <SettingsScreenFill body={w.settingsScreens.review} sketch={<ReviewSketch />} title={w.reviewToc} />
        </>
      ),
    },
    {
      id: 'agent',
      label: t.projectAgent.model.projectTitle,
      content: (
        <>
          <ProjectAgentModelPanel canEdit={owner} models={models} projectId={project.id} />
          <SettingsScreenFill body={w.settingsScreens.agent} sketch={<ModelChipSketch />} title={t.projectAgent.model.projectTitle} />
        </>
      ),
    },
  ]
  // Members have no path to becoming an owner in this release, so a
  // disabled control would be permanently dead UI.
  if (owner) {
    tabs.push({
      id: 'danger',
      label: w.dangerTitle,
      tone: 'danger',
      content: (
        <>
          <section className="panel panel--danger" aria-labelledby="danger-title">
            <header className="panel-header">
              <h2 id="danger-title">{w.dangerTitle}</h2>
            </header>
            <p className="section-intro">{w.dangerCopy}</p>
            <button
              className="button button--danger-quiet"
              data-agent-target="settings.delete"
              onClick={() => setDeleting(true)}
              type="button"
            >
              {t.projects.detail.deleteProject}
            </button>
          </section>
        </>
      ),
    })
  }

  return (
    <>
      <SettingsTabs label={w.settingsTocLabel} tabs={tabs} />
      {deleting && (
        <DeleteProjectDialog
          onClose={() => setDeleting(false)}
          onDeleted={() => navigate('/projects', { replace: true })}
          projectId={project.id}
          projectName={project.name}
        />
      )}
    </>
  )
}

