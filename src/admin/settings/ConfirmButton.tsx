import { useState } from 'react'
import { useI18n } from '../../i18n/useI18n'

/**
 * A destructive action that needs a second click. Pressing the first button
 * swaps it for a labelled confirm and a cancel; nothing is sent until the
 * confirm is pressed.
 */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  disabled = false,
}: {
  label: string
  confirmLabel: string
  onConfirm: () => void
  disabled?: boolean
}) {
  const { t } = useI18n()
  const [asking, setAsking] = useState(false)

  if (!asking) {
    return (
      <button type="button" className="control" disabled={disabled} onClick={() => setAsking(true)}>
        {label}
      </button>
    )
  }

  return (
    <span className="adm-confirm" role="group" aria-label={t.adminSettings.common.confirm(label)}>
      <button
        type="button"
        className="control adm-danger"
        autoFocus
        onClick={() => {
          setAsking(false)
          onConfirm()
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className="control" onClick={() => setAsking(false)}>
        {t.adminSettings.common.cancel}
      </button>
    </span>
  )
}
