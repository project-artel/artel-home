import { useEffect, useId, useRef, useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { createGameInstance } from './gameApi'
import { useI18n } from '../i18n/useI18n'
import { apiErrorMessage } from './apiErrorMessage'
import { ProjectApiError } from './projectApi'
import { SdkInstallGuide } from './SdkInstallGuide'
import {
  DEFAULT_GAME_PLATFORM,
  GAME_PLATFORMS,
  INSTANCE_NAME_MAX_LENGTH,
  PLATFORM_LABELS,
  UNAVAILABLE_PLATFORM_LABELS,
  type GameInstance,
  type GameInstanceDraft,
} from './gameTypes'

const emptyDraft: GameInstanceDraft = { name: '', platform: DEFAULT_GAME_PLATFORM }

/**
 * Creates an instance, then replaces the form with the install guide in the
 * same dialog rather than opening a second one. The key only exists after the
 * create call, and handing the user a new modal at the exact moment they need
 * to read carefully and copy something is a worse place to put the guide than
 * where their attention already is.
 */
export function GameInstanceCreateDialog({
  onClose,
  onCreated,
  projectId,
}: {
  onClose: () => void
  onCreated: (instance: GameInstance) => void
  projectId: string
}) {
  const [draft, setDraft] = useState<GameInstanceDraft>(emptyDraft)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [created, setCreated] = useState<GameInstance | null>(null)
  const nameId = useId()
  const platformId = useId()
  const guideIntro = useRef<HTMLParagraphElement>(null)
  const { t } = useI18n()

  // `Dialog` moves focus inside only on mount. Swapping the form for the guide
  // destroys whatever had focus, which would drop focus to `<body>` and strand
  // a keyboard or screen-reader user outside the content they just asked for.
  useEffect(() => {
    if (created !== null) {
      guideIntro.current?.focus()
    }
  }, [created])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setFailure(null)
    setFieldErrors({})

    try {
      const instance = await createGameInstance(projectId, {
        name: draft.name.trim(),
        platform: draft.platform,
      })
      // Applied to the list immediately, so the row is already there when the
      // user closes the dialog, and the key survives even if they close it
      // from the scrim rather than the button.
      onCreated(instance)
      setCreated(instance)
    } catch (error: unknown) {
      if (error instanceof ProjectApiError) {
        setFieldErrors(error.fields)
        // With per-field messages shown inline, a banner repeating them would
        // just say the same thing twice.
        setFailure(Object.keys(error.fields).length > 0 ? null : apiErrorMessage(error, t))
      } else {
        setFailure(t.projects.instanceCreate.createFailed)
      }
      // No `finally`: a success leaves the dialog mounted on the guide view,
      // where a pending flag has nothing left to describe.
      setPending(false)
    }
  }

  if (created !== null) {
    return (
      <Dialog
        labelledBy="create-instance-title"
        onClose={onClose}
        title={t.projects.instances.guideTitle}
      >
        <p className="dialog-copy" ref={guideIntro} tabIndex={-1}>
          <strong>{created.name}</strong>
          {t.projects.instanceCreate.readySuffix}
        </p>

        <SdkInstallGuide instanceKey={created.instanceKey} />

        <div className="dialog-actions">
          <button className="button button--primary" onClick={onClose} type="button">
            {t.projects.shared.done}
          </button>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog
      labelledBy="create-instance-title"
      onClose={onClose}
      title={t.projects.instanceCreate.title}
    >
      <form onSubmit={submit} noValidate>
        {failure !== null && (
          <div className="inline-error" role="alert">
            <span aria-hidden="true">!</span>
            {failure}
          </div>
        )}

        <div className="project-form">
          <div className="field">
            <label className="field-label" htmlFor={platformId}>
              {t.projects.instanceCreate.platformLabel}{' '}
              <span className="field-required" aria-hidden="true">*</span>
            </label>
            <select
              className="field-input"
              disabled={pending}
              id={platformId}
              onChange={(event) =>
                // The option list is generated from the closed union below, so
                // the cast can only ever widen to a value the server accepts.
                setDraft({ ...draft, platform: event.target.value as GameInstanceDraft['platform'] })
              }
              value={draft.platform}
            >
              {GAME_PLATFORMS.map((platform) => (
                <option key={platform} value={platform}>{PLATFORM_LABELS[platform]}</option>
              ))}
              {/* Listed but unselectable, with the reason in the label. A bare
                  disabled option reads as broken; omitting them entirely makes
                  the user wonder whether they looked in the wrong place. */}
              {Object.entries(UNAVAILABLE_PLATFORM_LABELS).map(([platform, label]) => (
                <option disabled key={platform} value={platform}>
                  {t.projects.instanceCreate.unavailablePlatform(label)}
                </option>
              ))}
            </select>
            {fieldErrors.platform && <p className="field-error">{fieldErrors.platform}</p>}
          </div>

          <div className="field">
            <label className="field-label" htmlFor={nameId}>
              {t.projects.shared.nameLabel}{' '}
              <span className="field-required" aria-hidden="true">*</span>
            </label>
            <input
              aria-describedby={fieldErrors.name ? `${nameId}-error` : undefined}
              aria-invalid={fieldErrors.name ? true : undefined}
              className="field-input"
              disabled={pending}
              id={nameId}
              maxLength={INSTANCE_NAME_MAX_LENGTH}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              required
              value={draft.name}
            />
            <p className="field-hint">{t.projects.instanceCreate.nameHint}</p>
            {fieldErrors.name && (
              <p className="field-error" id={`${nameId}-error`}>{fieldErrors.name}</p>
            )}
          </div>

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
              {pending ? t.projects.shared.creating : t.projects.instanceCreate.create}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  )
}
