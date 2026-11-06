import { useEffect, useId, useRef, useState } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { InfoHint } from '../../design-system/primitives/InfoHint'
import {
  getTelemetryPreview,
  getTelemetrySettings,
  putTelemetryConsent,
  type TelemetrySettings,
} from './settingsApi'
import { useAdminFailure } from './useAdminRequest'
import { TelemetryContents } from '../../telemetry/TelemetryContents'

type Preview = { state: 'idle' } | { state: 'loading' } | { state: 'failed' } | { state: 'ready'; json: string }

/**
 * 사용 통계 전송 설정: toggle, 마지막으로 보낸 날짜, 다음 report 의 JSON 미리 보기.
 * 서버에 telemetry endpoint 가 없으면(`available: false`) 아무것도 그리지 않으므로 hosted 서버에는 보이지 않는다.
 */
export function TelemetrySection() {
  const { t } = useI18n()
  const copy = t.adminSettings.telemetry
  const [settings, setSettings] = useState<TelemetrySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirmingOff, setConfirmingOff] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [preview, setPreview] = useState<Preview>({ state: 'idle' })
  const [announcement, setAnnouncement] = useState('')
  const { error, setError, fail } = useAdminFailure()
  const toggleId = useId()
  const previewId = useId()

  useEffect(() => {
    const controller = new AbortController()
    getTelemetrySettings(controller.signal)
      .then(setSettings)
      .catch((cause) => {
        if (!controller.signal.aborted) fail(cause)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [fail])

  const previewController = useRef<AbortController | null>(null)
  useEffect(() => () => previewController.current?.abort(), [])

  function loadPreview() {
    previewController.current?.abort()
    const controller = new AbortController()
    previewController.current = controller
    setPreview({ state: 'loading' })
    getTelemetryPreview(controller.signal)
      .then((json) => setPreview({ state: 'ready', json }))
      .catch(() => {
        if (!controller.signal.aborted) setPreview({ state: 'failed' })
      })
  }

  async function save(enabled: boolean, deleteSentData?: boolean) {
    setSaving(true)
    setError(null)
    try {
      setSettings(await putTelemetryConsent(enabled, deleteSentData))
      setConfirmingOff(false)
      // An open preview shows the report for the old consent; load it again.
      if (previewOpen) loadPreview()
      setAnnouncement(copy.saved)
    } catch (cause) {
      fail(cause)
    } finally {
      setSaving(false)
    }
  }

  if (settings !== null && !settings.available) return null

  return (
    <section aria-labelledby="adm-telemetry-title">
      <div className="section__head">
        <h2 className="section__title" id="adm-telemetry-title">
          {copy.title}
          <InfoHint>{copy.hint}</InfoHint>
        </h2>
      </div>
      <p className="section__note section__note--block">{copy.hint}</p>
      <TelemetryContents />

      {error !== null && (
        <p className="notice notice--critical" role="alert">
          {error}
        </p>
      )}

      {settings === null ? (
        error === null && <p className="notice">{loading ? copy.loading : copy.failed}</p>
      ) : (
        <>
          <div className="adm-form">
            <label className="field-checkbox-label" htmlFor={toggleId}>
              <input
                id={toggleId}
                type="checkbox"
                checked={settings.enabled}
                disabled={saving || confirmingOff}
                onChange={(event) => {
                  if (event.target.checked) void save(true)
                  else setConfirmingOff(true)
                }}
              />
              <span>{copy.toggle}</span>
            </label>
            {saving && <span className="section__note">{t.adminSettings.common.saving}</span>}
          </div>

          {confirmingOff && (
            <div className="adm-warning" role="group" aria-label={copy.turnOffTitle}>
              <p>
                <strong>! {copy.turnOffTitle}</strong> {copy.turnOffBody}
              </p>
              <span className="adm-actions">
                <button type="button" className="control" disabled={saving} onClick={() => void save(false, false)}>
                  {copy.turnOffKeep}
                </button>
                <button
                  type="button"
                  className="control adm-danger"
                  disabled={saving}
                  onClick={() => void save(false, true)}
                >
                  {copy.turnOffDelete}
                </button>
                <button type="button" className="control" disabled={saving} onClick={() => setConfirmingOff(false)}>
                  {t.adminSettings.common.cancel}
                </button>
              </span>
            </div>
          )}

          <dl className="adm-facts">
            <div>
              <dt>{copy.lastSentLabel}</dt>
              <dd>{settings.lastSentDate ?? copy.notSentYet}</dd>
            </div>
          </dl>

          <div className="adm-preview">
            <button
              type="button"
              className="control"
              aria-expanded={previewOpen}
              aria-controls={previewId}
              onClick={() => {
                if (!previewOpen) loadPreview()
                setPreviewOpen(!previewOpen)
              }}
            >
              {previewOpen ? copy.previewHide : copy.previewToggle}
            </button>
            {previewOpen && (
              <div id={previewId}>
                <p className="section__note section__note--block">{copy.previewHint}</p>
                {preview.state === 'loading' && <p className="notice">{copy.previewLoading}</p>}
                {preview.state === 'failed' && (
                  <p className="notice notice--critical" role="alert">
                    {copy.previewFailed}
                  </p>
                )}
                {preview.state === 'ready' && (
                  // Scrollable region must be focusable for keyboard users.
                  <pre className="adm-preview__body" tabIndex={0}>
                    {preview.json}
                  </pre>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <p className="adm-visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </section>
  )
}
