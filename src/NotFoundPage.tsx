import { Link, useLocation, useNavigate } from 'react-router-dom'
import { BrokenLogoScene } from './emptyStates/BrokenLogoScene'
import { useI18n } from './i18n/useI18n'

/**
 * 404 (ARTEL-1162). 없는 주소와, 있어도 볼 수 없는 것(멤버가 아닌 프로젝트 · 지워진 실행 등)을 같은 화면으로 막는다 —
 * 서버도 비참여자에게 존재하지 않는 것처럼 404 를 준다. 무엇이 없는지([title] · [copy])와 돌아갈 길을 보인다.
 * [back] 을 주지 않으면 프로젝트 목록으로 돌아간다.
 */
export function NotFoundPage({
  title,
  copy,
  back,
}: {
  title?: string
  copy?: string
  back?: { to: string; label: string }
}) {
  const { t } = useI18n()
  const m = t.common.notFound
  const location = useLocation()
  const navigate = useNavigate()
  // 이 탭에서 앞서 연 화면이 있을 때만 "이전 화면" 이 뜻이 있다.
  const canGoBack = typeof window !== 'undefined' && window.history.state?.idx > 0

  return (
    <section aria-labelledby="not-found-title" className="page not-found">
      <div className="sketch-empty">
        {/* 전구 줄은 화면 맨 위에서 내려온다. */}
        <span aria-hidden="true" className="nf-hang" />
        <BrokenLogoScene />
        <p className="not-found-code" aria-hidden="true">
          4<span>0</span>4
        </p>
        <h1 className="sketch-empty-title" id="not-found-title">
          {title ?? m.title}
        </h1>
        <span className="sketch-empty-body">{copy ?? m.copy}</span>
        <code className="not-found-path">{location.pathname}</code>
        <span className="sketch-empty-actions">
          <Link className="button button--primary" to={back?.to ?? '/projects'}>
            {back?.label ?? m.backToProjects}
          </Link>
          {canGoBack && (
            <button className="button button--secondary" onClick={() => navigate(-1)} type="button">
              {m.goBack}
            </button>
          )}
          {back && (
            <Link className="button button--secondary" to="/projects">
              {m.backToProjects}
            </Link>
          )}
        </span>
        <span aria-hidden="true" className="nf-after" />
      </div>
    </section>
  )
}
