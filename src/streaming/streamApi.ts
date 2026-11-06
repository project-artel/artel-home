import { orchestrationUrlFor } from '../auth/authApi'
import { asRecord, asString } from '../projects/projectApi'
import { MAX_STREAM_JPEG_BYTES, MAX_STREAM_MESSAGE_CHARS, type SdkStreamState, type ViewerMessage } from './streamTypes'

/** 인증 cookie는 WebSocket handshake에 붙으며 URL에 자격증명을 넣지 않는다. */
export function viewerStreamUrl(instanceId: string): string {
  return orchestrationUrlFor(`/ws/viewer?instanceId=${encodeURIComponent(instanceId)}`).replace(/^http/, 'ws')
}

function asSdkStreamState(value: unknown): SdkStreamState | null {
  return value === 'CONNECTING' || value === 'LIVE' || value === 'FAILED' || value === 'STOPPED' ? value : null
}

export function parseViewerMessage(data: string): ViewerMessage | null {
  if (data.length > MAX_STREAM_MESSAGE_CHARS) return null
  let parsed: unknown
  try { parsed = JSON.parse(data) } catch { return null }
  const record = asRecord(parsed)
  if (record === null) return null
  const streamId = asString(record.streamId)
  if (record.type === 'ERROR' || record.type === 'STREAM_ERROR') {
    return { type: record.type, streamId: streamId || null, code: asString(record.code), message: asString(record.message) }
  }
  if (streamId.length === 0 || streamId.length > 128) return null
  if (record.type === 'STREAM_READY') return { type: 'STREAM_READY', streamId, transport: asString(record.transport) }
  if (record.type === 'STREAM_FRAME') {
    const frameId = record.frameId
    const jpeg = asString(record.jpeg)
    if (typeof frameId !== 'number' || !Number.isSafeInteger(frameId) || frameId < 1 ||
      jpeg.length === 0 || jpeg.length > Math.ceil(MAX_STREAM_JPEG_BYTES / 3) * 4) return null
    return { type: 'STREAM_FRAME', streamId, frameId, jpeg }
  }
  if (record.type === 'STREAM_STATE') {
    const state = asSdkStreamState(record.state)
    return state === null ? null : { type: 'STREAM_STATE', streamId, state, error: typeof record.error === 'string' ? record.error : null }
  }
  return null
}
