import { forwardRef, useId, useState } from 'react'
import { EdgeScrollbar } from '../design-system/primitives/EdgeScrollbar'
import { useI18n } from '../i18n/useI18n'
import type { GameBuild } from '../projects/gameTypes'
import { buildName } from './buildName'
import type { DigestState } from './useBuildDigests'

/**
 * 왼쪽 빌드 목록(ARTEL-1207). 예전 선택 상자를 대신한다: 고르기 전에 어느 빌드에 런이 있고 최근 값이 어땠는지 보인다.
 *
 * 칸 높이는 화면에 고정이고 목록만 안에서 넘긴다. 오른쪽 본문을 내려도 목록은 제자리다.
 */
export const BuildList = forwardRef<HTMLDivElement, {
  builds: readonly GameBuild[]
  digests: ReadonlyMap<string, DigestState>
  selectedId: string | null
  onSelect: (buildId: string) => void
}>(function BuildList({ builds, digests, selectedId, onSelect }, ref) {
  const { t } = useI18n()
  const copy = t.performance.overview
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [scroller, setScroller] = useState<HTMLUListElement | null>(null)

  const needle = query.trim().toLowerCase()
  const shown = needle === '' ? builds : builds.filter((build) => buildName(build).toLowerCase().includes(needle))
  const withRuns = builds.filter((build) => {
    const state = digests.get(build.id)
    return state?.status === 'ready' && state.digest.runCount > 0
  }).length

  return (
    <aside aria-labelledby="pf-builds-title" className="pf-builds" ref={ref}>
      <header className="pf-panel-head">
        <h2 id="pf-builds-title">{copy.buildsTitle}</h2>
        <span className="pf-panel-hint">{copy.buildsWithRuns(withRuns, builds.length)}</span>
      </header>
      <div className="pf-builds-search">
        <label className="visually-hidden" htmlFor={searchId}>
          {copy.searchLabel}
        </label>
        <input
          className="field-input"
          id={searchId}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={copy.searchPlaceholder}
          type="search"
          value={query}
        />
      </div>
      <div className="pf-scroll-frame">
        <ul className="pf-builds-list" ref={setScroller}>
          {shown.length === 0 && <li className="pf-muted pf-builds-none">{copy.noMatch}</li>}
          {shown.map((build) => {
            const state = digests.get(build.id) ?? { status: 'loading' }
            const empty = state.status === 'ready' && state.digest.runCount === 0
            const selected = build.id === selectedId
            return (
              <li key={build.id}>
                <button
                  aria-current={selected ? 'true' : undefined}
                  className={`pf-build${selected ? ' is-selected' : ''}${empty ? ' is-empty' : ''}`}
                  onClick={() => onSelect(build.id)}
                  type="button"
                >
                  <span className="pf-build-name">
                    <span className="pf-build-version" title={buildName(build)}>
                      {buildName(build)}
                    </span>
                    {build.isEditor && <span className="pf-chip pf-chip--editor">{copy.editor}</span>}
                  </span>
                  <span className="pf-build-meta">
                    {state.status === 'loading'
                      ? copy.digestLoading
                      : state.status === 'failed'
                        ? copy.digestFailed
                        : state.digest.latest === null
                          ? copy.noRuns
                          : copy.runsLatest(state.digest.runCount, state.digest.latest.toFixed(1))}
                  </span>
                  <Sparkline values={state.status === 'ready' ? state.digest.spark : []} />
                </button>
              </li>
            )
          })}
        </ul>
        <EdgeScrollbar label={copy.buildsTitle} scroller={scroller} side="right" />
      </div>
    </aside>
  )
})

const SPARK_WIDTH = 64
const SPARK_HEIGHT = 22

/** 신뢰할 수 있는 런의 분당 hitch. 끝점만 강조한다. 둘보다 적으면 선을 긋지 않고 점선만 둔다. */
function Sparkline({ values }: { values: readonly number[] }) {
  if (values.length < 2) {
    return (
      <svg aria-hidden="true" className="pf-spark" height={SPARK_HEIGHT} viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`} width={SPARK_WIDTH}>
        <line className="pf-spark-none" x1={2} x2={SPARK_WIDTH - 2} y1={SPARK_HEIGHT / 2} y2={SPARK_HEIGHT / 2} />
        {values.length === 1 && <circle className="pf-spark-end" cx={SPARK_WIDTH - 4} cy={SPARK_HEIGHT / 2} r={2.5} />}
      </svg>
    )
  }
  const top = Math.max(...values)
  const bottom = Math.min(...values)
  const span = top - bottom || 1
  const points = values.map((value, index) => [
    2 + (index * (SPARK_WIDTH - 6)) / (values.length - 1),
    SPARK_HEIGHT - 3 - ((value - bottom) / span) * (SPARK_HEIGHT - 6),
  ])
  const [endX, endY] = points[points.length - 1]
  return (
    <svg aria-hidden="true" className="pf-spark" height={SPARK_HEIGHT} viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`} width={SPARK_WIDTH}>
      <polyline className="pf-spark-line" fill="none" points={points.map((point) => point.join(',')).join(' ')} />
      <circle className="pf-spark-end" cx={endX} cy={endY} r={2.5} />
    </svg>
  )
}
