import { PanelHeader } from '../design-system/primitives/Headers'
import { InlineError } from '../design-system/primitives/Feedback'
import { Button } from '../design-system/primitives/Button'
import { TextInput } from '../design-system/primitives/Fields'
import { useCallback, useEffect, useId, useState } from 'react'
import { ConfirmActionDialog } from '../design-system/primitives/ConfirmActionDialog'
import { InfoHint } from '../design-system/primitives/InfoHint'
import { useI18n } from '../i18n/useI18n'
import { ProviderLogo } from '../qa/launch/ProviderLogo'
import { CircleCheckIcon, CircleXIcon } from '../qa/qaModelIcons'
import { deleteLlmKey, listLlmKeys, llmKeyRefusal, registerLlmKey } from './llmKeyApi'
import { changeProjectLlmKey, listProjectLlmKeys, registerProjectLlmKey, type ProjectLlmKey } from './projectLlmKeyApi'
import {
  LLM_KEY_SERVICES,
  llmKeyServiceName,
  type LlmKey,
  type LlmKeyService,
} from './llmKeyTypes'

type KeysState = { status: 'loading' | 'ready' | 'error'; keys: ProjectLlmKey[] }

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
/**
 * @param note 머리 아래 한 줄. API 관리 화면은 키가 계정 단위라는 것을 여기 밝힌다(ARTEL-1379).
 */
