import { Link, useSearchParams } from 'react-router-dom'
import { BuildSwitcher } from '../../contentMap/BuildSwitcher'
import { newestFirst } from '../../contentMap/latestBuild'
import { useI18n } from '../../i18n/useI18n'
import { GameIdentityPanel } from '../GameIdentityPanel'
import { gameBuildDetailHref, sectionHref } from './sections'
import { useWorkspace } from './workspaceContext'

export function GameIdentitiesSection() {
  const { projectId, builds } = useWorkspace()
  const { t } = useI18n()
  const messages = t.gameIdentities
  const [search, setSearch] = useSearchParams()
  const requested = search.get('build')
  const selected = requested === null ? newestFirst(builds)[0] : builds.find((build) => build.id === requested)

  if (builds.length === 0) return (
    <section className="panel">
      <p>{messages.noBuilds}</p>
      <Link to={sectionHref(projectId, 'game-builds')}>{messages.openBuilds}</Link>
    </section>
  )

  if (selected === undefined) return (
    <section className="panel">
      <p role="alert">{messages.buildNotFound}</p>
      <Link to={sectionHref(projectId, 'game-identities')}>{messages.chooseLatestBuild}</Link>
    </section>
  )

  return (
    <div className="section-single">
      <div className="gi-build-toolbar">
        <BuildSwitcher builds={builds} selected={selected} onSelect={(buildId) => {
          const next = new URLSearchParams(search)
          next.set('build', buildId)
          setSearch(next)
        }} />
        <Link className="button button--secondary button--compact" to={gameBuildDetailHref(projectId, selected.id)}>{messages.openBuild}</Link>
      </div>
      <GameIdentityPanel key={`${projectId}/${selected.id}`} projectId={projectId} buildId={selected.id} layout="table" />
    </div>
  )
}
