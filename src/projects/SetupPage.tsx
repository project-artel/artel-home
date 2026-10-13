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
    <section className="page" aria-labelledby="setup-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">{t.projects.setup.eyebrow}</p>
          <h1 id="setup-title">{t.projects.setup.title}</h1>
        </div>
      </header>

      <SetupGuide />
    </section>
  )
}
