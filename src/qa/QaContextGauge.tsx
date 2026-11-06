import { useI18n } from '../i18n/useI18n'
import type { QaContextUsage } from './qaProgress'

/** The share of the context window at which the Agent compacts its history. */
export const CONTEXT_COMPACTION_PERCENT = 80
/** From this share the gauge switches to the warning tone. */
export const CONTEXT_WARNING_PERCENT = 70

/** `84000` becomes `84k`; counts under 1000 stay whole. */
export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return String(Math.round(tokens))
  const thousands = tokens / 1000
  return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}k`
}

export function QaContextGauge({ usage }: { usage: QaContextUsage | null }) {
  const { t } = useI18n()
  if (usage === null) return null
  const s = t.qa.steps
  const clamped = Math.min(100, Math.max(0, usage.percent))
  const warning = usage.percent >= CONTEXT_WARNING_PERCENT
  const text = `${formatTokenCount(usage.usedTokens)} / ${formatTokenCount(usage.maxTokens)} (${usage.percent}%)`
  return (
    <div className={`qa-context${warning ? ' qa-context--warning' : ''}`}>
      <span className="qa-context-label">{s.contextLabel}</span>
      <div
        className="qa-context-bar"
        role="meter"
        aria-label={s.contextLabel}
        aria-valuemin={0}
        aria-valuemax={usage.maxTokens}
        aria-valuenow={Math.min(usage.usedTokens, usage.maxTokens)}
        aria-valuetext={text}
      >
        <div className="qa-context-fill" style={{ width: `${clamped}%` }} />
        <span
          className="qa-context-tick"
          style={{ left: `${CONTEXT_COMPACTION_PERCENT}%` }}
          title={s.contextCompaction(CONTEXT_COMPACTION_PERCENT)}
        />
      </div>
      <span className="qa-context-text">{text}</span>
    </div>
  )
}
