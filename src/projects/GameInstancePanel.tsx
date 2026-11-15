import { PanelHeader } from '../design-system/primitives/Headers'
import { Button, ButtonLink } from '../design-system/primitives/Button'
import { InlineError, PanelEmpty } from '../design-system/primitives/Feedback'
import { TextInput } from '../design-system/primitives/Fields'
import { Badge } from '../design-system/primitives/Badge'
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { DeleteGameInstanceDialog } from './DeleteGameInstanceDialog'
import { formatDate } from './formatters'
import { updateGameInstance } from './gameApi'
import { useI18n } from '../i18n/useI18n'
import { apiErrorMessage } from './apiErrorMessage'
import { ProjectApiError } from './projectApi'
import { sectionHref } from './workspace/sections'
import {
  describePlatform,
  INSTANCE_NAME_MAX_LENGTH,
  type GameInstance,
} from './gameTypes'

/**
 * The SDK installations belonging to this project.
 *
 * Rendered as dense rows rather than cards: a row is a name and a status line,
 * and a card grid would spend most of a 1440px viewport on padding. There is no
 * role gate — every project member may rename and delete instances, matching
 * the document panel rather than the owner-gated project delete.
 *
 * Nothing here creates an instance. A row appears when the SDK signs in against
 * this project and the game reports, so the panel's job is to show what has
 * arrived and to explain how to make the first one arrive.
 *
 * Loading and load-failure are not handled here. `useProject` fetches all four
 * legs together so the whole screen has one status, one message, and one Retry;
 * the failure state inside this panel is for mutations the user just triggered.
 */
export function GameInstancePanel({
  instances,
  onRemoved,
  onSaved,
  projectId,
}: {
  instances: GameInstance[]
  onRemoved: (instanceId: string) => void
  onSaved: (instance: GameInstance) => void
  projectId: string
}) {
  const [announcement, setAnnouncement] = useState('')
  const [deleting, setDeleting] = useState<GameInstance | null>(null)
  const { t } = useI18n()
  // The guide is about the project, not about a row: with no key to paste there
  // is nothing per-instance in it, so it is the project's setup section.
  const guideHref = sectionHref(projectId, 'setup')

  return (
    <section className="panel" aria-labelledby="instances-title">
      <PanelHeader split>
        <h2 id="instances-title">{t.projects.instances.title}</h2>
        <div className="panel-header-actions">
          <ButtonLink variant="primary" size="compact" to={guideHref}>
            {t.projects.instances.installGuide}
          </ButtonLink>
        </div>
      </PanelHeader>

      {instances.length === 0 ? (
        <div className="panel-empty-block">
          <PanelEmpty>{t.projects.instances.empty}</PanelEmpty>
          <ButtonLink variant="secondary" size="compact" to={guideHref}>
            {t.projects.instances.installGuide}
          </ButtonLink>
        </div>
      ) : (
        <ul className="instance-list">
          {instances.map((instance) => (
            <GameInstanceRow
              instance={instance}
              key={instance.id}
              onAnnounce={setAnnouncement}
              onDelete={setDeleting}
              onSaved={onSaved}
              projectId={projectId}
            />
          ))}
        </ul>
      )}

      {/* The workspace re-reads instances on a timer, so the rows follow the
          game connecting without a manual refresh. */}
      {instances.length > 0 && (
        <p className="panel-note">{t.projects.instances.note}</p>
      )}

      <p aria-live="polite" className="visually-hidden">{announcement}</p>

      {deleting !== null && (
        <DeleteGameInstanceDialog
          instanceId={deleting.id}
          instanceName={deleting.name}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            onRemoved(deleting.id)
            setDeleting(null)
            setAnnouncement(t.projects.instances.deletedAnnouncement)
          }}
          projectId={projectId}
        />
      )}
    </section>
  )
}

/**
 * One instance. Rename state lives here rather than in the panel so two rows
 * cannot share a half-typed draft, and so the row's own failure banner sits
 * next to the input that caused it.
 */
