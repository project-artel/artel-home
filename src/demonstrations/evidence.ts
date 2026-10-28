import type { AnnotationInput, EvidenceInput, Outcome, Region } from './types'

export function captureVideoFrame(video: HTMLVideoElement): EvidenceInput {
  if (!video.videoWidth || !video.videoHeight) throw new Error('frame unavailable')
  const scale = Math.min(1, 1920 / video.videoWidth, 1080 / video.videoHeight)
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(video.videoWidth * scale)
  canvas.height = Math.floor(video.videoHeight * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas unavailable')
  const capturedAt = new Date().toISOString()
  context.drawImage(video, 0, 0, canvas.width, canvas.height)
  const dataUrl = canvas.toDataURL('image/png')
  if ((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4 > 2 * 1024 * 1024) throw new Error('frame too large')
  return { dataUrl, capturedAt, width: canvas.width, height: canvas.height }
}

/** 자동 장면 저장은 전송 중 하나와 가장 최근 대기 장면 하나만 보유한다. 판정 장면과는 별도다. */
export class BoundaryCaptureQueue {
  private saving = false
  private stopped = false
  private pending: EvidenceInput | null = null
  private save: (frame: EvidenceInput) => Promise<void>
  private failed: () => void
  constructor(save: (frame: EvidenceInput) => Promise<void>, failed: () => void) { this.save = save; this.failed = failed }
  enqueue(frame: EvidenceInput) {
    if (this.stopped) return
    this.pending = frame
    if (!this.saving) void this.flush()
  }
  dispose() { this.stopped = true; this.pending = null }
  private async flush() {
    const frame = this.pending
    if (!frame || this.stopped) return
    this.pending = null; this.saving = true
    try { await this.save(frame) } catch { if (!this.stopped) this.failed() }
    finally { this.saving = false }
    if (!this.stopped && this.pending) void this.flush()
  }
}

export function judgmentAnnotation(outcome: Outcome, evidenceEventId: number, explanation: string, region: Region | null): AnnotationInput {
  return { outcome, evidenceEventId, ...(explanation.trim() ? { explanation: explanation.trim() } : {}), ...(region ? { region } : {}) }
}
