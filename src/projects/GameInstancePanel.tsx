import { useId, useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { CopyButton } from './CopyButton'
import { DeleteGameInstanceDialog } from './DeleteGameInstanceDialog'
import { formatDate } from './formatters'
import { GameInstanceCreateDialog } from './GameInstanceCreateDialog'
import { updateGameInstance } from './gameApi'
import { ProjectApiError } from './projectApi'
import { SdkInstallGuide } from './SdkInstallGuide'
import {
  describePlatform,
  INSTANCE_NAME_MAX_LENGTH,
  type GameInstance,
} from './gameTypes'

/**
 * The SDK installations belonging to this project.
 *
 * Rendered as dense rows rather than cards: a row is a name, a key, and a
 * status line, and a card grid would spend most of a 1440px viewport on
 * padding. There is no role gate — every project member may add, rename, and
 * delete instances, matching the document panel rather than the owner-gated
 * project delete.
 *
 * Loading and load-failure are not handled here. `useProject` fetches all four
 * legs together so the whole screen has one status, one message, and one Retry;
 * the failure state inside this panel is for mutations the user just triggered.
 */
export function GameInstancePanel({
  instances,
  onCreated,
  onRefresh,
  onRemoved,
  onSaved,
  projectId,
}: {
  instances: GameInstance[]
  onCreated: (instance: GameInstance) => void
  onRefresh: () => Promise<void>
  onRemoved: (instanceId: string) => void
  onSaved: (instance: GameInstance) => void
  projectId: string
}) {
  const [announcement, setAnnouncement] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<GameInstance | null>(null)
  const [guideFor, setGuideFor] = useState<GameInstance | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshFailure, setRefreshFailure] = useState<string | null>(null)

  /**
   * The one question this panel cannot answer on its own is "has the game
   * connected yet". Nothing pushes that, so the user needs a way to ask again
   * without reloading the page and losing anything else in progress.
   */
  function refresh() {
    setRefreshing(true)
    setRefreshFailure(null)
    onRefresh()
      .then(() => setAnnouncement('Instances and builds refreshed.'))
      .catch((error: unknown) =>
        setRefreshFailure(
          error instanceof ProjectApiError
            ? error.message
            : 'The instance list could not be refreshed.',
        ),
      )
      .finally(() => setRefreshing(false))
  }

  return (
    <section className="panel" aria-labelledby="instances-title">
      <header className="panel-header panel-header--split">
        <h2 id="instances-title">Game instances</h2>
        <div className="panel-header-actions">
          <button
            className="button button--secondary button--compact"
            disabled={refreshing}
            onClick={refresh}
            type="button"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            className="button button--primary button--compact"
            onClick={() => setCreating(true)}
            type="button"
          >
            인스턴스 추가
          </button>
        </div>
      </header>

      {refreshFailure !== null && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>
          {refreshFailure}
        </div>
      )}

      {instances.length === 0 ? (
        <div className="panel-empty-block">
          <p className="panel-empty">
            An instance is one installation of the Artel SDK — usually one
            machine running one build. Add one to get an instance key, then
            paste that key into Unity to connect the game.
          </p>
          <button
            className="button button--secondary button--compact"
            onClick={() => setCreating(true)}
            type="button"
          >
            인스턴스 추가
          </button>
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
              onShowGuide={setGuideFor}
              projectId={projectId}
            />
          ))}
        </ul>
      )}

      {/* Nothing polls the server, so the state on each row is whatever the
          last read said. Saying so is cheaper than a live indicator that is
          quietly wrong. */}
      {instances.length > 0 && (
        <p className="panel-note">
          Connection state is from the last read. Refresh re-reads instances and
          builds — both change when a game starts.
        </p>
      )}

      <p aria-live="polite" className="visually-hidden">{announcement}</p>

      {creating && (
        <GameInstanceCreateDialog
          onClose={() => setCreating(false)}
          onCreated={(instance) => {
            onCreated(instance)
            setAnnouncement('Instance added.')
          }}
          projectId={projectId}
        />
      )}

      {deleting !== null && (
        <DeleteGameInstanceDialog
          instanceId={deleting.id}
          instanceName={deleting.name}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            onRemoved(deleting.id)
            setDeleting(null)
            setAnnouncement('Instance deleted.')
          }}
          projectId={projectId}
        />
      )}

      {guideFor !== null && (
        <Dialog
          labelledBy="instance-guide-title"
          onClose={() => setGuideFor(null)}
          title="Set up the SDK"
        >
          <p className="dialog-copy">Steps for <strong>{guideFor.name}</strong>.</p>
          <SdkInstallGuide instanceKey={guideFor.instanceKey} />
          <div className="dialog-actions">
            <button
              className="button button--secondary"
              onClick={() => setGuideFor(null)}
              type="button"
            >
              Close
            </button>
          </div>
        </Dialog>
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
  onShowGuide,
  projectId,
}: {
  instance: GameInstance
  onAnnounce: (message: string) => void
  onDelete: (instance: GameInstance) => void
  onSaved: (instance: GameInstance) => void
  onShowGuide: (instance: GameInstance) => void
  projectId: string
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(instance.name)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const nameId = useId()

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
      onAnnounce('Instance saved.')
    } catch (error: unknown) {
      if (error instanceof ProjectApiError) {
        setFieldErrors(error.fields)
        setFailure(Object.keys(error.fields).length > 0 ? null : error.message)
      } else {
        setFailure('The instance could not be saved. Please try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="instance-row">
      {failure !== null && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>
          {failure}
        </div>
      )}

      {editing ? (
        <form className="instance-edit" onSubmit={save} noValidate>
          <div className="field">
            <label className="field-label" htmlFor={nameId}>Name</label>
            <input
              aria-describedby={fieldErrors.name ? `${nameId}-error` : undefined}
              aria-invalid={fieldErrors.name ? true : undefined}
              className="field-input"
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
            <button
              className="button button--secondary button--compact"
              disabled={saving}
              onClick={cancelEditing}
              type="button"
            >
              Cancel
            </button>
            <button
              className="button button--primary button--compact"
              disabled={!dirty || saving || name.trim().length === 0}
              type="submit"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="instance-main">
            <span className="instance-name">{instance.name}</span>
            <span className="badge">{describePlatform(instance.platform)}</span>
            <ConnectionState connected={instance.connected} />
          </div>

          <div className="copy-line">
            <code className="mono copy-value">{instance.instanceKey}</code>
            <CopyButton
              copiedMessage="Key copied."
              label="Copy key"
              onResult={onAnnounce}
              text={instance.instanceKey}
            />
          </div>

          <p className="instance-meta">
            {instance.lastConnectedAt.length === 0
              ? 'Never connected'
              : `Last connected ${formatDate(instance.lastConnectedAt)}`}
            <span aria-hidden="true"> · </span>
            Added {formatDate(instance.createdAt)}
          </p>

          <div className="instance-actions">
            <button
              className="button button--secondary button--compact"
              onClick={() => setEditing(true)}
              type="button"
            >
              Edit
            </button>
            <button
              className="button button--secondary button--compact"
              onClick={() => onShowGuide(instance)}
              type="button"
            >
              설치 안내
            </button>
            <button
              className="button button--danger-quiet button--compact"
              onClick={() => onDelete(instance)}
              type="button"
            >
              Delete
            </button>
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
  return (
    <span className={connected ? 'instance-state instance-state--connected' : 'instance-state'}>
      <span
        aria-hidden="true"
        className={connected ? 'status-dot status-dot--connected' : 'status-dot'}
      />
      {connected ? '연결됨' : '연결 안 됨'}
    </span>
  )
}
