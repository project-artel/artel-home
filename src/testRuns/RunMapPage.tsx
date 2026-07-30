import { Fragment, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { CategoryChip } from '../testCases/CategoryChip'
import { getScenarioCases } from '../testScenarios/scenarioCaseApi'
import { listTestScenarios } from '../testScenarios/scenarioApi'
import type { VerificationStatus } from '../testCases/testCaseTypes'
import { getRunScenarios, getTestRun, type TestRun } from './testRunApi'

/**
 * The TestRun map — a read-only visualisation of a run and the scenarios it
 * bundles. Each scenario is a node summarising its cases' verification status;
 * clicking one opens that scenario's editor. There is no editing here (no
 * repositioning, no run composition changes, no chat) — this is the "read" view.
 */

type Rollup = Record<VerificationStatus, number>

type CaseLite = { id: string; title: string; status: VerificationStatus; category: string }

type ScenarioNode = {
  id: string
  title: string
  total: number
  rollup: Rollup
  cases: CaseLite[]
}

const STATUSES: VerificationStatus[] = ['VERIFIED', 'DRAFT', 'BROKEN']
const MIN_SCALE = 0.4
const MAX_SCALE = 1.6

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value))
}

function nodeStatus(node: ScenarioNode): VerificationStatus {
  if (node.rollup.BROKEN > 0) return 'BROKEN'
  if (node.total > 0 && node.rollup.VERIFIED === node.total) return 'VERIFIED'
  return 'DRAFT'
}

export function RunMapRoute() {
  const { projectId = '', runId = '' } = useParams()
  return <RunMapPage key={runId} projectId={projectId} runId={runId} />
}

