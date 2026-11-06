import { useState } from 'react'
import { useI18n } from '../../i18n/useI18n'

/**
 * Shows a temporary password once. The server never returns it again, so the
 * notice stays until the administrator confirms they stored it; closing it by
 * accident would leave the account with a password nobody knows.
 *
 * The state color is paired with a text label and a mark, never color alone
 * (DESIGN.md).
 */
export function TemporaryPasswordNotice({
  heading,
  password,
  onDismiss,
}: {
  /** Names whose password this is, for example the account email. */
  heading: string
  password: string
  onDismiss: () => void
}) {
  const { t } = useI18n()
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function copy() {
    try {
      await navigator.clipboard.writeText(password)
      setCopyState('copied')
    } catch {
      // Clipboard access needs a secure context; the password stays selectable below.
      setCopyState('failed')
    }
  }

  return (
    <section className="adm-secret" role="alert" aria-labelledby="adm-secret-title">
      <h3 className="adm-secret__title" id="adm-secret-title">
        <span aria-hidden="true">! </span>
        {t.adminSettings.users.temporaryPassword(heading)}
      </h3>
      <p className="adm-secret__warning">
        {t.adminSettings.users.passwordWarning}
      </p>
      <div className="adm-secret__row">
        <code className="adm-secret__value" aria-label={t.adminSettings.users.temporaryPasswordLabel}>
          {password}
        </code>
        <button type="button" className="control control--action" onClick={copy}>
          {t.adminSettings.users.copy}
        </button>
        <button type="button" className="control" onClick={onDismiss}>
          {t.adminSettings.users.delivered}
        </button>
      </div>
      <p className="adm-secret__status" aria-live="polite">
        {copyState === 'copied' && t.adminSettings.users.copied}
        {copyState === 'failed' && t.adminSettings.users.copyFailed}
      </p>
    </section>
  )
}
