import { useCallback, useState } from 'react'
import { UnauthorizedError } from '../shared/adminApi'
import { useI18n } from '../../i18n/useI18n'
import { SettingsApiError } from './settingsApi'

/** A 401 is handled globally by apiFetch; screens show no new error for it. */
export function useAdminFailure() {
  const { t } = useI18n()
  const [error, setError] = useState<string | null>(null)

  const fail = useCallback((cause: unknown) => {
    if (cause instanceof UnauthorizedError) return
    if (cause instanceof SettingsApiError) {
      const message = t.adminSettings.errors[cause.code as keyof typeof t.adminSettings.errors]
      setError(message ?? t.admin.states.loadFailed)
      return
    }
    setError(t.admin.states.loadFailed)
  }, [t])

  return { error, setError, fail }
}