function RunMapPage({ projectId, runId }: { projectId: string; runId: string }) {
  const { t } = useI18n()
  const m = t.scenarios.map
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [run, setRun] = useState<TestRun | null>(null)
  const [nodes, setNodes] = useState<ScenarioNode[]>([])

  useEffect(() => {
    const controller = new AbortController()
    const signal = controller.signal
    ;(async () => {
      try {
        const [runData, items, summaries] = await Promise.all([
          getTestRun(projectId, runId, signal),
          getRunScenarios(projectId, runId, signal),
          listTestScenarios(Number(projectId), signal),
        ])
        if (runData === null) {
          setStatus('missing')
          return
        }
        const titleById = new Map(summaries.map((s) => [String(s.testScenarioId), s.title]))
        const built = await Promise.all(
          items.map(async (item): Promise<ScenarioNode> => {
            const cases = await getScenarioCases(Number(item.testScenarioId), signal).catch(() => [])
            const rollup: Rollup = { VERIFIED: 0, DRAFT: 0, BROKEN: 0 }
            for (const entry of cases) rollup[entry.case.verificationStatus] += 1
            const title = titleById.get(item.testScenarioId) ?? ''
            return {
              id: item.testScenarioId,
              title: title.length > 0 ? title : `#${item.testScenarioId}`,
              total: cases.length,
              rollup,
              cases: cases.map((entry) => ({
                id: entry.case.id,
                title: entry.case.title,
                status: entry.case.verificationStatus,
                category: entry.case.category,
              })),
            }
          }),
        )
        setRun(runData)
        setNodes(built)
        setStatus('ready')
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setStatus('error')
      }
    })()
    return () => controller.abort()
  }, [projectId, runId])

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function openEdit(scenarioId: string) {
    navigate(`/projects/${encodeURIComponent(projectId)}/test-scenarios/${scenarioId}?run=${encodeURIComponent(runId)}`)
  }
  function openCase(scenarioId: string, caseId: string) {
    navigate(`/projects/${encodeURIComponent(projectId)}/test-scenarios/${scenarioId}?run=${encodeURIComponent(runId)}&case=${encodeURIComponent(caseId)}`)
  }

  // pan / zoom
  const mapRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ x: 70, y: 72, k: 1 })
  const pan = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)

  // wheel must be non-passive to preventDefault the page scroll, which React's
  // synthetic onWheel cannot do — so it is attached by hand.
  useEffect(() => {
    const el = mapRef.current
    if (el === null) return undefined
    function onWheel(event: WheelEvent) {
      event.preventDefault()
      const rect = el!.getBoundingClientRect()
      const cx = event.clientX - rect.left
      const cy = event.clientY - rect.top
      setView((v) => {
        const k = clamp(v.k - event.deltaY * 0.0012, MIN_SCALE, MAX_SCALE)
        const ratio = k / v.k
        return { k, x: cx - (cx - v.x) * ratio, y: cy - (cy - v.y) * ratio }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  function zoomBy(factor: number) {
    const el = mapRef.current
    const rect = el?.getBoundingClientRect()
    const cx = rect ? rect.width / 2 : 0
    const cy = rect ? rect.height / 2 : 0
    setView((v) => {
      const k = clamp(v.k * factor, MIN_SCALE, MAX_SCALE)
      const ratio = k / v.k
      return { k, x: cx - (cx - v.x) * ratio, y: cy - (cy - v.y) * ratio }
    })
  }

  if (status === 'loading') {
    return <div className="run-map-shell"><p className="empty-note">{m.loading}</p></div>
  }
  if (status === 'missing' || status === 'error') {
    return (
      <div className="run-map-shell">
        <div className="panel-message">
          <p>{status === 'missing' ? m.missing : m.loadFailed}</p>
          <Link className="button button--secondary" to={`/projects/${encodeURIComponent(projectId)}`}>{m.back}</Link>
        </div>
      </div>
    )
  }

  // layout: run entry node on the left, scenarios stacked on the right
  const NODE_X = 340
  const NODE_GAP = 168
  const entryY = 40 + Math.max(0, (nodes.length - 1) * NODE_GAP) / 2

  return (
    <div className="run-map" ref={mapRef}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest('.mnode, .cflow, .controls, .legend, .rm-top')) return
        pan.current = { sx: event.clientX, sy: event.clientY, ox: view.x, oy: view.y }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (pan.current === null) return
        setView((v) => ({ ...v, x: pan.current!.ox + (event.clientX - pan.current!.sx), y: pan.current!.oy + (event.clientY - pan.current!.sy) }))
      }}
      onPointerUp={() => { pan.current = null }}
    >
      <header className="rm-top">
        <Link className="st-back" to={`/projects/${encodeURIComponent(projectId)}`}>{m.back}</Link>
        <div className="st-crumb"><span className="scn">{run?.name}</span><span className="id mono">TestRun · #{runId} · {nodes.length} {m.scenarioUnit}</span></div>
        <div className="rm-spacer" />
        <div className="rm-seg">
          <button disabled={nodes.length === 0} onClick={() => nodes.length > 0 && openEdit(nodes[0].id)} type="button">{m.editView}</button>
          <button className="on" type="button">{m.mapView}</button>
        </div>
      </header>

      <div className="legend">
        {STATUSES.map((s) => <span className={`lg ${s}`} key={s}>{t.scenarios.composition.status[s]}</span>)}
      </div>

      <div className="world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        <svg className="edges" width="1200" height={Math.max(600, nodes.length * NODE_GAP + 120)}>
          {nodes.map((_, index) => {
            const y = 40 + index * NODE_GAP + 48
            return <path className="edge" d={`M 210 ${entryY + 40} C 275 ${entryY + 40} 275 ${y} ${NODE_X} ${y}`} key={index} />
          })}
        </svg>

        <div className="mentry" style={{ left: 24, top: entryY }}>
          <div className="lbl"><span className="d" />TestRun</div>
          <div className="sub mono">#{runId} · {nodes.length} {m.scenarioUnit}</div>
          <div className="sub">{run?.name}</div>
        </div>

        {nodes.map((node, index) => {
          const st = nodeStatus(node)
          const bar = STATUSES.filter((s) => node.rollup[s] > 0)
          const top = 40 + index * NODE_GAP
          const expanded = expandedIds.has(node.id)
          return (
            <Fragment key={node.id}>
              <div className={'mnode' + (expanded ? ' expanded' : '')} style={{ left: NODE_X, top }}
                onClick={() => toggleExpand(node.id)}
                role="button" tabIndex={0}
              >
                <div className="mname">{node.title}</div>
                <div className="mmeta mono">#{node.id} · {node.total} {m.caseUnit} · {expanded ? m.collapse : m.expand}</div>
                <div className="vbar">
                  {node.total === 0 ? <i className="empty" style={{ flex: 1 }} /> :
                    bar.map((s) => <i className={s} key={s} style={{ flex: node.rollup[s] }} />)}
                </div>
                <div className="mroll">
                  {bar.length === 0 ? <span className="k">—</span> :
                    bar.map((s) => <span className={`k ${s}`} key={s}><b>{node.rollup[s]}</b> {t.scenarios.composition.status[s]}</span>)}
                </div>
                <span className={`vdot ${st}`} style={{ position: 'absolute', top: 14, right: 14 }} />
                <button className="mnode-open" onClick={(event) => { event.stopPropagation(); openEdit(node.id) }} type="button">{m.openHint}</button>
              </div>

              {expanded && (
                <div className="cflow" style={{ left: NODE_X + 300, top: top + 42 }}>
                  {node.cases.length === 0 ? (
                    <>
                      <span className="cflow-link" />
                      <div className="cnode cnode--empty">{m.noCases}</div>
                    </>
                  ) : (
                    node.cases.map((testCase, j) => (
                      <Fragment key={testCase.id}>
                        <span className="cflow-link" />
                        <button className="cnode" onClick={() => openCase(node.id, testCase.id)} type="button">
                          <span className="cnode-row">
                            <span className="cnode-num mono">{String(j + 1).padStart(2, '0')}</span>
                            <span className="cnode-title">{testCase.title.length > 0 ? testCase.title : testCase.id}</span>
                            <span className={`vdot ${testCase.status}`} />
                          </span>
                          <CategoryChip category={testCase.category} />
                        </button>
                      </Fragment>
                    ))
                  )}
                </div>
              )}
            </Fragment>
          )
        })}
      </div>

      <div className="controls">
        <button className="ctrl" onClick={() => zoomBy(1 / 1.15)} type="button">−</button>
        <span className="zoom-label mono">{Math.round(view.k * 100)}%</span>
        <button className="ctrl" onClick={() => zoomBy(1.15)} type="button">＋</button>
        <button className="ctrl" onClick={() => setView({ x: 70, y: 72, k: 1 })} type="button">{m.fit}</button>
      </div>

      {nodes.length === 0 && <p className="rm-empty empty-note">{m.empty}</p>}
    </div>
  )
}
