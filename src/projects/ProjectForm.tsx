import { useId, type ReactNode } from 'react'
import {
  DESCRIPTION_MAX_LENGTH,
  GENRES,
  GENRE_LABELS,
  NAME_MAX_LENGTH,
  type Genre,
  type ProjectDraft,
} from './projectTypes'

/**
 * The name/description/genre inputs, shared by the create dialog and the detail
 * page so the two can never drift apart on limits or labels.
 *
 * `fieldErrors` carries the server's per-field messages from a `400`. Client
 * validation is only `required` and `maxLength` here — the server is the
 * authority, and duplicating its rules in full would guarantee they diverge.
 */
export function ProjectForm({
  draft,
  onChange,
  fieldErrors,
  disabled,
  children,
}: {
  draft: ProjectDraft
  onChange: (draft: ProjectDraft) => void
  fieldErrors: Record<string, string>
  disabled: boolean
  children: ReactNode
}) {
  const nameId = useId()
  const descriptionId = useId()
  const genreId = useId()

  return (
    <div className="project-form">
      <div className="field">
        <label className="field-label" htmlFor={nameId}>
          Name <span className="field-required" aria-hidden="true">*</span>
        </label>
        <input
          aria-describedby={fieldErrors.name ? `${nameId}-error` : undefined}
          aria-invalid={fieldErrors.name ? true : undefined}
          className="field-input"
          disabled={disabled}
          id={nameId}
          maxLength={NAME_MAX_LENGTH}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          required
          value={draft.name}
        />
        {fieldErrors.name && (
          <p className="field-error" id={`${nameId}-error`}>{fieldErrors.name}</p>
        )}
      </div>

      <div className="field">
        <label className="field-label" htmlFor={genreId}>Genre</label>
        <select
          className="field-input"
          disabled={disabled}
          id={genreId}
          onChange={(event) => onChange({ ...draft, genre: event.target.value as Genre })}
          value={draft.genre}
        >
          {GENRES.map((genre) => (
            <option key={genre} value={genre}>{GENRE_LABELS[genre]}</option>
          ))}
        </select>
        {fieldErrors.genre && <p className="field-error">{fieldErrors.genre}</p>}
      </div>

      <div className="field">
        <label className="field-label" htmlFor={descriptionId}>Description</label>
        <textarea
          className="field-input field-input--multiline"
          disabled={disabled}
          id={descriptionId}
          maxLength={DESCRIPTION_MAX_LENGTH}
          onChange={(event) => onChange({ ...draft, description: event.target.value })}
          rows={4}
          value={draft.description}
        />
        <p className="field-hint">
          Clearing this field removes the description.
        </p>
        {fieldErrors.description && <p className="field-error">{fieldErrors.description}</p>}
      </div>

      {children}
    </div>
  )
}
