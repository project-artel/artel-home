import { useI18n } from '../i18n/useI18n'
import {
  flattenMetrics,
  orderedGroupNames,
  type MetricGroup,
  type MetricGroups,
} from './performanceTypes'

/**
 * The one place that decides what an absent or unknown metric group looks like.
 *
 * Each group still gets its own reading — a draw-call count is not a GC pause —
 * but "there is nothing here, and here is why" is answered once. Spreading that
 * answer across the panels is how `UNSUPPORTED` and `NOT_REPORTED` end up
 * rendered as the same blank.
 *
 * This is deliberately not a chart engine. It lists a group's rolled-up numbers
 * and its availability; it does not plot arbitrary metrics over time.
 */
export function MetricGroupList({ groups }: { groups: MetricGroups }) {
  const { t } = useI18n()
  const copy = t.performance.groups
  const names = orderedGroupNames(groups)

  if (names.length === 0) {
    return <p className="performance-unmeasured">{copy.noneReported}</p>
  }

  return (
    <div className="performance-groups">
      {names.map((name) => (
        <MetricGroupCard group={groups[name]} key={name} name={name} />
      ))}
    </div>
  )
}

function MetricGroupCard({ group, name }: { group: MetricGroup; name: string }) {
  const { t } = useI18n()
  const copy = t.performance.groups
  // A group this build has no title for still renders, under its wire name. The
  // server ships before the screen does, so an unknown group is expected traffic.
  const title = copy.names[name] ?? name
  const entries = group.metrics === null ? [] : flattenMetrics(group.metrics)

  return (
    <section className="performance-group" data-availability={group.availability}>
      <header className="performance-group-head">
        <h3>{title}</h3>
        <p className="performance-group-state">{copy.availability[group.availability]}</p>
      </header>

      {group.source !== null && (
        <p className="performance-group-source">{copy.source(copy.sources[group.source] ?? group.source)}</p>
      )}

      {group.availability !== 'MEASURED' ? (
        <p className="performance-unmeasured">{copy.availabilityDetail[group.availability]}</p>
      ) : entries.length === 0 ? (
        <p className="performance-unmeasured">{copy.measuredButEmpty}</p>
      ) : (
        <>
          <dl className="performance-group-metrics">
            {entries.map(([path, value]) => (
              <div key={path}>
                <dt>{copy.metrics[path] ?? path}</dt>
                <dd>{formatMetric(value)}</dd>
              </div>
            ))}
          </dl>
          <p className="performance-group-coverage">
            {copy.coverage((group.sampleRatio * 100).toFixed(0))}
          </p>
        </>
      )}
    </section>
  )
}

/**
 * Counters arrive whole and gauges arrive fractional, and the contract does not
 * label which is which. Printing by the value's own shape keeps a count of 12
 * from reading as "12.0" without this file having to know every group's leaves.
 */
function formatMetric(value: number): string {
  if (Number.isInteger(value)) return value.toLocaleString()

  return Math.abs(value) >= 1000 ? Math.round(value).toLocaleString() : value.toFixed(2)
}
