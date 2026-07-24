import { useCallback, useEffect, useRef, useState } from 'react'
import { parseViewerMessage, viewerStreamUrl } from './streamApi'
import {
  VIEWER_CLOSE_CODE,
  type GameStreamFailure,
  type GameStreamStatus,
  type StreamIceServer,
  type ViewerCommand,
} from './streamTypes'

/**
 * The lease is 15s at the SDK, so renewing at 10s survives one lost renew
 * before the game tears the peer down. The timer that matters lives in the SDK
 * on purpose — a closed laptop lid stops these renews without anyone being able
 * to send a `STOP`.
 */
const RENEW_INTERVAL_MS = 10_000

/**
 * A game that is not running yet is a wait, not a fault, so this polls at a
 * steady rate instead of backing off: the user is watching for a game they are
 * about to start, and a delay that grows to a minute reads as broken.
 */
const OFFLINE_RETRY_MS = 5_000

const FIRST_RECONNECT_MS = 1_000
const MAX_RECONNECT_MS = 10_000

type GameStreamState = {
  status: GameStreamStatus
  failure: GameStreamFailure | null
  stream: MediaStream | null
}

const initialState: GameStreamState = { status: 'connecting', failure: null, stream: null }

/**
 * Watches one game instance's screen.
 *
 * Owns the viewer socket, the single `RTCPeerConnection`, and the renew ticker.
 * The browser only ever **answers**: the SDK owns the video source, so it makes
 * the offer and this side never has to declare a `recvonly` transceiver up
 * front.
 *
 * Reconnection is modelled as a re-run of the connection effect rather than as
 * a loop inside it, so exactly one socket and one peer exist per attempt and
 * their teardown is the effect's own cleanup. Nothing else has to remember to
 * close them.
 *
 * `takenOver` and `error` are terminal — they schedule nothing and wait for
 * `retry`. Two tabs that both reconnect on being displaced would evict each
 * other indefinitely, burning a peer setup on the game every round, so
 * recovering from a takeover has to be something a person asked for.
 */
