import { useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
import { apiErrorMessage } from './apiErrorMessage'
import { createProject, ProjectApiError } from './projectApi'
import { ProjectForm } from './ProjectForm'
import { DEFAULT_GENRE, type ProjectDetail, type ProjectDraft } from './projectTypes'

const emptyDraft: ProjectDraft = { name: '', description: '', genre: DEFAULT_GENRE }

export function ProjectCreateDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (project: ProjectDetail) => void
}) {
  const [draft, setDraft] = useState<ProjectDraft>(emptyDraft)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const { t } = useI18n()

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setFailure(null)
    setFieldErrors({})

    try {
      const project = await createProject({
        name: draft.name.trim(),
        description: draft.description.trim(),
        genre: draft.genre,
      })
      onCreated(project)
    } catch (error: unknown) {
      if (error instanceof ProjectApiError) {
        setFieldErrors(error.fields)
        // With per-field messages shown inline, a banner repeating them would
        // just say the same thing twice.
        setFailure(Object.keys(error.fields).length > 0 ? null : apiErrorMessage(error, t))
      } else {
        setFailure(t.projects.createDialog.createFailed)
      }
      setPending(false)
    }
  }

  return (
    <Dialog title={t.projects.list.newProject} labelledBy="create-project-title" onClose={onClose}>
      <form onSubmit={submit} noValidate>
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
          disabled={pending}
        >
          <div className="dialog-actions">
            <button
              className="button button--secondary"
              disabled={pending}
              onClick={onClose}
              type="button"
            >
              {t.projects.shared.cancel}
            </button>
            <button
              className="button button--primary"
              disabled={pending || draft.name.trim().length === 0}
              type="submit"
            >
              {pending ? t.projects.shared.creating : t.projects.createDialog.create}
            </button>
          </div>
        </ProjectForm>
      </form>
    </Dialog>
  )
}
