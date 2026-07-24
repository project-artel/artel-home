import { Link } from 'react-router-dom'
import { useI18n } from './i18n/useI18n'

export function NotFoundPage() {
  const { t } = useI18n()

  return (
    <section className="page">
      <div className="panel-message">
        <h1>{t.common.notFound.title}</h1>
        <p className="panel-message-copy">{t.common.notFound.copy}</p>
        <Link className="button button--secondary" to="/projects">
          {t.common.notFound.backToProjects}
        </Link>
      </div>
    </section>
  )
}
