import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { getQaRunUsage, usedTokens, type QaRunUsage } from './qaUsageApi'

type LoadStatus = 'loading' | 'ready' | 'error'

const counts = new Intl.NumberFormat()

/**
 * Cost is shown to four decimals below a dollar. A single run is often under a
 * cent, and stopping at two turns most runs into `$0.00`, which is exactly the
 * number a reader would want to compare.
 */
function formatCost(value: number | null, unknown: string): string {
  if (value === null) return unknown
  return `$${value.toFixed(value >= 1 ? 2 : 4)}`
}

/**
 * What this run cost, beside what it did.
 *
 * **Not live.** The agent batches usage and posts it after the calls happen, so
 * a running run's numbers trail the log by up to a flush interval — and a failed
 * batch is dropped rather than retried. Streaming this would draw a total that
 * jumps backwards relative to the timeline. A refresh button is the whole of its
 * liveness, and the panel says plainly that a run still going has not finished
 * reporting.
 */
export function QaRunUsagePanel({ qaTryId, active }: { qaTryId: string; active: boolean }) {
  const { t } = useI18n()
  const [usage, setUsage] = useState<QaRunUsage | null>(null)
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [reloadToken, setReloadToken] = useState(0)

  // The effect only writes when a request settles. `loading` is set by the
  // refresh handler instead, because that is the event that causes it — setting
  // it here would make every render of the effect cascade into another one.
  // A different run remounts this panel (`QaTryPage` is keyed by its id), so the
  // initial `loading` covers the first fetch.
  useEffect(() => {
    const controller = new AbortController()

    getQaRunUsage(qaTryId, controller.signal)
      .then((result) => {
        setUsage(result)
        setStatus('ready')
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setStatus('error')
      })

    return () => controller.abort()
  }, [qaTryId, reloadToken])

  function refresh() {
    setStatus('loading')
    setReloadToken((token) => token + 1)
  }

  const tokens = usage === null ? 0 : usedTokens(usage)
  // The amount stands on fewer calls than the run made, so it is a floor.
  const partial = usage !== null && usage.pricedCalls < usage.calls

  return (
    <section className="panel qa-usage-panel" aria-labelledby="qa-usage-title">
      <header className="panel-header panel-header--split">
        <div>
          <h2 id="qa-usage-title">{t.qa.usage.title}</h2>
          <p className="qa-usage-note">
            {active ? t.qa.usage.stillRunning : t.qa.usage.subtitle}
          </p>
        </div>
        <button
          className="button button--secondary button--compact"
          onClick={refresh}
          type="button"
        >
          {t.qa.usage.refresh}
        </button>
      </header>

      {status === 'loading' && <p className="panel-empty">{t.qa.usage.loading}</p>}

      {status === 'error' && (
        <p className="panel-empty" role="alert">
          {t.qa.usage.loadFailed}
        </p>
      )}

      {status === 'ready' && (usage === null || usage.calls === 0) && (
        // Zero is not "this run was free" — it is "nothing has arrived yet".
        <p className="panel-empty">{t.qa.usage.nothingReported}</p>
      )}

      {status === 'ready' && usage !== null && usage.calls > 0 && (
        <dl className="qa-usage-grid">
          <div className="qa-usage-item">
            <dt>{t.qa.usage.tokens}</dt>
            <dd className="mono">{counts.format(tokens)}</dd>
            <p className="qa-usage-hint">
              {t.qa.usage.tokenSplit(
                counts.format(usage.inputTokens),
                counts.format(usage.outputTokens),
              )}
            </p>
          </div>

          <div className="qa-usage-item">
            <dt>{t.qa.usage.cost}</dt>
            <dd className="mono">
              {formatCost(usage.costUsd, t.qa.usage.costUnknown)}
              {partial && usage.costUsd !== null && (
                <span className="qa-usage-partial" title={t.qa.usage.partialHint}>
                  +
                </span>
              )}
            </dd>
            <p className="qa-usage-hint">
              {usage.costUsd === null
                ? t.qa.usage.noPricedCall
                : partial
                  ? t.qa.usage.partialPrice(usage.pricedCalls, usage.calls)
                  : t.qa.usage.fullyPriced(usage.calls)}
            </p>
          </div>

          <div className="qa-usage-item">
            <dt>{t.qa.usage.calls}</dt>
            <dd className="mono">{counts.format(usage.calls)}</dd>
            <p className="qa-usage-hint">
              {t.qa.usage.perCall(counts.format(Math.round(tokens / usage.calls)))}
            </p>
          </div>

          <div className="qa-usage-item">
            <dt>{t.qa.usage.cached}</dt>
            <dd className="mono">{counts.format(usage.cachedInputTokens)}</dd>
            {/* A subset of input tokens, so it is not added to the total above. */}
            <p className="qa-usage-hint">{t.qa.usage.cachedHint}</p>
          </div>
        </dl>
      )}
    </section>
  )
}
