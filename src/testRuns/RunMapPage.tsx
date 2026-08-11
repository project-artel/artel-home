import { Fragment, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { getTestScenario } from '../testScenarios/scenarioApi'
import { groupStepsByCase } from '../testScenarios/scenarioTypes'
import { getRunScenarios, getTestRun, type TestRun } from './testRunApi'

/**
 * The TestRun map — a read-only visualisation of a run and the scenarios it
 * bundles. Each scenario is a node summarising its STEP model (step count + how
 * many TC verification regions); expanding one shows the ordered steps, with a
 * "TC n" badge on the steps that make up each verification region. Clicking opens
 * that scenario's editor. Read-only: no repositioning, no run composition changes,
 * no chat.
 */

/** One step, flattened for the map: its action and the TC region ordinal (if any). */
type StepLite = { action: string; tcNo: number | null }

type ScenarioNode = {
  id: string
  title: string
  stepCount: number
  tcCount: number
  steps: StepLite[]
}

const MIN_SCALE = 0.4
const MAX_SCALE = 1.6

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value))
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
        const [runData, items] = await Promise.all([
          getTestRun(projectId, runId, signal),
          getRunScenarios(projectId, runId, signal),
        ])
        if (runData === null) {
          setStatus('missing')
          return
        }
        const built = await Promise.all(
          items.map(async (item): Promise<ScenarioNode> => {
            const scenario = await getTestScenario(Number(item.testScenarioId), signal).catch(() => null)
            const steps = scenario?.payload.steps ?? []
            // TC region ordinals: consecutive same case_id = one region (as in the editor).
            const tcNoByIndex = new Map<number, number>()
            let seq = 0
            for (const group of groupStepsByCase(steps)) {
              if (group.caseId === null) continue
              seq += 1
              for (const idx of group.indices) tcNoByIndex.set(idx, seq)
            }
            const title = scenario?.payload.title ?? ''
            return {
              id: item.testScenarioId,
              title: title.length > 0 ? title : m.untitledScenario,
              stepCount: steps.length,
              tcCount: seq,
              steps: steps.map((step, index) => ({
                action: step.action,
                tcNo: tcNoByIndex.get(index) ?? null,
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
        // Capture the ref once: pointerup can null it out between reads (inside
        // the setState updater), which crashed on `.ox`.
        const start = pan.current
        if (start === null) return
        const dx = event.clientX - start.sx
        const dy = event.clientY - start.sy
        setView((v) => ({ ...v, x: start.ox + dx, y: start.oy + dy }))
      }}
      onPointerUp={() => { pan.current = null }}
      onPointerCancel={() => { pan.current = null }}
    >
      <header className="rm-top">
        <Link className="st-back" to={`/projects/${encodeURIComponent(projectId)}`}>{m.back}</Link>
        <div className="st-crumb"><span className="scn">{run?.name}</span><span className="id mono">TestRun · {nodes.length} {m.scenarioUnit}</span></div>
        <div className="rm-spacer" />
        <div className="rm-seg">
          <button onClick={() => navigate(`/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(runId)}/edit`)} type="button">{m.editView}</button>
          <button className="on" type="button">{m.mapView}</button>
        </div>
      </header>

      <div className="world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        <svg className="edges" width="1200" height={Math.max(600, nodes.length * NODE_GAP + 120)}>
          {nodes.map((_, index) => {
            const y = 40 + index * NODE_GAP + 48
            return <path className="edge" d={`M 210 ${entryY + 40} C 275 ${entryY + 40} 275 ${y} ${NODE_X} ${y}`} key={index} />
          })}
        </svg>

        <div className="mentry" style={{ left: 24, top: entryY }}>
          <div className="lbl"><span className="d" />TestRun</div>
          <div className="sub mono">{nodes.length} {m.scenarioUnit}</div>
          <div className="sub">{run?.name}</div>
        </div>

        {nodes.map((node, index) => {
          const top = 40 + index * NODE_GAP
          const expanded = expandedIds.has(node.id)
          return (
            <Fragment key={node.id}>
              <div className={'mnode' + (expanded ? ' expanded' : '')} style={{ left: NODE_X, top }}
                onClick={() => toggleExpand(node.id)}
                role="button" tabIndex={0}
              >
                <div className="mname">{node.title}</div>
                <div className="mmeta mono">
                  {node.stepCount} {m.stepUnit}{node.tcCount > 0 ? ` · ${node.tcCount} ${m.tcUnit}` : ''} · {expanded ? m.collapse : m.expandSteps}
                </div>
                <button className="mnode-open" onClick={(event) => { event.stopPropagation(); openEdit(node.id) }} type="button">{m.openHint}</button>
              </div>

              {expanded && (
                <div className="cflow" style={{ left: NODE_X + 300, top: top + 42 }}>
                  {node.steps.length === 0 ? (
                    <>
                      <span className="cflow-link" />
                      <div className="cnode cnode--empty">{m.noSteps}</div>
                    </>
                  ) : (
                    node.steps.map((step, j) => (
                      <Fragment key={j}>
                        <span className="cflow-link" />
                        <button className={'cnode' + (step.tcNo !== null ? ' cnode--tc' : '')} onClick={() => openEdit(node.id)} type="button">
                          <span className="cnode-row">
                            <span className="cnode-num mono">{String(j + 1).padStart(2, '0')}</span>
                            <span className="cnode-title">{step.action.length > 0 ? step.action : m.untitledStep}</span>
                            {step.tcNo !== null && <span className="st-tc-badge">{m.tcUnit} {step.tcNo}</span>}
                          </span>
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
