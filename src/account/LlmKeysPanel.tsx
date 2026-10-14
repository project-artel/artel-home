import { useCallback, useEffect, useId, useState } from 'react'
import { ConfirmActionDialog } from '../design-system/primitives/ConfirmActionDialog'
import { useI18n } from '../i18n/useI18n'
import { CircleCheckIcon, CircleXIcon } from '../qa/qaModelIcons'
import { deleteLlmKey, listLlmKeys, llmKeyRefusal, registerLlmKey } from './llmKeyApi'
import {
  LLM_KEY_SERVICES,
  llmKeyServiceName,
  type LlmKey,
  type LlmKeyService,
} from './llmKeyTypes'

type KeysState = { status: 'loading' | 'ready' | 'error'; keys: LlmKey[] }

/**
 * The user's own LLM API keys — one row per service the QA model picker has a
 * tab for (Claude, GPT, OpenRouter), whether or not a key is registered, so the
 * page says what can be added and not only what was.
 *
 * Registering is one step from the user's side and two on the server's: the key
 * is sent, the server calls the service with it once, and stores it only if that
 * call worked. So a refusal is shown under the field the key was typed into,
 * with the provider's reason, and the draft stays for a retry. A key that could
 * not be checked at all (`unverified`) is not called wrong — the provider was
 * not reached.
 *
 * The key never comes back from the server. What a row shows is the masked hint
 * the server returns, the same one the model picker shows.
 */
export function LlmKeysPanel() {
  const { t } = useI18n()
  const copy = t.account.llmKeys
  const inputId = useId()

  const [state, setState] = useState<KeysState>({ status: 'loading', keys: [] })
  const [editing, setEditing] = useState<LlmKeyService | null>(null)
  const [draft, setDraft] = useState('')
  const [draftError, setDraftError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<LlmKeyService | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const read = useCallback((signal?: AbortSignal) => listLlmKeys(signal), [])

  useEffect(() => {
    const controller = new AbortController()
    read(controller.signal)
      .then((keys) => setState({ status: 'ready', keys }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({ status: 'error', keys: [] })
      })
    return () => controller.abort()
  }, [read])

  function reload() {
    setState({ status: 'loading', keys: [] })
    read()
      .then((keys) => setState({ status: 'ready', keys }))
      .catch(() => setState({ status: 'error', keys: [] }))
  }

  function startEditing(service: LlmKeyService) {
    setEditing(service)
    setDraft('')
    setDraftError(null)
  }

  /** Discards the draft, so a pasted key does not survive unseen. */
  function cancelEditing() {
    setEditing(null)
    setDraft('')
    setDraftError(null)
  }

  async function submit(event: React.FormEvent, service: LlmKeyService) {
    event.preventDefault()
    const apiKey = draft.trim()
    if (apiKey.length === 0) {
      setDraftError(copy.keyRequired)
      return
    }

    setDraftError(null)
    setSaving(true)
    try {
      const saved = await registerLlmKey(service, apiKey)
      setState((current) => ({
        status: 'ready',
        keys: [...current.keys.filter((key) => key.service !== service), saved],
      }))
      setEditing(null)
      setDraft('')
      setAnnouncement(copy.savedAnnouncement(llmKeyServiceName(service)))
    } catch (error) {
      setDraftError(copy.refused[llmKeyRefusal(error)])
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel" aria-labelledby="llm-keys-title">
      <header className="panel-header">
        <h2 id="llm-keys-title">{copy.title}</h2>
      </header>
      <p className="section-intro">{copy.intro}</p>

      {state.status === 'loading' && <p className="panel-empty">{copy.loading}</p>}

      {state.status === 'error' && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>
          {copy.loadFailed}
          <button className="button button--secondary button--compact" onClick={reload} type="button">
            {copy.retry}
          </button>
        </div>
      )}

      {state.status === 'ready' && (
        <ul className="llm-key-list">
          {LLM_KEY_SERVICES.map((service) => {
            const key = state.keys.find((entry) => entry.service === service) ?? null
            const name = llmKeyServiceName(service)
            return (
              <li className="llm-key-row" key={service}>
                <div className="llm-key-summary">
                  <div className="llm-key-name">
                    <strong>{name}</strong>
                    <span>{copy.reach[service]}</span>
                  </div>
                  {key !== null ? (
                    <span className="llm-key-status llm-key-status--ok">
                      <CircleCheckIcon size={14} />
                      {copy.verified(key.keyHint)}
                    </span>
                  ) : (
                    <span className="llm-key-status llm-key-status--missing">
                      <CircleXIcon size={14} />
                      {copy.missing}
                    </span>
                  )}
                  {editing !== service && (
                    <div className="llm-key-actions">
                      <button
                        className="button button--secondary button--compact"
                        onClick={() => startEditing(service)}
                        type="button"
                      >
                        {key !== null ? copy.replace : copy.register}
                      </button>
                      {key !== null && (
                        <button
                          className="button button--secondary button--compact"
                          onClick={() => setRemoving(service)}
                          type="button"
                        >
                          {copy.remove}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {editing === service && (
                  <form className="llm-key-form" onSubmit={(event) => void submit(event, service)} noValidate>
                    <div className="field">
                      <label className="field-label" htmlFor={inputId}>{copy.keyLabel(name)}</label>
                      <input
                        aria-describedby={draftError !== null ? `${inputId}-error` : `${inputId}-hint`}
                        aria-invalid={draftError !== null || undefined}
                        autoComplete="off"
                        autoFocus
                        className="field-input mono"
                        disabled={saving}
                        id={inputId}
                        onChange={(event) => {
                          setDraft(event.target.value)
                          setDraftError(null)
                        }}
                        placeholder={copy.keyPlaceholder}
                        spellCheck={false}
                        type="password"
                        value={draft}
                      />
                      {draftError !== null ? (
                        <p className="field-error" id={`${inputId}-error`}>{draftError}</p>
                      ) : (
                        <p className="field-hint" id={`${inputId}-hint`}>{copy.keyHint}</p>
                      )}
                    </div>
                    <div className="form-actions">
                      <button
                        className="button button--secondary"
                        disabled={saving}
                        onClick={cancelEditing}
                        type="button"
                      >
                        {copy.cancel}
                      </button>
                      <button className="button button--primary" disabled={saving} type="submit">
                        {saving ? copy.checking : copy.submit}
                      </button>
                    </div>
                  </form>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {removing !== null && (
        <ConfirmActionDialog
          body={copy.removeBody}
          cancelLabel={copy.cancel}
          confirmLabel={copy.remove}
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            const service = removing
            await deleteLlmKey(service)
            setState((current) => ({
              status: 'ready',
              keys: current.keys.filter((key) => key.service !== service),
            }))
            setRemoving(null)
            setAnnouncement(copy.removedAnnouncement(llmKeyServiceName(service)))
          }}
          pendingLabel={copy.removing}
          title={copy.removeTitle(llmKeyServiceName(removing))}
          toFailureMessage={() => copy.removeFailed}
        />
      )}

      <p aria-live="polite" className="visually-hidden">{announcement}</p>
    </section>
  )
}
