import { useI18n } from '../i18n/useI18n'
import type { IssueSeverity } from './issueTypes'

/**
 * How bad the defect is, as a word plus a colour.
 *
 * The word is what carries the meaning — the design system forbids saying
 * anything with colour alone, and the two worst grades share `status.critical`,
 * so colour could not separate them anyway.
 */
export function SeverityTag({ severity }: { severity: IssueSeverity }) {
  const { t } = useI18n()
  return (
    <span className={`severity-tag severity-tag--${severity.toLowerCase()}`}>
      {t.issues.severityLabels[severity]}
    </span>
  )
}
