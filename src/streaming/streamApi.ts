import { orchestrationUrlFor } from '../auth/authApi'
import { asRecord, asString } from '../projects/projectApi'
import type {
  SdkStreamState,
  StreamIceCandidate,
  StreamIceServer,
  ViewerMessage,
} from './streamTypes'

/*
 * The viewer socket is neither `fetch` nor `EventSource`, so `apiFetch` cannot
 * cover it. It carries the same `artel_access_token` cookie as everything else:
 * the browser attaches it to the handshake on its own, and no credential goes
 * into the query string, which would put it into server logs.
 *
 * That cookie is `SameSite=Lax`, so this only works while the client and the
 * orchestration server share a registrable domain. Split them and every viewer
 * handshake silently loses its cookie and 401s.
 */

/**
 * The `ws(s)://` address of one instance's viewer socket.
 *
 * The scheme swap is anchored to the start so a path or a host that happens to
 * contain `http` is left alone, and it turns `https` into `wss` by the same
 * substitution rather than needing a second branch.
 */
export function viewerStreamUrl(instanceId: string): string {
  const url = orchestrationUrlFor(`/ws/viewer?instanceId=${encodeURIComponent(instanceId)}`)
  return url.replace(/^http/, 'ws')
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asSdkStreamState(value: unknown): SdkStreamState | null {
  return value === 'CONNECTING' || value === 'LIVE' || value === 'FAILED' || value === 'STOPPED'
    ? value
    : null
}

/**
 * `urls` is accepted as a string or an array because `RTCIceServer` allows
 * both and the server's configuration is a comma-separated list. An entry with
 * no usable URL is dropped rather than defaulted: a fabricated STUN host would
 * send every viewer's ICE at somebody else's server.
 */
function parseIceServer(data: unknown): StreamIceServer | null {
  const record = asRecord(data)
  if (record === null) return null

  const raw = record.urls
  const urls = (typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : []).filter(
    (url): url is string => typeof url === 'string' && url.length > 0,
  )
  if (urls.length === 0) return null

  const username = asString(record.username)
  const credential = asString(record.credential)

  return {
    urls,
    ...(username.length > 0 ? { username } : {}),
    ...(credential.length > 0 ? { credential } : {}),
  }
}

/**
 * `sdpMid` and `sdpMLineIndex` are both nullable in the WebRTC API, so they are
 * carried through as `null` instead of being defaulted — guessing an m-line
 * index attaches a candidate to the wrong media section.
 */
function parseIceCandidate(data: unknown): StreamIceCandidate | null {
  const record = asRecord(data)
  if (record === null) return null

  const candidate = asString(record.candidate)
  if (candidate.length === 0) return null

  return {
    candidate,
    sdpMid: typeof record.sdpMid === 'string' ? record.sdpMid : null,
    sdpMLineIndex: asNullableNumber(record.sdpMLineIndex),
  }
}

/**
 * Reads one signalling frame.
 *
 * Anything unrecognised or missing the fields its type requires returns `null`
 * and is dropped by the caller. A frame this client cannot read is not a reason
 * to tear down a peer connection that is already carrying video, and the server
 * is free to add message types this release does not know about.
 */
export function parseViewerMessage(data: string): ViewerMessage | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return null
  }

  const record = asRecord(parsed)
  if (record === null) return null

  if (record.type === 'ERROR') {
    return { type: 'ERROR', code: asString(record.code), message: asString(record.message) }
  }

  // Every remaining type is scoped to one watching session, and one that cannot
  // be identified cannot be matched against the live session.
  const streamId = asString(record.streamId)
  if (streamId.length === 0) return null

  if (record.type === 'STREAM_READY') {
    return {
      type: 'STREAM_READY',
      streamId,
      iceServers: (Array.isArray(record.iceServers) ? record.iceServers : [])
        .map(parseIceServer)
        .filter((server): server is StreamIceServer => server !== null),
    }
  }

  if (record.type === 'WEBRTC_OFFER') {
    const sdp = asString(record.sdp)
    return sdp.length === 0 ? null : { type: 'WEBRTC_OFFER', streamId, sdp }
  }

  if (record.type === 'WEBRTC_ICE') {
    const candidate = parseIceCandidate(record.candidate)
    return candidate === null ? null : { type: 'WEBRTC_ICE', streamId, candidate }
  }

  if (record.type === 'STREAM_STATE') {
    const state = asSdkStreamState(record.state)
    return state === null
      ? null
      : {
          type: 'STREAM_STATE',
          streamId,
          state,
          error: typeof record.error === 'string' ? record.error : null,
        }
  }

  return null
}
