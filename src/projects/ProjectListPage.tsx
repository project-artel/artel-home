import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { SketchEmpty } from '../emptyStates/SketchEmpty'
import { BuildSketch } from '../emptyStates/sketches'
import { useI18n } from '../i18n/useI18n'
import { StudioIcon } from '../testScenarios/studioIcons'
import { ArtelMarkIntro } from '../layouts/ArtelMarkIntro'
import '../layouts/screens.css'
import { formatDate } from './formatters'
import { InvitationInbox } from './InvitationInbox'
import { ProjectCover } from './ProjectCover'
import { ProjectCreateDialog } from './ProjectCreateDialog'
import { arrangeProjects, pageCount, pageSlice, type ProjectSort } from './projectPaging'
import type { ProjectSummary } from './projectTypes'
import { useFavoriteProjects } from './useFavoriteProjects'
import { useInvitations } from './useInvitations'
import { useProjects } from './useProjects'


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
  const [sort, setSort] = useState<ProjectSort>('recent')
  const [page, setPage] = useState(0)
  const navigate = useNavigate()
  const { t } = useI18n()
  const copy = t.projects.list
  const { favorites, toggle } = useFavoriteProjects(auth.status === 'authenticated' ? auth.user.id : null)

  // 찾기 · 정렬 · 즐겨찾기 앞세우기는 전체 목록이 있어야 맞다. 서버 쪽이 남았으면 이어서 다 읽는다.
  useEffect(() => {
    if (status === 'ready' && hasMore && !loadingMore) loadMore()
  }, [status, hasMore, loadingMore, loadMore])

  const arranged = useMemo(() => arrangeProjects(projects, { query, sort, favorites }), [projects, query, sort, favorites])
  const pages = pageCount(arranged.length)
  const currentPage = Math.min(page, pages - 1)
  const shown = pageSlice(arranged, currentPage)

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
        <h2 className="screen-toolbar-title">
          {copy.sectionTitle}
          {status === 'ready' && <span className="panel-count">{total}</span>}
        </h2>
        <div className="screen-toolbar-tools">
          <label className="search-box">
            <StudioIcon className="search-box-icon" name="search" size={15} />
            <span className="visually-hidden">{copy.searchLabel}</span>
            <input
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(0)
              }}
              placeholder={copy.searchPlaceholder}
              type="search"
              value={query}
            />
            {query !== '' && (
              <button aria-label={copy.clearSearch} className="search-box-clear" onClick={() => setQuery('')} type="button">
                <StudioIcon name="close" size={13} />
              </button>
            )}
          </label>
          <div aria-label={copy.sortLabel} className="segmented segmented--compact" role="group">
            {(['recent', 'name'] as const).map((one) => (
              <button
                aria-pressed={sort === one}
                className="segmented-option"
                key={one}
                onClick={() => {
                  setSort(one)
                  setPage(0)
                }}
                type="button"
              >
                {one === 'recent' ? copy.sortRecent : copy.sortName}
              </button>
            ))}
          </div>
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
          {/* 한 쪽에 8칸: 프로젝트 7개 + 늘 마지막 칸인 새 프로젝트. 많아지면 좌우로 넘긴다. */}
          <ul className="project-cards project-cards--paged" key={currentPage}>
            {shown.map((project) => (
              <ProjectCard
                favorite={favorites.has(project.id)}
                key={project.id}
                onToggleFavorite={() => toggle(project.id)}
                project={project}
              />
            ))}
            <li>
              <button className="project-card project-card--new" onClick={() => setCreating(true)} type="button">
                <span aria-hidden="true" className="project-card-plus">
                  +
                </span>
                <span className="project-card-name">{copy.newProject}</span>
              </button>
            </li>
          </ul>
          {arranged.length === 0 && <p className="detail-empty">{copy.noMatch}</p>}

          <div className="project-pager">
            <span className="list-count">{copy.showingCount(arranged.length, total)}</span>
            {pages > 1 && (
              <div aria-label={copy.pagerLabel} className="project-pager-nav" role="group">
                <button
                  aria-label={copy.previousPage}
                  className="pager-button"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                  type="button"
                >
                  <StudioIcon name="chevronLeft" size={16} />
                </button>
                {Array.from({ length: pages }, (_, index) => (
                  <button
                    aria-current={index === currentPage ? 'page' : undefined}
                    aria-label={copy.pageLabel(index + 1, pages)}
                    className="pager-dot"
                    key={index}
                    onClick={() => setPage(index)}
                    type="button"
                  />
                ))}
                <button
                  aria-label={copy.nextPage}
                  className="pager-button"
                  disabled={currentPage === pages - 1}
                  onClick={() => setPage(currentPage + 1)}
                  type="button"
                >
                  <StudioIcon name="chevronRight" size={16} />
                </button>
              </div>
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

function ProjectCard({
  project,
  favorite,
  onToggleFavorite,
}: {
  project: ProjectSummary
  favorite: boolean
  onToggleFavorite: () => void
}) {
  const { t } = useI18n()
  const copy = t.projects.list

  return (
    <li className="project-card-slot">
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
      {/* 링크 안에 단추를 넣지 않는다. 카드 위에 따로 얹는다. */}
      <button
        aria-label={favorite ? copy.unfavorite(project.name) : copy.favorite(project.name)}
        aria-pressed={favorite}
        className={`favorite-toggle${favorite ? ' is-on' : ''}`}
        onClick={onToggleFavorite}
        type="button"
      >
        <svg aria-hidden="true" height="16" viewBox="0 0 24 24" width="16">
          <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
        </svg>
      </button>
    </li>
  )
}
