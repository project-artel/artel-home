import { useI18n } from '../i18n/useI18n'

/** Marks a scenario whose test cases the QA agent verifies in an order of its own choosing. */
export function FreeScenarioBadge() {
  const { t } = useI18n()
  return (
    <span className="free-badge" title={t.scenarios.free.badgeHint}>
      {t.scenarios.free.badge}
    </span>
  )
}
