import { useMemo } from 'react'
import { useI18n } from '../i18n/useI18n'
import {
  barPlacement,
  buildBehaviorLanes,
  type BehaviorBar,
} from './qaFunctionTimeline'
import type { QaLog } from './qaTypes'

/**
 * behavior 를 줄로 그린 시간축(ARTEL-1051). 줄 하나가 behavior 이름 하나(대상이 다르면 따로)이고,
 * 막대 하나가 한 번의 실행이다. 막대는 시작에서 끝까지이고 끝난 이유로 색이 갈린다.
 *
 * 색만으로 말하지 않는다. 막대 안에 이유 문구가 들어가고, 시간축을 못 보는 사람을 위해 같은 내용이
 * 목록으로도 있다(`visually-hidden`). 막대를 누르면 로그에서 그 behavior 를 시작한 행으로 간다.
 *
 * behavior 가 하나도 없으면 아무것도 그리지 않으므로 이 기능 이전의 run 은 그대로 보인다.
 */
export function QaBehaviorLanes({
  logs,
  onJump,
}: {
  logs: readonly QaLog[]
  onJump: (logId: string) => void
}) {
  const { t } = useI18n()
  const m = t.gameFunctions.timeline
  const { endMs, lanes, startMs } = useMemo(() => buildBehaviorLanes(logs), [logs])
  if (lanes.length === 0) return null

  const runCount = lanes.reduce((count, lane) => count + lane.bars.length, 0)

  function reasonText(bar: BehaviorBar): string {
    if (bar.reason === null) return bar.endMs === null ? m.stillRunning : m.unknownReason
    return m.endReason[bar.reason]
  }

  function hoverText(bar: BehaviorBar): string {
    const lines = [
      `${bar.name}${bar.target === null ? '' : ` @ ${bar.target}`}`,
      reasonText(bar),
      bar.detail ?? bar.report ?? m.noDetail,
    ]
    // report 와 detail 이 둘 다 있으면 마지막 report 줄도 보인다.
    if (bar.detail !== null && bar.report !== null) lines.push(bar.report)
    return lines.join('\n')
  }

  return (
    <details className="gf-lanes" open>
      <summary>
        <span className="gf-lanes-title">{m.lanesTitle}</span>
        <span className="gf-lanes-count mono">{m.lanesCount(runCount)}</span>
      </summary>

      <div className="gf-lanes-body" role="group" aria-label={m.lanesLabel}>
        {lanes.map((lane) => (
          <div className="gf-lane" key={lane.key}>
            <span className="gf-lane-name mono" title={lane.key} translate="no">{lane.key}</span>
            <div className="gf-lane-track">
              {lane.bars.map((bar, index) => {
                const { left, width } = barPlacement(bar, startMs, endMs)
                const content = (
                  <span className="gf-bar-text">{reasonText(bar)}</span>
                )
                const label = m.barLabel(
                  bar.name,
                  reasonText(bar),
                  bar.seconds === null ? null : m.seconds(bar.seconds),
                )
                const style = { insetInlineStart: `${left}%`, inlineSize: `${width}%` }
                const key = `${bar.behaviorId ?? 'x'}-${bar.startMs}-${index}`
                return bar.startLogId === null ? (
                  <span
                    aria-label={label}
                    className={`gf-bar gf-bar--${bar.tone}`}
                    key={key}
                    role="img"
                    style={style}
                    title={hoverText(bar)}
                  >
                    {content}
                  </span>
                ) : (
                  <button
                    aria-label={`${label}. ${m.jumpToStart}`}
                    className={`gf-bar gf-bar--${bar.tone}`}
                    key={key}
                    onClick={() => onJump(bar.startLogId as string)}
                    style={style}
                    title={hoverText(bar)}
                    type="button"
                  >
                    {content}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}
