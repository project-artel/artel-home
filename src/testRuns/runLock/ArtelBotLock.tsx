import { useEffect, useState } from 'react'
import { appPath } from '../../appPath'
import { useI18n } from '../../i18n/useI18n'
import type { RunLock } from './runLockApi'
import './runLock.css'

const clock = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * Artel Bot 이 런을 고치는 동안 화면 위에 띄우는 카드(ARTEL-1265). 뒤를 흐리게 덮는 것은 쓰는 쪽(맵 · 편집 화면)이
 * 정한다 — 맵은 TS 프레임만 흐리고 메모는 쓸 수 있게 두고, 편집 화면은 편집 칸 전체를 덮는다.
 */
export function ArtelBotLock({ lock, scope }: { lock: Extract<RunLock, { locked: true }>; scope: 'map' | 'editor' }) {
  const { t } = useI18n()
  const m = t.scenarios.botLock
  const stages = t.projectAgent.tasks.jobs.authoringStages
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const who = lock.mine ? m.mine : m.requestedBy(lock.requestedByName)
  const doing = lock.stage === null ? m.working : stages[lock.stage]
  return (
    <div aria-live="polite" className={'abl abl--' + scope} role="status">
      <div className="abl-card">
        <span aria-hidden="true" className="abl-mark">
          <span className="abl-ring" />
          <img alt="" src={appPath('/artel-mark.svg')} />
        </span>
        <b className="abl-title">{m.title}</b>
        <span className="abl-meta">
          <span>{who}</span>
          <span aria-hidden="true">·</span>
          <span className="abl-stage">{doing}</span>
          <span aria-hidden="true">·</span>
          <span className="mono">{clock(now - lock.startedAt)}</span>
        </span>
        <p className="abl-note">{scope === 'map' ? m.mapNote : m.editorNote}</p>
      </div>
    </div>
  )
}
