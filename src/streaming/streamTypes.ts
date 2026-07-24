/**
 * The `/ws/viewer` signalling contract, as
 * `artel-orchestration-server/docs/streaming-protocol.md` defines it.
 *
 * Only signalling travels over this socket — the video is a peer connection
 * between the browser and the game, and no frame ever reaches the orchestration
 * server. Names here are the wire names; renaming one to read better on this
 * side would silently break the contract the SDK and the server implement.
 */

/**
 * One watching session, minted by the server when a viewer is admitted.
 *
 * Every message carries it even though at most one session is live per
 * instance. Under the takeover policy a displaced peer's last ICE candidates
 * are still in flight while its replacement negotiates, and applying one to the
 * new peer corrupts that negotiation — the id is what lets both ends drop them.
 */
export type StreamId = string

/** `RTCIceCandidateInit` as the protocol spells it; assignable to it as-is. */
export type StreamIceCandidate = {
  candidate: string
  sdpMid: string | null
  sdpMLineIndex: number | null
}

/**
 * Delivered by the server rather than compiled into the client, for the same
 * reason it is not compiled into the SDK: which STUN/TURN host is contacted is
 * a deployment choice. Shaped to be assignable to `RTCIceServer`.
 */
export type StreamIceServer = {
  urls: string[]
  username?: string
  credential?: string
}

/** What the SDK reports about its own side of the peer connection. */
export type SdkStreamState = 'CONNECTING' | 'LIVE' | 'FAILED' | 'STOPPED'

export type StreamReadyMessage = {
  type: 'STREAM_READY'
  streamId: StreamId
  iceServers: StreamIceServer[]
}

/** The SDK offers; this client only ever answers. See "Roles" in the protocol doc. */
export type StreamOfferMessage = {
  type: 'WEBRTC_OFFER'
  streamId: StreamId
  sdp: string
}

export type StreamIceMessage = {
  type: 'WEBRTC_ICE'
  streamId: StreamId
  candidate: StreamIceCandidate
}

export type StreamStateMessage = {
  type: 'STREAM_STATE'
  streamId: StreamId
  state: SdkStreamState
  error: string | null
}

export type StreamErrorMessage = {
  type: 'ERROR'
  code: string
  message: string
}

export type ViewerMessage =
  | StreamReadyMessage
  | StreamOfferMessage
  | StreamIceMessage
  | StreamStateMessage
  | StreamErrorMessage

/**
 * What the browser sends. `RENEW` and `STOP` carry no fields: the server knows
 * which session the socket holds, and a `streamId` from this side would only
 * be a second opinion about it.
 */
export type ViewerCommand =
  | { type: 'RENEW' }
  | { type: 'STOP' }
  | { type: 'WEBRTC_ANSWER'; streamId: StreamId; sdp: string }
  | { type: 'WEBRTC_ICE'; streamId: StreamId; candidate: StreamIceCandidate }

/**
 * The close codes the viewer socket can be refused or displaced with.
 *
 * They are not interchangeable: `takenOver` is terminal because two tabs that
 * both reconnect on being displaced evict each other forever, while
 * `gameOffline` is a wait that resolves on its own when the game starts.
 */
export const VIEWER_CLOSE_CODE = {
  malformedInstance: 4003,
  takenOver: 4009,
  notPermitted: 4403,
  gameOffline: 4404,
} as const

export type GameStreamStatus =
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'takenOver'
  | 'offline'
  | 'error'

/**
 * Why an `error` status happened, because the three need different words.
 *
 * `unreachable` is the one that must not read as a generic fault: without TURN
 * a game and a browser on different networks negotiate successfully and then
 * carry no media, and calling that "the stream broke" gets a network limitation
 * filed as a bug.
 */
export type GameStreamFailure = 'unreachable' | 'notPermitted' | 'signalling'
