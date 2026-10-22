import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SketchEmpty } from '../emptyStates/SketchEmpty'
import { PerformanceSketch } from '../emptyStates/sketches'
import { useI18n } from '../i18n/useI18n'
import { useFieldBinding } from '../projectAgent/bindings'
import { requireKnownId } from '../projectAgent/specs/fieldWriters'
import { PERFORMANCE_BUILD_FIELD } from '../projectAgent/specs/performance'
import { useWorkspace } from '../projects/workspace/workspaceContext'
import { BuildList } from './BuildList'
import { buildName } from './buildName'
import { BuildPerformanceReport, type OtherBuild } from './BuildPerformancePage'
import { useBuildDigests } from './useBuildDigests'
import './performance.css'

/**
 * Project-level entry point for comparing performance one reported build at a time.
 *
 * 왼쪽은 빌드 목록, 오른쪽은 고른 빌드의 추세다(ARTEL-1207). 두 칸 다 화면 높이에 맞추고 각자 넘긴다.
 */
export function PerformanceSection() {
  const { builds, projectId } = useWorkspace()
  const { t } = useI18n()
  const copy = t.performance.build
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedBuildId = searchParams.get('build')
  const selectedBuild = builds.find((build) => build.id === requestedBuildId) ?? builds[0]
  const digests = useBuildDigests(projectId, builds)

  useEffect(() => {
    if (selectedBuild === undefined || requestedBuildId === selectedBuild.id) return
    setSearchParams({ build: selectedBuild.id }, { replace: true })
  }, [requestedBuildId, selectedBuild, setSearchParams])

  // agent 가 build 를 고르는 길. 목록 줄을 누르는 것과 같은 `setSearchParams` 를 부른다.
  const listRef = useRef<HTMLDivElement>(null)
  useFieldBinding(PERFORMANCE_BUILD_FIELD, {
    target: () => listRef.current,
    read: () => selectedBuild?.id ?? null,
    options: () => builds.map((build) => ({ value: build.id, label: buildName(build) })),
    write: (value) =>
      setSearchParams({
        build: requireKnownId(
          PERFORMANCE_BUILD_FIELD.name,
          value,
          builds.map((build) => build.id),
        ),
      }),
  })

  if (selectedBuild === undefined) {
    return (
      <section className="pf pf--single">
        <SketchEmpty body={copy.noBuildsBody} sketch={<PerformanceSketch />} title={copy.noBuildsTitle} />
      </section>
    )
  }

  // 런 없는 빌드를 열었을 때 바로 옮겨 갈 곳.
  const others: OtherBuild[] = builds.flatMap((build) => {
    const state = digests.get(build.id)
    if (build.id === selectedBuild.id || state?.status !== 'ready' || state.digest.latest === null) return []
    return [{ id: build.id, name: buildName(build), runCount: state.digest.runCount, latest: state.digest.latest }]
  })

  return (
    <section className="pf">
      <BuildList
        builds={builds}
        digests={digests}
        onSelect={(buildId) => setSearchParams({ build: buildId })}
        ref={listRef}
        selectedId={selectedBuild.id}
      />
      <BuildPerformanceReport
        buildId={selectedBuild.id}
        buildLabel={buildName(selectedBuild)}
        onPickBuild={(buildId) => setSearchParams({ build: buildId })}
        others={others}
        projectId={projectId}
        showHeader={false}
      />
    </section>
  )
}
