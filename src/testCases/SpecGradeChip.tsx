import { useI18n } from '../i18n/useI18n'
import { specGradeTone } from './testCaseTypes'

/**
 * The spec author's grade for a case, as a chip.
 *
 * Shared by the case detail card and the case library so the two cannot drift:
 * the grade vocabulary is not ours (the spec generator owns it), and a table
 * that lives in two files is a table that will disagree with itself.
 *
 * Renders nothing when the case carries no grade — cases written by hand here,
 * and every row that predates the field, have none, and an empty chip would
 * claim something the data does not say.
 *
 * `quietWhenSettled` drops the chip for `ready`. Lists use it: a library where
 * every row is badged "확정" is a library where the badge means nothing, and
 * the reason to show grades at all is the cases that are NOT settled. Detail
 * views leave it off — there the question "what grade is this?" is being asked
 * directly, so the answer should be present even when it is the boring one.
 */
export function SpecGradeChip({
  status,
  quietWhenSettled = false,
}: {
  status: string | null
  quietWhenSettled?: boolean
}) {
  const { t } = useI18n()
  const m = t.scenarios.specGrade

  if (status === null || status.length === 0) return null

  const tone = specGradeTone(status)
  if (quietWhenSettled && tone === 'settled') return null

  // An unlabelled grade shows its raw value: we do not own this vocabulary, and
  // a value we have never seen is still a fact about the case.
  const labels: Record<string, string> = m.grades
  const label = labels[status.toLowerCase()] ?? status

  return (
    <span className={`tc-spec-status${tone !== null ? ` grade-${tone}` : ''}`}>
      {m.label}: {label}
    </span>
  )
}
