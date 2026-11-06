import { useState } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { invalidateLlmCache, type CacheInvalidation } from './settingsApi'
import { useAdminFailure } from './useAdminRequest'
import { InfoHint } from '../../design-system/primitives/InfoHint'

/**
 * Drops the keys and catalog that agent-server cached. Saving a key or toggling
 * a model already does this; the button is for when that automatic call failed.
 */
export function CacheInvalidationSection() {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<CacheInvalidation | null>(null)
  const { error, setError, fail } = useAdminFailure()

  async function run() {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      setResult(await invalidateLlmCache())
    } catch (cause) {
      fail(cause)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="adm-cache-title">
      <div className="section__head">
        <h2 className="section__title" id="adm-cache-title">
          {t.adminSettings.cache.title}
          <InfoHint>{t.adminSettings.cache.hint}</InfoHint>
        </h2>
      </div>
      <div className="adm-actions">
        <button type="button" className="control" disabled={busy} onClick={() => void run()}>
          {busy ? t.adminSettings.cache.clearing : t.adminSettings.cache.clear}
        </button>
      </div>
      {error !== null && (
        <p className="notice notice--critical" role="alert">
          {error}
        </p>
      )}
      {result !== null && (
        <p
          className={`notice${result.agentServerInvalidated ? '' : ' notice--critical'}`}
          role={result.agentServerInvalidated ? 'status' : 'alert'}
        >
          {result.agentServerInvalidated
            ? t.adminSettings.cache.success
            : t.adminSettings.cache.failure(result.error ?? t.adminSettings.common.unknown)}
        </p>
      )}
    </section>
  )
}
