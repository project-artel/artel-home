import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { SketchEmpty } from '../emptyStates/SketchEmpty'
import { BuildSketch } from '../emptyStates/sketches'
import { useI18n } from '../i18n/useI18n'
import { ArtelMarkIntro } from '../layouts/ArtelMarkIntro'
import '../layouts/screens.css'
import { formatDate } from './formatters'
import { InvitationInbox } from './InvitationInbox'
import { ProjectCover } from './ProjectCover'
import { ProjectCreateDialog } from './ProjectCreateDialog'
import type { ProjectSummary } from './projectTypes'
import { useInvitations } from './useInvitations'
import { useProjects } from './useProjects'

type SortMode = 'recent' | 'name'

/**
 * 프로젝트 목록(ARTEL-1208). 머리(인사 · 수 셋 · ARTEL 로고), 찾기 · 정렬, 카드 격자, 그 아래 받은 초대.
 * 찾기와 정렬은 이미 받은 목록에서 한다. 더 보기는 예전처럼 서버에서 다음 쪽을 읽는다.
 */
export function ProjectListPage() {
  const { status, projects, total, hasMore, loadingMore, loadMore, reload } = useProjects()
  const inbox = useInvitations()
  const auth = useAuth()
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>('recent')
  const navigate = useNavigate()
  const { t } = useI18n()
  const copy = t.projects.list

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matched =
      needle === ''
        ? projects
        : projects.filter((project) => `${project.name} ${project.description ?? ''}`.toLowerCase().includes(needle))
    return [...matched].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt.localeCompare(a.updatedAt),
    )
  }, [projects, query, sort])

  const owned = projects.filter((project) => project.myRole === 'OWNER').length
  const invitationCount = inbox.status === 'ready' ? inbox.invitations.length : null
  const name = auth.status === 'authenticated' ? auth.user.nickname || auth.user.displayName : ''

  return (
    <section className="page page--wide project-home" aria-labelledby="projects-title">
      <header className="project-hero">
        <div className="project-hero-text">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1 id="projects-title">{name === '' ? copy.title : copy.heroTitle(name)}</h1>
          <p className="project-hero-lead">{copy.heroLead}</p>
          {status === 'ready' && (
            <dl className="project-hero-stats">
              <div>
                <dt>{copy.statProjects}</dt>
                <dd className="mono">{total}</dd>
              </div>
              {/* 다음 쪽이 남았으면 소유 수를 다 셀 수 없어 보이지 않는다. */}
              {!hasMore && (
                <div>
                  <dt>{copy.statOwned}</dt>
                  <dd className="mono">{owned}</dd>
                </div>
              )}
              {invitationCount !== null && (
                <div>
                  <dt>{copy.statInvites}</dt>
                  <dd className="mono">{invitationCount}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
        <ArtelMarkIntro />
      </header>

      <div className="screen-toolbar">
        <h2 className="screen-toolbar-title">{copy.sectionTitle}</h2>
        <div className="screen-toolbar-tools">
          <input
            aria-label={copy.searchLabel}
            className="field-input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.searchPlaceholder}
            type="search"
            value={query}
          />
          <select aria-label={copy.sortLabel} className="field-input" onChange={(event) => setSort(event.target.value as SortMode)} value={sort}>
            <option value="recent">{copy.sortRecent}</option>
            <option value="name">{copy.sortName}</option>
          </select>
          <button className="button button--primary" onClick={() => setCreating(true)} type="button">
            {copy.newProject}
          </button>
        </div>
      </div>

      {status === 'loading' && (
        <ul className="project-cards" aria-busy="true" aria-label={copy.loadingLabel}>
          {[0, 1, 2].map((row) => (
            <li className="project-card project-card--skeleton" key={row} aria-hidden="true">
              <span className="skeleton-line" />
              <span className="skeleton-line skeleton-line--short" />
            </li>
          ))}
        </ul>
      )}

      {status === 'error' && (
        <div className="panel-message" role="alert">
          <p>{copy.loadFailed}</p>
          <button className="button button--secondary" onClick={reload} type="button">
            {t.projects.shared.retry}
          </button>
        </div>
      )}

      {status === 'ready' && projects.length === 0 && (
        <SketchEmpty
          actions={
            <button className="button button--primary" onClick={() => setCreating(true)} type="button">
              {copy.newProject}
            </button>
          }
          body={copy.emptyCopy}
          sketch={<BuildSketch />}
          title={copy.emptyTitle}
        />
      )}

      {status === 'ready' && projects.length > 0 && (
        <>
          <ul className="project-cards">
            {shown.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
            {query.trim() === '' && (
              <li>
                <button className="project-card project-card--new" onClick={() => setCreating(true)} type="button">
                  <span aria-hidden="true" className="project-card-plus">
                    +
                  </span>
                  <span className="project-card-name">{copy.newProject}</span>
                  <ol className="project-card-steps">
                    {copy.newCardSteps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </button>
              </li>
            )}
          </ul>
          {shown.length === 0 && <p className="detail-empty">{copy.noMatch}</p>}

          <div className="list-footer">
            <p className="list-count">{copy.showingCount(projects.length, total)}</p>
            {hasMore && (
              <button className="button button--secondary" disabled={loadingMore} onClick={loadMore} type="button">
                {loadingMore ? copy.loadingMore : copy.loadMore}
              </button>
            )}
          </div>
        </>
      )}

      {/* 목록의 loading · error 분기 밖이다. 목록을 못 읽었다고 초대까지 감출 이유가 없고,
          오히려 그때야말로 초대를 수락해 프로젝트를 얻을 수 있는 자리다. */}
      <InvitationInbox
        inbox={inbox}
        onAccepted={(projectId) => {
          reload()
          navigate(`/projects/${projectId}`)
        }}
      />

      {creating && (
        <ProjectCreateDialog
          onClose={() => setCreating(false)}
          onCreated={(project) => navigate(`/projects/${project.id}`)}
        />
      )}
    </section>
  )
}

function ProjectCard({ project }: { project: ProjectSummary }) {
  const { t } = useI18n()
  const copy = t.projects.list

  return (
    <li>
      <Link className="project-card" to={`/projects/${project.id}`}>
        <ProjectCover id={project.id} name={project.name} />
        <span className="project-card-body">
          <span className="project-card-top">
            <span className="project-card-name">{project.name}</span>
            <span className={`badge${project.myRole === 'OWNER' ? ' badge--accent' : ''}`}>{t.projects.roles[project.myRole]}</span>
          </span>
          <span className={`project-card-description${project.description ? '' : ' detail-empty'}`}>
            {project.description ? project.description : t.projects.detail.noDescription}
          </span>
          <span className="project-card-meta">
            <span className="badge">{t.projects.genreLabels[project.genre]}</span>
            {/* 글로 상태를 말한다. 색만으로 "문서 있음" 과 "없음" 을 가르지 않는다. */}
            {project.latestDocument === null ? (
              <span>{copy.noDocument}</span>
            ) : (
              <span className="project-card-doc">
                <span className="mono">v{project.latestDocument.version}</span> {project.latestDocument.fileName}
              </span>
            )}
            <span className="project-card-updated">{formatDate(project.updatedAt)}</span>
          </span>
        </span>
      </Link>
    </li>
  )
}