function GameInstanceRow({
  instance,
  onAnnounce,
  onDelete,
  onSaved,
  projectId,
}: {
  instance: GameInstance
  onAnnounce: (message: string) => void
  onDelete: (instance: GameInstance) => void
  onSaved: (instance: GameInstance) => void
  projectId: string
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(instance.name)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const nameId = useId()
  const { t } = useI18n()

  const dirty = name !== instance.name

  /** Leaving edit mode discards the draft, so nothing half-typed survives unseen. */
  function cancelEditing() {
    setName(instance.name)
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
      const updated = await updateGameInstance(projectId, instance.id, { name: name.trim() })
      onSaved(updated)
      setEditing(false)
      onAnnounce(t.projects.instances.savedAnnouncement)
    } catch (error: unknown) {
      if (error instanceof ProjectApiError) {
        setFieldErrors(error.fields)
        setFailure(Object.keys(error.fields).length > 0 ? null : apiErrorMessage(error, t))
      } else {
        setFailure(t.projects.instances.saveFailed)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="instance-row">
      {failure !== null && (
        <InlineError>
          <span aria-hidden="true">!</span>
          {failure}
        </InlineError>
      )}

      {editing ? (
        <form className="instance-edit" onSubmit={save} noValidate>
          <div className="field">
            <label className="field-label" htmlFor={nameId}>{t.projects.shared.nameLabel}</label>
            <TextInput
              aria-describedby={fieldErrors.name ? `${nameId}-error` : undefined}
              aria-invalid={fieldErrors.name ? true : undefined}
              disabled={saving}
              id={nameId}
              maxLength={INSTANCE_NAME_MAX_LENGTH}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
            {fieldErrors.name && (
              <p className="field-error" id={`${nameId}-error`}>{fieldErrors.name}</p>
            )}
          </div>
          <div className="form-actions">
            <Button
              variant="secondary" size="compact"
              disabled={saving}
              onClick={cancelEditing}
              type="button"
            >
              {t.projects.shared.cancel}
            </Button>
            <Button
              variant="primary" size="compact"
              disabled={!dirty || saving || name.trim().length === 0}
              type="submit"
            >
              {saving ? t.projects.shared.saving : t.projects.shared.save}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="instance-main">
            {/* The name is the way into the instance's live screen. The row's
                other controls act on the row itself, so the identity is what
                navigates. */}
            <Link
              className="instance-name"
              to={`/projects/${encodeURIComponent(projectId)}/instances/${encodeURIComponent(instance.id)}`}
            >
              {instance.name}
            </Link>
            <Badge>{describePlatform(instance.platform)}</Badge>
            <ConnectionState connected={instance.connected} />
          </div>

          <p className="instance-meta">
            {instance.lastConnectedAt.length === 0
              ? t.projects.instances.neverConnected
              : t.projects.instances.lastConnected(formatDate(instance.lastConnectedAt))}
            <span aria-hidden="true"> · </span>
            {t.projects.instances.registered(formatDate(instance.createdAt))}
          </p>

          <div className="instance-actions">
            <Button
              variant="secondary" size="compact"
              onClick={() => setEditing(true)}
              type="button"
            >
              {t.projects.shared.edit}
            </Button>
            <Button
              variant="danger-quiet" size="compact"
              onClick={() => onDelete(instance)}
              type="button"
            >
              {t.projects.instances.delete}
            </Button>
          </div>
        </>
      )}
    </li>
  )
}

/**
 * State is carried by the text, never by the dot. The dot is decorative and
 * hidden from assistive technology; the label is the whole message, so the row
 * still reads correctly with colour removed or unavailable.
 *
 * Both labels reserve the same width so a row does not reflow when a reload
 * flips the state.
 */
function ConnectionState({ connected }: { connected: boolean }) {
  const { t } = useI18n()

  return (
    <span className={connected ? 'instance-state instance-state--connected' : 'instance-state'}>
      <span
        aria-hidden="true"
        className={connected ? 'status-dot status-dot--connected' : 'status-dot'}
      />
      {connected ? t.projects.instances.connected : t.projects.instances.notConnected}
    </span>
  )
}
