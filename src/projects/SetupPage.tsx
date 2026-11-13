import { PageHeader } from '../design-system/primitives/Headers'
import { useI18n } from '../i18n/useI18n'
import { SetupGuide } from './SetupGuide'

/**
 * The setup guide outside any project, reached from the top bar. It is the
 * same content the project section shows, with a placeholder where the
 * project id goes.
 */
export function SetupPage() {
  const { t } = useI18n()

  return (
    <section className="page page--wide" aria-labelledby="setup-title">
      <PageHeader eyebrow={t.projects.setup.eyebrow} title={t.projects.setup.title} titleId="setup-title" />

      <SetupGuide />
    </section>
  )
}