export function LlmKeysPanel({
  note, projectId, canManage = true, onChange,
}: { note?: string; projectId?: string; canManage?: boolean; onChange?: () => void } = {}) {
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
  const [personalKeys, setPersonalKeys] = useState<LlmKey[]>([])
  const [linking, setLinking] = useState<LlmKeyService | null>(null)
  const removingLink = removing !== null && state.keys.some((key) => key.service === removing && key.linked)

  const read = useCallback((signal?: AbortSignal) =>
    projectId === undefined ? listLlmKeys(signal) : listProjectLlmKeys(projectId, signal), [projectId])

  useEffect(() => {
    if (projectId === undefined) return
    const controller = new AbortController()
    void listLlmKeys(controller.signal).then(setPersonalKeys).catch(() => {})
    return () => controller.abort()
  }, [projectId])

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
      if (projectId === undefined) {
        const saved = await registerLlmKey(service, apiKey)
        setState((current) => ({
          status: 'ready',
          keys: [...current.keys.filter((key) => key.service !== service), saved],
        }))
      } else {
        await registerProjectLlmKey(projectId, service, apiKey)
        reload()
        onChange?.()
      }
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
      <PanelHeader>
        <h2 id="llm-keys-title">
          {copy.title}
          {projectId === undefined && <InfoHint>{copy.intro}</InfoHint>}
        </h2>
        {note !== undefined && <p className="llm-key-scope">{note}</p>}
      </PanelHeader>

      {/* 받는 동안 진짜 줄과 같은 높이의 빈 줄 셋. 다 받아도 칸이 밀리지 않는다(케이스 표와 같은 방식). */}
      {state.status === 'loading' && (
        <>
          <p className="visually-hidden" role="status">{copy.loading}</p>
          <ul aria-hidden="true" className="llm-key-list llm-key-list--skeleton">
            {LLM_KEY_SERVICES.map((service) => (
              <li className="llm-key-row" key={service}>
                <div className="llm-key-summary">
                  <span className="llm-key-logo skeleton-block" />
                  <span className="llm-key-skel-text">
                    <span className="skeleton-line" style={{ width: '42%' }} />
                    <span className="skeleton-line skeleton-line--short" />
                  </span>
                  <span className="skeleton-line llm-key-skel-button" />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {state.status === 'error' && (
        <InlineError>
          <span aria-hidden="true">!</span>
          {copy.loadFailed}
          <Button variant="secondary" size="compact" onClick={reload} type="button">
            {copy.retry}
          </Button>
        </InlineError>
      )}

      {state.status === 'ready' && (
        <ul className="llm-key-list">
          {LLM_KEY_SERVICES.map((service) => {
            const key = state.keys.find((entry) => entry.service === service) ?? null
            const name = llmKeyServiceName(service)
            return (
              <li className="llm-key-row" key={service}>
                <div className="llm-key-summary">
                  {/* QA 실행 모델 고르기와 같은 제공사 로고다. OpenRouter 는 로고가 없어 첫 글자로 선다. */}
                  <span className="llm-key-logo">
                    <ProviderLogo provider={service} size={20} />
                  </span>
                  <div className="llm-key-name">
                    <strong>{name}</strong>
                    <span>{copy.reach[service]}</span>
                  </div>
                  {key !== null ? (
                    <span className="llm-key-status llm-key-status--ok">
                      <CircleCheckIcon size={14} />
                      {key.linked ? copy.linkedKey(key.keyHint) : copy.verified(key.keyHint)}
                    </span>
                  ) : (
                    <span className="llm-key-status llm-key-status--missing">
                      <CircleXIcon size={14} />
                      {copy.missing}
                    </span>
                  )}
                  {editing !== service && (
                    <div className="llm-key-actions">
                      {canManage && <Button
                        variant="secondary" size="compact"
                        onClick={() => startEditing(service)}
                        type="button"
                      >
                        {key !== null ? copy.replace : copy.register}
                      </Button>}
                      {projectId !== undefined && key === null && personalKeys.some((personal) => personal.service === service) && (
                        <Button variant="secondary" size="compact" onClick={() => setLinking(service)} type="button">
                          {copy.linkKey}
                        </Button>
                      )}
                      {key !== null && (canManage || key.ownLink) && (
                        <Button
                          variant="secondary" size="compact"
                          onClick={() => setRemoving(service)}
                          type="button"
                        >
                          {key.linked ? copy.unlinkKey : copy.remove}
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {editing === service && (
                  <form className="llm-key-form" onSubmit={(event) => void submit(event, service)} noValidate>
                    <div className="field">
                      <label className="field-label" htmlFor={inputId}>{copy.keyLabel(name)}</label>
                      <TextInput
                        aria-describedby={draftError !== null ? `${inputId}-error` : `${inputId}-hint`}
                        aria-invalid={draftError !== null || undefined}
                        autoComplete="off"
                        autoFocus
                        className="mono"
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
                      <Button
                        variant="secondary"
                        disabled={saving}
                        onClick={cancelEditing}
                        type="button"
                      >
                        {copy.cancel}
                      </Button>
                      <Button variant="primary" disabled={saving} type="submit">
                        {saving ? copy.checking : copy.submit}
                      </Button>
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
          body={removingLink ? copy.unlinkBody : projectId === undefined ? copy.removePersonalBody : copy.removeBody}
          cancelLabel={copy.cancel}
          confirmLabel={removingLink ? copy.unlinkKey : copy.remove}
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            const service = removing
            if (projectId === undefined) {
              await deleteLlmKey(service)
            } else {
              await changeProjectLlmKey(projectId, service, 'DELETE', !canManage)
              onChange?.()
            }
            setState((current) => ({
              status: 'ready',
              keys: current.keys.filter((key) => key.service !== service),
            }))
            setRemoving(null)
            setAnnouncement(copy.removedAnnouncement(llmKeyServiceName(service)))
          }}
          pendingLabel={copy.removing}
          title={removingLink ? copy.unlinkKey : copy.removeTitle(llmKeyServiceName(removing))}
          toFailureMessage={() => copy.removeFailed}
        />
      )}

      {linking !== null && projectId !== undefined && (
        <ConfirmActionDialog
          body={copy.linkBody}
          cancelLabel={copy.cancel}
          confirmLabel={copy.linkKey}
          onClose={() => setLinking(null)}
          onConfirm={async () => {
            await changeProjectLlmKey(projectId, linking, 'PUT', true)
            setLinking(null)
            reload()
            onChange?.()
          }}
          pendingLabel={copy.checking}
          title={copy.linkKey}
          toFailureMessage={() => copy.linkFailed}
        />
      )}

      <p aria-live="polite" className="visually-hidden">{announcement}</p>
    </section>
  )
}
