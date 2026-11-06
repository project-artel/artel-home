import { useI18n } from '../../i18n/useI18n'
import type { QaTryStatus } from '../../qa/qaTypes'

/**
 * A run's state, as a label with a dot beside it.
 *
 * Reuses the existing `qa-status` classes so a status looks the same in a list
 * as it does inside the run itself — including its dot, which that rule draws
 * with `::before` rather than an element, keeping colour out of the text layer.
 */
export function QaStatusPill({ status }: { status: QaTryStatus }) {
  const { t } = useI18n()

  return (
    <span className={`qa-status qa-status--${status.toLowerCase()}`}>
      {t.qa.statusLabels[status]}
    </span>
  )
}
