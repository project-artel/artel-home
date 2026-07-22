import { useId, useState } from 'react'
import { formatDate, PLACEHOLDER } from './formatters'
import { updateGameBuild } from './gameApi'
import { ProjectApiError } from './projectApi'
import {
  BUILD_LABEL_MAX_LENGTH,
  BUILD_NOTES_MAX_LENGTH,
  type GameBuild,
  type GameBuildPatch,
} from './gameTypes'

/**
 * The versions the SDK has reported for this project.
 *
 * Builds are never created or deleted from here: a row appears when a running
 * game registers its version, and deleting one would only make it reappear on
 * the next registration. The panel exists so a version can be given a human
 * label and some notes.
 *
 * A build's detail is an expanded row, not a route. There is no nested-layout
 * precedent in this app — `AppShell`'s `Outlet` is the whole workspace — and a
 * route would add a second loading/missing/error triad for data `useProject`
 * already holds.
 */
export function GameBuildPanel({
  builds,
  onSaved,
  projectId,
}: {
  builds: GameBuild[]
  onSaved: (build: GameBuild) => void
  projectId: string
}) {
  const [announcement, setAnnouncement] = useState('')

  return (
    <section className="panel" aria-labelledby="builds-title">
      <header className="panel-header">
        <h2 id="builds-title">Game builds</h2>
      </header>

      {builds.length === 0 ? (
        <p className="panel-empty">
          No build has reported in yet. A row appears here the first time a game
          runs with a connected instance, using the version from Unity&apos;s
          Player Settings.
        </p>
      ) : (
        <ul className="build-list">
          {builds.map((build) => (
            <GameBuildRow
              build={build}
              key={build.id}
              onAnnounce={setAnnouncement}
              onSaved={onSaved}
              projectId={projectId}
            />
          ))}
        </ul>
      )}

      <p aria-live="polite" className="visually-hidden">{announcement}</p>
    </section>
  )
}

function toPatch(build: GameBuild): GameBuildPatch {
  return { label: build.label ?? '', notes: build.notes ?? '' }
}

/**
 * One build: a collapsed summary line, an expandable read-mode definition list,
 * and an edit form behind an `Edit` button — the same read-first shape as the
 * Information panel, for the same reason. Only `label` and `notes` are in the
 * form; `version` is observed from Player Settings and is shown as a value with
 * no control attached to it.
 */
function GameBuildRow({
  build,
  onAnnounce,
  onSaved,
  projectId,
}: {
  build: GameBuild
  onAnnounce: (message: string) => void
  onSaved: (build: GameBuild) => void
  projectId: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<GameBuildPatch>(() => toPatch(build))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [syncedFrom, setSyncedFrom] = useState(build)
  const labelId = useId()
  const notesId = useId()

  // A save replaces the server copy; the form follows it during render so the
  // inputs never show a value the server has already superseded. Adjusting
  // state while rendering is what React prefers over an effect that would paint
  // the stale value first.
  if (syncedFrom !== build) {
    setSyncedFrom(build)
    setDraft(toPatch(build))
  }

  const saved = toPatch(build)
  const dirty = draft.label !== saved.label || draft.notes !== saved.notes
  const hasLabel = saved.label.length > 0
  const hasNotes = saved.notes.length > 0

  function cancelEditing() {
    setDraft(toPatch(build))
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
      // Both fields are sent as trimmed strings: per the contract an empty
      // string clears a nullable value, which is what an emptied input means.
      const updated = await updateGameBuild(projectId, build.id, {
        label: draft.label.trim(),
        notes: draft.notes.trim(),
      })
      onSaved(updated)
      setEditing(false)
      onAnnounce('Build updated.')
    } catch (error: unknown) {
      if (error instanceof ProjectApiError) {
        setFieldErrors(error.fields)
        setFailure(Object.keys(error.fields).length > 0 ? null : error.message)
      } else {
        setFailure('The build could not be saved. Please try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="build-row">
      <button
        aria-expanded={expanded}
        className="build-summary"
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        <span className="mono build-version">{build.version}</span>
        {/* An empty string and `null` both mean "no label"; the server clears
            with `''`, so treating only `null` as empty would print a blank gap. */}
        <span className={hasLabel ? 'build-label' : 'build-label build-label--empty'}>
          {hasLabel ? build.label : PLACEHOLDER}
        </span>
        <span className="build-created">{formatDate(build.createdAt)}</span>
        <span aria-hidden="true" className="build-marker">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div className="build-detail">
          {failure !== null && (
            <div className="inline-error" role="alert">
              <span aria-hidden="true">!</span>
              {failure}
            </div>
          )}

          {editing ? (
            <form onSubmit={save} noValidate>
              <div className="project-form">
                {/* Read-only, and deliberately not an input: the next
                    registration overwrites it from Player Settings, so an
                    editable version field would lose whatever was typed. */}
                <p className="build-version-note">
                  Version <span className="mono">{build.version}</span> is read from Unity&apos;s
                  Player Settings and cannot be changed here.
                </p>

                <div className="field">
                  <label className="field-label" htmlFor={labelId}>Label</label>
                  <input
                    aria-describedby={fieldErrors.label ? `${labelId}-error` : undefined}
                    aria-invalid={fieldErrors.label ? true : undefined}
                    className="field-input"
                    disabled={saving}
                    id={labelId}
                    maxLength={BUILD_LABEL_MAX_LENGTH}
                    onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                    value={draft.label}
                  />
                  <p className="field-hint">Clearing this field removes the label.</p>
                  {fieldErrors.label && (
                    <p className="field-error" id={`${labelId}-error`}>{fieldErrors.label}</p>
                  )}
                </div>

                <div className="field">
                  <label className="field-label" htmlFor={notesId}>Notes</label>
                  <textarea
                    aria-describedby={fieldErrors.notes ? `${notesId}-error` : undefined}
                    aria-invalid={fieldErrors.notes ? true : undefined}
                    className="field-input field-input--multiline"
                    disabled={saving}
                    id={notesId}
                    maxLength={BUILD_NOTES_MAX_LENGTH}
                    onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                    rows={3}
                    value={draft.notes}
                  />
                  <p className="field-hint">Clearing this field removes the notes.</p>
                  {fieldErrors.notes && (
                    <p className="field-error" id={`${notesId}-error`}>{fieldErrors.notes}</p>
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
                    disabled={!dirty || saving}
                    type="submit"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <>
              <dl className="detail-fields">
                <dt>Version</dt>
                <dd className="mono">{build.version}</dd>

                <dt>Label</dt>
                <dd>
                  {hasLabel ? build.label : <span className="detail-empty">No label</span>}
                </dd>

                <dt>Notes</dt>
                <dd>
                  {hasNotes ? build.notes : <span className="detail-empty">No notes</span>}
                </dd>

                <dt>First reported</dt>
                <dd>{formatDate(build.createdAt)}</dd>

                <dt>Updated</dt>
                <dd>{formatDate(build.updatedAt)}</dd>
              </dl>

              <div className="form-actions">
                <button
                  className="button button--secondary button--compact"
                  onClick={() => setEditing(true)}
                  type="button"
                >
                  Edit
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </li>
  )
}
