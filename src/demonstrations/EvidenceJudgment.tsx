import { useEffect, useRef, useState } from 'react'
import { judgmentAnnotation } from './evidence'
import { useI18n } from '../i18n/useI18n'
import type { AnnotationInput, DemonstrationEvent, EvidencePayload, Outcome, Region } from './types'

function readEvidence(event: DemonstrationEvent): EvidencePayload {
  try {
    const payload: unknown = JSON.parse(event.payloadJson)
    return typeof payload === 'object' && payload !== null && 'viewUrl' in payload && typeof payload.viewUrl === 'string'
      ? { viewUrl: payload.viewUrl } : {}
  } catch { return {} }
}

export function EvidenceJudgment({ evidence, expectedResult, busy, onSave }: {
  evidence: DemonstrationEvent; expectedResult: string; busy: boolean; onSave: (annotation: AnnotationInput) => void
}) {
  const { t } = useI18n()
  const copy = t.demonstrations
  const section = useRef<HTMLElement>(null)
  useEffect(() => { section.current?.focus() }, [])
  const payload = readEvidence(evidence)
  const [region, setRegion] = useState<Region | null>(null)
  const [explanation, setExplanation] = useState('')
  const [advanced, setAdvanced] = useState(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  function point(event: React.PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) }
  }
  const validRegion = region === null || (region.width > 0 && region.height > 0 && region.x >= 0 && region.y >= 0 && region.x + region.width <= 1.00001 && region.y + region.height <= 1.00001)
  return <section ref={section} tabIndex={-1} aria-label={copy.outcome}>
    <h3>{copy.evidence} #{evidence.id}</h3>
    <div className="demo-evidence" onPointerDown={(event) => {
      if (!advanced) return
      event.preventDefault(); start.current = point(event); event.currentTarget.setPointerCapture(event.pointerId)
    }} onPointerMove={(event) => {
      if (!start.current) return
      const end = point(event)
      setRegion({ x: Math.min(start.current.x, end.x), y: Math.min(start.current.y, end.y), width: Math.abs(end.x - start.current.x), height: Math.abs(end.y - start.current.y) })
    }} onPointerUp={() => { start.current = null }} onPointerCancel={() => { start.current = null }}>
      {payload.viewUrl && <EvidenceImage url={payload.viewUrl} alt={`${copy.evidence} ${evidence.id}`} />}
      {region && <span className="demo-region" style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }} />}
    </div>
    <p className="demo-hint">{copy.expected}: {expectedResult}</p>
    <fieldset disabled={busy}>
      <label>{copy.optionalExplanation}<textarea value={explanation} onChange={(event) => setExplanation(event.target.value)} /></label>
      <div className="demo-actions" role="group" aria-label={copy.outcome}>
        {(['PASS', 'FAIL', 'INCONCLUSIVE'] as Outcome[]).map((outcome) => <button key={outcome} type="button" className="button button--secondary" disabled={!payload.viewUrl || !validRegion} onClick={() => onSave(judgmentAnnotation(outcome, evidence.id, explanation, region))}>{outcome === 'PASS' ? copy.pass : outcome === 'FAIL' ? copy.fail : copy.inconclusive}</button>)}
      </div>
      <details onToggle={(event) => setAdvanced(event.currentTarget.open)}>
        <summary>{copy.region}</summary>
        <p className="demo-hint">{copy.regionHint}</p>
        <div className="demo-region-fields">{(['x', 'y', 'width', 'height'] as const).map((key) => <label key={key}>{key}<input type="number" min="0" max="1" step="0.01" value={(region ?? { x: 0, y: 0, width: 1, height: 1 })[key]} onChange={(event) => setRegion({ ...(region ?? { x: 0, y: 0, width: 1, height: 1 }), [key]: Number(event.target.value) })} /></label>)}</div>
        <button type="button" onClick={() => setRegion(null)}>{copy.clearRegion}</button>
      </details>
    </fieldset>
  </section>
}

function EvidenceImage({ url, alt }: { url: string; alt: string }) {
  const [source, setSource] = useState({ url, failed: false })
  // 같은 이벤트의 이미지는 고정하고, 로드 실패 때만 새 서명 URL로 재시도한다.
  if (source.failed && source.url !== url) setSource({ url, failed: false })
  return <img src={source.url} alt={alt} draggable={false} onError={() => setSource((previous) => ({ ...previous, failed: true }))} />
}