export function useGameStream(instanceId: string) {
  const [state, setState] = useState<GameStreamState>(initialState)
  /** Bumped to start a fresh attempt; the connection effect depends on it. */
  const [attempt, setAttempt] = useState(0)
  const consecutiveFailures = useRef(0)

  const retry = useCallback(() => {
    consecutiveFailures.current = 0
    setState((previous) => ({ ...previous, status: 'connecting', failure: null }))
    setAttempt((previous) => previous + 1)
  }, [])

  useEffect(() => {
    /*
     * Everything below belongs to this one attempt. `active` is what stops a
     * late socket event or a settled promise from writing state that belongs to
     * an attempt the cleanup already discarded.
     */
    let active = true
    let settled = false
    let streamId: string | null = null
    let peer: RTCPeerConnection | null = null
    let renewTimer: number | null = null
    let retryTimer: number | null = null
    let remoteDescribed = false
    /*
     * The SDK sends its offer before its candidates and the socket preserves
     * that order, but applying the offer is asynchronous — a candidate arriving
     * during that await would be rejected with `InvalidStateError`. Holding
     * them costs nothing and is what makes trickle ICE safe here.
     */
    const pendingCandidates: RTCIceCandidateInit[] = []

    const socket = new WebSocket(viewerStreamUrl(instanceId))

    function send(command: ViewerCommand) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(command))
      }
    }

    function stopRenewing() {
      if (renewTimer === null) return
      window.clearInterval(renewTimer)
      renewTimer = null
    }

    // The timer belongs to the attempt that scheduled it, so the cleanup of
    // that same run is what cancels it when the component goes away.
    function scheduleAttempt(delay: number) {
      retryTimer = window.setTimeout(() => setAttempt((previous) => previous + 1), delay)
    }

    /** 1s, 2s, 4s… capped, so a server restart is picked up fast and an outage is not hammered. */
    function nextReconnectDelay(): number {
      const delay = Math.min(FIRST_RECONNECT_MS * 2 ** consecutiveFailures.current, MAX_RECONNECT_MS)
      consecutiveFailures.current += 1
      return delay
    }

    /**
     * Ends this attempt on a status, and reports whether it was the one that
     * ended it. `settled` is what stops the socket's own close event from
     * overwriting a decided outcome with a generic reconnect.
     *
     * The peer is released here rather than left to the cleanup, which only
     * runs on a new attempt or on unmount — neither of which a terminal status
     * reaches. The video element keeps showing its last frame regardless.
     */
    function settle(status: GameStreamStatus, failure: GameStreamFailure | null): boolean {
      if (settled) return false
      settled = true
      stopRenewing()
      socket.close()
      peer?.close()
      peer = null
      setState((previous) => ({ ...previous, status, failure }))
      return true
    }

    function fail(failure: GameStreamFailure) {
      settle('error', failure)
    }

    function applyRemoteCandidate(candidate: RTCIceCandidateInit) {
      // A candidate the peer rejects is one path that will not be tried, not a
      // failed connection: ICE only needs one working pair.
      void peer?.addIceCandidate(candidate).catch(() => undefined)
    }

    async function answerOffer(negotiating: RTCPeerConnection, sdp: string) {
      try {
        await negotiating.setRemoteDescription({ type: 'offer', sdp })
        const answer = await negotiating.createAnswer()
        await negotiating.setLocalDescription(answer)
        if (!active || streamId === null) return

        send({ type: 'WEBRTC_ANSWER', streamId, sdp: answer.sdp ?? '' })
        remoteDescribed = true
        pendingCandidates.splice(0).forEach(applyRemoteCandidate)
      } catch {
        if (!active) return
        // The offer could not be answered, so no media will ever arrive. This is
        // signalling, not connectivity — the peers never got as far as ICE.
        fail('signalling')
      }
    }

    function openPeer(iceServers: StreamIceServer[]): RTCPeerConnection {
      const opened = new RTCPeerConnection({ iceServers })

      opened.addEventListener('track', (event) => {
        if (!active) return
        consecutiveFailures.current = 0
        setState({
          status: 'live',
          failure: null,
          // A track without a stream still has to be rendered, so one is made
          // for it rather than waiting for a grouping the SDK may not send.
          stream: event.streams[0] ?? new MediaStream([event.track]),
        })
      })

      opened.addEventListener('icecandidate', (event) => {
        // The null candidate only means "no more of them"; the SDK gets nothing
        // from being told, and the protocol has no field for it.
        if (event.candidate === null || streamId === null) return
        send({
          type: 'WEBRTC_ICE',
          streamId,
          candidate: {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
          },
        })
      })

      opened.addEventListener('iceconnectionstatechange', () => {
        /*
         * Only `failed` is acted on. `disconnected` is routine — it recovers on
         * its own — and treating it as an error would blank a stream that is
         * about to come back.
         *
         * `failed` is reported as its own state because it is the one outcome a
         * retry cannot fix: with no TURN, a game and a browser on different
         * networks negotiate fine and then carry no media. Left as a spinner it
         * reads as a hang, and a network limitation gets filed as a broken
         * stream.
         */
        if (opened.iceConnectionState === 'failed') {
          fail('unreachable')
        }
      })

      return opened
    }

    socket.addEventListener('message', (event) => {
      if (!active || typeof event.data !== 'string') return

      const message = parseViewerMessage(event.data)
      if (message === null) return

      if (message.type === 'ERROR') {
        fail('signalling')
        return
      }

      if (message.type === 'STREAM_READY') {
        // Replaces rather than assuming it arrives once, matching how the SDK
        // treats a second `STREAM_START`. Anything held for the previous
        // session belongs to a `streamId` that is now stale.
        stopRenewing()
        peer?.close()
        pendingCandidates.length = 0
        remoteDescribed = false

        streamId = message.streamId
        peer = openPeer(message.iceServers)
        // Renewing starts with the session, not with the first frame: the lease
        // is already running at the SDK while the peer is still negotiating.
        renewTimer = window.setInterval(() => send({ type: 'RENEW' }), RENEW_INTERVAL_MS)
        return
      }

      // Signalling for a session that has ended is dropped. Under the takeover
      // policy a displaced peer's candidates overlap its replacement's
      // negotiation as a matter of course, and applying one corrupts it.
      if (message.streamId !== streamId || peer === null) return

      if (message.type === 'WEBRTC_OFFER') {
        void answerOffer(peer, message.sdp)
        return
      }

      if (message.type === 'WEBRTC_ICE') {
        if (remoteDescribed) {
          applyRemoteCandidate(message.candidate)
        } else {
          pendingCandidates.push(message.candidate)
        }
        return
      }

      if (message.state === 'FAILED') {
        // The SDK reports this when its own ICE gives up, which it does rather
        // than letting the browser sit on a lease that will never carry video.
        fail('unreachable')
        return
      }

      if (message.state === 'STOPPED') {
        // The game let the session go. Nothing is wrong with the connection, so
        // this waits for the game the same way a cold start does.
        if (settle('offline', null)) {
          scheduleAttempt(OFFLINE_RETRY_MS)
        }
      }
    })

    socket.addEventListener('close', (event) => {
      if (!active || settled) return

      // Terminal on purpose. An automatic reconnect would take the stream back
      // from whoever just opened it, and two windows doing that evict each
      // other indefinitely, burning a peer setup on the game every round.
      if (event.code === VIEWER_CLOSE_CODE.takenOver) {
        settle('takenOver', null)
        return
      }

      if (event.code === VIEWER_CLOSE_CODE.gameOffline) {
        if (settle('offline', null)) {
          scheduleAttempt(OFFLINE_RETRY_MS)
        }
        return
      }

      if (event.code === VIEWER_CLOSE_CODE.notPermitted) {
        settle('error', 'notPermitted')
        return
      }

      if (event.code === VIEWER_CLOSE_CODE.malformedInstance) {
        // The address names no instance this server will accept, so retrying it
        // asks the same rejected question again.
        settle('error', 'signalling')
        return
      }

      /*
       * Anything else is the transport: a restarted server, a dropped network,
       * a proxy timing the socket out. The last frame stays on screen under a
       * reconnecting notice rather than being blanked — it is evidence, as long
       * as nothing presents it as live.
       */
      if (settle('reconnecting', null)) {
        scheduleAttempt(nextReconnectDelay())
      }
    })

    return () => {
      active = false
      stopRenewing()
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer)
      }
      // `STOP` releases the lease now instead of leaving the game encoding for
      // nobody until it expires. It is best-effort by nature: the case this
      // cannot cover is exactly why the SDK runs its own dead-man timer.
      send({ type: 'STOP' })
      socket.close()
      peer?.close()
    }
  }, [attempt, instanceId])

  return { status: state.status, failure: state.failure, stream: state.stream, retry }
}
