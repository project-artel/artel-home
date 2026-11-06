/** 인증된 `/ws/viewer`에서 control과 JPEG frame을 함께 받는다. */
export type StreamId = string
export const STREAM_TRANSPORT = 'JPEG_WS'
export const MAX_STREAM_JPEG_BYTES = 128 * 1024
export const MAX_STREAM_MESSAGE_CHARS = 184 * 1024
export const MAX_STREAM_WIDTH = 1920
export const MAX_STREAM_HEIGHT = 1080

export type SdkStreamState = 'CONNECTING' | 'LIVE' | 'FAILED' | 'STOPPED'
export type StreamReadyMessage = {
  type: 'STREAM_READY'
  streamId: StreamId
  /** 빈 값도 읽어서 이전 서버와의 계약 불일치를 명시적으로 처리한다. */
  transport: string
}
export type StreamFrameMessage = {
  type: 'STREAM_FRAME'
  streamId: StreamId
  frameId: number
  jpeg: string
}
export type StreamStateMessage = {
  type: 'STREAM_STATE'
  streamId: StreamId
  state: SdkStreamState
  error: string | null
}
export type StreamErrorMessage = {
  type: 'STREAM_ERROR' | 'ERROR'
  streamId: StreamId | null
  code: string
  message: string
}
export type ViewerMessage = StreamReadyMessage | StreamFrameMessage | StreamStateMessage | StreamErrorMessage
export type ViewerCommand = { type: 'RENEW' } | { type: 'STOP' }

/** 교체는 수동 복구하고, 연결되지 않은 게임은 주기적으로 다시 확인한다. */
export const VIEWER_CLOSE_CODE = {
  malformedInstance: 4003,
  takenOver: 4009,
  notPermitted: 4403,
  gameOffline: 4404,
} as const
export type GameStreamStatus = 'connecting' | 'live' | 'reconnecting' | 'takenOver' | 'offline' | 'error'
export type GameStreamFailure = 'unreachable' | 'notPermitted' | 'signalling'
