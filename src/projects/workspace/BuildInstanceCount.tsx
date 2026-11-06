import { useI18n } from '../../i18n/useI18n'
import { PLACEHOLDER } from '../formatters'

const counts = new Intl.NumberFormat()

/** 연결 수 / 전체. 하나라도 연결돼 있으면 초록 점이 붙고, 점은 글자의 보조다. */
export function BuildInstanceCount({ connected, total }: { connected: number | null; total: number | null }) {
  const { t } = useI18n()
  const m = t.gameBuilds.list
  if (connected === null || total === null) return <>{PLACEHOLDER}</>

  return (
    <span className="gb-instances">
      <span
        aria-hidden="true"
        className={connected > 0 ? 'status-dot status-dot--connected' : 'status-dot'}
      />
      <span aria-hidden="true">{m.instances(counts.format(connected), counts.format(total))}</span>
      <span className="visually-hidden">{m.instancesLabel(connected, total)}</span>
    </span>
  )
}
