import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { usePolling } from '../live/usePolling'
import { listProjectQaRuns, type QaRunSummary } from '../qa/launch/qaLaunchApi'
import { getQaRun, listQaPreviewUrls } from '../qa/qaApi'
import { qaRunPath } from '../qa/qaTypes'
import type { ProjectSummary } from './projectTypes'
import './runningQa.css'

const COLLAPSED_COUNT = 3
const RUNS_PER_PROJECT = 50

type RunningQa = QaRunSummary & { projectId: string; projectName: string }

export function RunningQaSection({ projects }: { projects: readonly ProjectSummary[] }) {
  const { t } = useI18n()
  const copy = t.projects.list.runningQa
  const [expanded, setExpanded] = useState(false)
  const [snapshot, setSnapshot] = useState({ runs: [] as RunningQa[], now: 0 })
  const request = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    if (request.current !== null) return
    const controller = new AbortController()
    request.current = controller
    try {
      const runs: RunningQa[] = []
      for (let offset = 0; offset < projects.length; offset += 6) {
        const batch = await Promise.allSettled(projects.slice(offset, offset + 6).map(async (project) => {
          const items = await listProjectQaRuns(project.id, RUNS_PER_PROJECT, controller.signal)
          return items.filter((run) => run.status === 'RUNNING').map((run) => ({
            ...run, projectId: project.id, projectName: project.name,
          }))
        }))
        if (controller.signal.aborted) return
        for (const result of batch) {
          if (result.status === 'fulfilled') runs.push(...result.value)
        }
      }
      runs.sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))
      setSnapshot({ runs, now: Date.now() })
      if (runs.length <= COLLAPSED_COUNT) setExpanded(false)
    } finally {
      if (request.current === controller) request.current = null
    }
  }, [projects])

  useEffect(() => {
    void refresh()
    return () => {
      request.current?.abort()
      request.current = null
    }
  }, [refresh])
  usePolling(refresh, 15_000, projects.length > 0)

  const { runs, now } = snapshot
  if (runs.length === 0) return null

  return (
    <section className="running-qa" aria-labelledby="running-qa-title">
      <header className="running-qa-header">
        <h2 id="running-qa-title" className="screen-toolbar-title">
          {copy.title}<span className="panel-count">{runs.length}</span>
        </h2>
        {runs.length > COLLAPSED_COUNT && (
          <button type="button" className="filter-chip" aria-controls="running-qa-list"
            aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
            {expanded ? copy.collapse : copy.showAll(runs.length)}
          </button>
        )}
      </header>
      <ul id="running-qa-list" className="running-qa-list">
        {(expanded ? runs : runs.slice(0, COLLAPSED_COUNT)).map((run) => {
          const minutes = Math.max(0, Math.floor((now - Date.parse(run.startedAt)) / 60_000))
          return (
            <li key={run.id}>
              <Link className="running-qa-link" to={qaRunPath(run.projectId, run.id)}>
                <QaPreview runId={run.id} />
                <span className="running-qa-copy">
                  <strong>{run.testRunName ?? `#${run.testRunId}`}</strong>
                  <span>{run.projectName}{Number.isFinite(minutes) && ` · ${copy.elapsed(minutes)}`}</span>
                </span>
                <span className="qa-status qa-status--running">{t.qa.statusLabels.RUNNING}</span>
                <span aria-hidden="true">→</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function QaPreview({ runId }: { runId: string }) {
  const [urls, setUrls] = useState<string[]>([])
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set())
  const request = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    if (request.current !== null) return
    const controller = new AbortController()
    request.current = controller
    try {
      const run = await getQaRun(runId, controller.signal)
      const active = run.tries.find((entry) => entry.status === 'RUNNING')
      const attempt = active ?? run.tries.slice().reverse().find((entry) => entry.completedAt !== null)
      if (attempt === undefined) return
      const next = await listQaPreviewUrls(attempt.id, controller.signal)
      if (!controller.signal.aborted && next.length > 0) {
        setUrls(next)
        setFailed(new Set())
      }
    } catch {
      // 다음 polling까지 마지막 썸네일을 유지한다.
    } finally {
      if (request.current === controller) request.current = null
    }
  }, [runId])

  useEffect(() => {
    void refresh()
    return () => {
      request.current?.abort()
      request.current = null
    }
  }, [refresh])
  usePolling(refresh, 15_000)

  const url = urls.find((candidate) => !failed.has(candidate))
  return (
    <span className="running-qa-preview" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M7 7h10c2 0 3 1.5 3.5 4l.8 4.5c.5 2.5-1.6 3.2-3.1 1.7L16 15H8l-2.2 2.2c-1.5 1.5-3.6.8-3.1-1.7l.8-4.5C4 8.5 5 7 7 7Z" />
        <path d="M7.5 10v4m-2-2h4m5.5 0h.01m3-1.5h.01" />
      </svg>
      {url !== undefined && <img alt="" loading="lazy" src={url} onError={() => setFailed((current) => new Set([...current, url]))} />}
    </span>
  )
}
