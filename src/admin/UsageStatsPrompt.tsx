import { useEffect, useId, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { TelemetryContents } from '../telemetry/TelemetryContents'
import { getTelemetrySettings, putTelemetryConsent } from './settings/settingsApi'
import { shouldAskForUsageStats } from './settings/shouldAskForUsageStats'
import './usageStatsPrompt.css'

/**
 * admin 이 어느 `/admin` 화면이든 처음 열었을 때 사용 통계를 보낼지 한 번 묻는 modal.
 * 설정 탭의 항목은 스스로 찾아오는 사람이 없어서 여기서 묻는다.
 *
 * Escape 나 닫기로 고르지 않고 벗어나면 저장하지 않으므로 다음 방문에 다시 묻는다.
 * 설정을 불러오지 못하면 아무것도 그리지 않는다.
 */
export function UsageStatsPrompt() {
  const { t } = useI18n()
  const copy = t.telemetry.prompt
  const [asking, setAsking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const sendRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  useEffect(() => {
    const controller = new AbortController()
    getTelemetrySettings(controller.signal)
      .then((settings) => setAsking(shouldAskForUsageStats(settings)))
      .catch(() => {})
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current
    if (asking && dialog !== null && !dialog.open) {
      dialog.showModal()
      // showModal() 은 첫 focus 대상인 '보내는 값 보기' 에 focus 를 준다. 그 빨간 테두리가 오류처럼 보여서 답할 버튼으로 옮긴다.
      sendRef.current?.focus()
    }
  }, [asking])

  async function choose(enabled: boolean) {
    setSaving(true)
    setFailed(false)
    try {
      await putTelemetryConsent(enabled)
      setAsking(false)
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  if (!asking) return null

  return (
    <dialog
      ref={dialogRef}
      className="usage-stats-prompt"
      aria-labelledby={titleId}
      // Escape 는 저장 없이 닫는다.
      onClose={() => setAsking(false)}
    >
      <h2 className="dialog-title" id={titleId}>
        {copy.title}
      </h2>
      <p className="dialog-copy">{copy.body}</p>
      <TelemetryContents />
      {failed && (
        <div className="inline-error usage-stats-prompt__error" role="alert">
          <span aria-hidden="true">!</span>
          {copy.saveFailed}
        </div>
      )}
      <div className="dialog-actions">
        <button className="button button--secondary" type="button" disabled={saving} onClick={() => void choose(false)}>
          {copy.dontSend}
        </button>
        <button
          ref={sendRef}
          className="button button--primary"
          type="button"
          disabled={saving}
          onClick={() => void choose(true)}
        >
          {copy.send}
        </button>
      </div>
    </dialog>
  )
}
