import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import type { QaFunctionMode, QaTryFunctionOptions } from './qaFunctionOptions'
import { getQaTryDetail } from './qaTryDetailApi'

/**
 * 시작한 run 의 cheat · behavior 옵션과 에이전트에게 실제로 간 이름(ARTEL-1051).
 *
 * `options` 가 null 인 옛 run 은 아무것도 그리지 않는다. "허용: 전부" 를 지어내면 그 run 이 실제로 cheat 를
 * 쓸 수 있었다는 주장이 되는데, 그 시절에는 cheat 가 없었다.
 */
export function QaFunctionOptionsSummary({ options }: { options: QaTryFunctionOptions | null }) {
  const { t } = useI18n()
  const m = t.gameFunctions.summary
  if (options === null) return null

  return (
    <section className="gf-summary" aria-label={m.title}>
      <h3 className="gf-summary-title">{m.title}</h3>
      <dl className="gf-summary-list">
        <SummaryRow
          allowed={options.allowedCheats}
          effective={options.effectiveCheats}
          label={m.cheatMode}
          mode={options.cheatMode}
        />
        <SummaryRow
          allowed={options.allowedBehaviors}
          effective={options.effectiveBehaviors}
          label={m.behaviorMode}
          mode={options.behaviorMode}
        />
      </dl>
    </section>
  )
}

function SummaryRow({
  allowed,
  effective,
  label,
  mode,
}: {
  allowed: string[] | null
  effective: string[] | null
  label: string
  mode: QaFunctionMode | null
}) {
  const { t } = useI18n()
  const m = t.gameFunctions.summary

  return (
    <div className="gf-summary-row">
      <dt>{label}</dt>
      <dd>
        <span className={`gf-mode gf-mode--${mode ?? 'unknown'}`}>
          {mode === null ? m.unknown : mode === 'on' ? m.on : m.off}
        </span>
        {mode !== 'off' && (
          <>
            <span className="gf-summary-names">
              <span className="gf-summary-key">{m.allowed}</span>
              {allowed === null ? m.allInCatalog : <NameList names={allowed} />}
            </span>
            {effective !== null && (
              <span className="gf-summary-names">
                <span className="gf-summary-key">{m.effective}</span>
                <NameList names={effective} />
              </span>
            )}
          </>
        )}
      </dd>
    </div>
  )
}

function NameList({ names }: { names: string[] }) {
  const { t } = useI18n()
  if (names.length === 0) return <>{t.gameFunctions.summary.none}</>
  return (
    <>
      {names.map((name, index) => (
        <span key={name}>
          {index > 0 && ', '}
          <span className="mono" translate="no">{name}</span>
        </span>
      ))}
    </>
  )
}

/**
 * run 화면용. 상세를 한 번 읽어 옵션만 쓴다. 읽지 못하면 아무것도 그리지 않는다 — 이 줄은 곁다리 정보라
 * 실패를 알리는 배너가 로그 열의 자리를 먹을 이유가 없다.
 */
export function QaRunFunctionOptions({ qaTryId }: { qaTryId: string }) {
  const [loaded, setLoaded] = useState<{ qaTryId: string; options: QaTryFunctionOptions | null } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getQaTryDetail(qaTryId, controller.signal)
      .then((detail) => setLoaded({ qaTryId, options: detail?.functionOptions ?? null }))
      .catch(() => { /* 곁다리 정보라 실패는 조용히 둔다. */ })
    return () => controller.abort()
  }, [qaTryId])

  return <QaFunctionOptionsSummary options={loaded?.qaTryId === qaTryId ? loaded.options : null} />
}
