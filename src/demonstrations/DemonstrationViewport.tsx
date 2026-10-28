import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { useGameStream } from '../streaming/useGameStream'
import { unityButton, unityKey, videoPoint } from './control'
import { useControl } from './useControl'
import { BoundaryCaptureQueue, captureCanvasFrame } from './evidence'
import type { EvidenceInput } from './types'

export function DemonstrationViewport({ sessionId, instanceId, onInterrupted, onCapture, onBoundaryCapture, onFinish, onFreeze, busy, active }: {
  sessionId: string; instanceId: number; onInterrupted: () => void
  onCapture: (evidence: EvidenceInput) => Promise<void>; onFinish: () => Promise<void>; busy: boolean; active: boolean
  onBoundaryCapture: (evidence: EvidenceInput) => Promise<void>; onFreeze: () => void
}) {
  const { t } = useI18n()
  const copy = t.demonstrations
  const canvas = useRef<HTMLCanvasElement>(null)
  const heldKeys = useRef(new Set<string>())
  const heldButtons = useRef(new Set<number>())
  const ended = useRef(false)
  const captureInProgress = useRef(false)
  const boundaryQueue = useRef<BoundaryCaptureQueue | null>(null)
  const boundarySave = useRef(onBoundaryCapture)
  const boundaryAfterFrame = useRef(true)
  const lastBoundaryAt = useRef(0)
  const boundaryCount = useRef(0)
  const control = useControl(sessionId, onInterrupted, active)
  const { stop } = control
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [hasFrame, setHasFrame] = useState(false)
  const [judging, setJudging] = useState(false)
  const [captured, setCaptured] = useState<EvidenceInput | null>(null)
  const lastFrameAt = useRef(0)
  useEffect(() => { boundarySave.current = onBoundaryCapture }, [onBoundaryCapture])
  useEffect(() => {
    const queue = new BoundaryCaptureQueue((frame) => boundarySave.current(frame), () => setCaptureError(copy.captureFailure))
    boundaryQueue.current = queue
    return () => queue.dispose()
  }, [copy.captureFailure])
  const captureBoundary = useCallback(() => {
    if (ended.current || boundaryCount.current >= 60) return true
    if (!canvas.current || performance.now() - lastBoundaryAt.current < 250) return false
    lastBoundaryAt.current = performance.now()
    try { boundaryQueue.current?.enqueue(captureCanvasFrame(canvas.current)); boundaryCount.current += 1 }
    catch { setCaptureError(copy.captureFailure) }
    return true
  }, [copy.captureFailure])
  const drawFrame = useCallback((frame: ImageBitmap) => {
    if (ended.current || !canvas.current) return
    const target = canvas.current
    if (target.width !== frame.width || target.height !== frame.height) {
      target.width = frame.width
      target.height = frame.height
    }
    const context = target.getContext('2d')
    if (!context) throw new Error('canvas unavailable')
    context.drawImage(frame, 0, 0)
    lastFrameAt.current = performance.now()
    setHasFrame(true)
    if (boundaryAfterFrame.current && captureBoundary()) boundaryAfterFrame.current = false
  }, [captureBoundary])
  const stream = useGameStream(String(instanceId), drawFrame, true)
  const interrupt = useCallback(() => {
    if (ended.current) return
    ended.current = true
    stop(); onInterrupted()
  }, [stop, onInterrupted])
  useEffect(() => {
    if (!active) { ended.current = true; stop() }
  }, [active, stop])
  useEffect(() => {
    if (stream.status !== 'live' && stream.status !== 'connecting') interrupt()
  }, [stream.status, interrupt])
  useEffect(() => {
    lastFrameAt.current = performance.now()
    const timer = setInterval(() => {
      if (performance.now() - lastFrameAt.current > 8000) interrupt()
    }, 1000)
    return () => clearInterval(timer)
  }, [interrupt])

  const enabled = !judging && active && control.ready && stream.status === 'live' && hasFrame
  function move(clientX: number, clientY: number) {
    const element = canvas.current
    if (!enabled || !element) return false
    const point = videoPoint(clientX, clientY, element.getBoundingClientRect(), element.width, element.height)
    return point !== null && control.send({ method: 'move_mouse', params: [point.x, point.y] })
  }
  function releaseHeldInputs() {
    for (const key of heldKeys.current) control.send({ method: 'key_up', params: [key] })
    for (const button of heldButtons.current) control.send({ method: 'mouse_up', params: [button] })
    heldKeys.current.clear(); heldButtons.current.clear()
  }
  async function capture() {
    if (captureInProgress.current) return
    captureInProgress.current = true
    setCaptureError(null)
    try {
      let evidence = captured
      if (evidence === null) {
        const element = canvas.current
        if (!hasFrame || !element || element.width === 0) return
        evidence = captureCanvasFrame(element)
        setCaptured(evidence)
      }
      onFreeze()
      setJudging(true)
      ended.current = true
      boundaryQueue.current?.dispose()
      releaseHeldInputs()
      try { await onFinish() } finally { stop() }
      await onCapture(evidence)
      setCaptured(null)
    } catch (error) { setCaptureError(error instanceof Error && error.message === 'frame too large' ? copy.tooLarge : copy.captureFailure) }
    finally { captureInProgress.current = false }
  }
  return <section className="demo-live">
    <p role="status">{judging ? copy.judging : !active ? copy.interrupted : enabled ? copy.live : copy.connecting}</p>
    <div className="demo-viewport" tabIndex={enabled ? 0 : -1} role="group" aria-label={copy.live}
      onContextMenu={(event) => event.preventDefault()}
      onBlur={releaseHeldInputs}
      onPointerMove={(event) => { if (event.pointerType !== 'touch') move(event.clientX, event.clientY) }}
      onPointerDown={(event) => {
        if (event.pointerType === 'touch') return
        const button = unityButton(event.button)
        if (enabled) captureBoundary()
        if (button === null || !move(event.clientX, event.clientY)) return
        event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId)
        heldButtons.current.add(button)
        control.send({ method: 'mouse_down', params: [button] })
      }}
      onPointerUp={(event) => {
        const button = unityButton(event.button)
        if (button === null || !heldButtons.current.has(button)) return
        move(event.clientX, event.clientY)
        control.send({ method: 'mouse_up', params: [button] })
        heldButtons.current.delete(button)
        boundaryAfterFrame.current = true
        event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onPointerCancel={interrupt}
      onLostPointerCapture={() => { if (heldButtons.current.size) interrupt() }}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.code === 'Escape') { event.preventDefault(); interrupt(); return }
        if (!enabled) return
        const key = unityKey(event.code)
        if (!key) return
        event.preventDefault()
        if (event.repeat) return
        captureBoundary()
        heldKeys.current.add(key); control.send({ method: 'key_down', params: [key] })
      }}
      onKeyUp={(event) => {
        event.stopPropagation()
        const key = unityKey(event.code)
        if (!key || !heldKeys.current.has(key)) return
        event.preventDefault(); heldKeys.current.delete(key); control.send({ method: 'key_up', params: [key] })
        boundaryAfterFrame.current = true
      }}>
      <canvas ref={canvas} role="img" aria-label={copy.live} />
    </div>
    <p className="demo-hint">{copy.controlHint}</p>
    <p className="demo-mobile">{copy.mobile}</p>
    <div className="demo-actions">
      <button className="button button--secondary" disabled={busy || (judging && captured === null) || (!hasFrame && captured === null)} onClick={() => void capture()}>{captured ? copy.refresh : copy.capture}</button>
      {active && !judging && <button className="button button--secondary" onClick={() => void onFinish().catch(() => setCaptureError(copy.failure))}>{copy.stop}</button>}
    </div>
    {captureError && <p role="alert" className="inline-error">{captureError}</p>}
    {captured && <img className="demo-captured" src={captured.dataUrl} alt={copy.evidence} />}
  </section>
}
