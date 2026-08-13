import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { useWorkspace } from '../projects/workspace/workspaceContext'
import { BuildPerformanceReport } from './BuildPerformancePage'

/** Project-level entry point for comparing performance one reported build at a time. */
export function PerformanceSection() {
  const { builds, projectId } = useWorkspace()
  const { t } = useI18n()
  const copy = t.performance.build
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedBuildId = searchParams.get('build')
  const selectedBuild = builds.find((build) => build.id === requestedBuildId) ?? builds[0]

  useEffect(() => {
    if (selectedBuild === undefined || requestedBuildId === selectedBuild.id) return
    setSearchParams({ build: selectedBuild.id }, { replace: true })
  }, [requestedBuildId, selectedBuild, setSearchParams])

  return (
    <section className="performance-overview">
      <header className="performance-overview-head">
        <div>
          <h2>{copy.overviewTitle}</h2>
          <p>{copy.overviewSubtitle}</p>
        </div>
        {selectedBuild !== undefined && (
          <label className="performance-build-picker">
            <span>{copy.selectLabel}</span>
            <select
              onChange={(event) => setSearchParams({ build: event.target.value })}
              value={selectedBuild.id}
            >
              {builds.map((build) => (
                <option key={build.id} value={build.id}>
                  {build.label ? `${build.version} · ${build.label}` : build.version}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {selectedBuild === undefined ? (
        <div className="performance-empty">
          <strong>{copy.noBuildsTitle}</strong>
          <p>{copy.noBuildsBody}</p>
        </div>
      ) : (
        <BuildPerformanceReport buildId={selectedBuild.id} projectId={projectId} showHeader={false} />
      )}
    </section>
  )
}
